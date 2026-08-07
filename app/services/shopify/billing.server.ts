import { eq } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { billingSubscriptions, shops } from "../../db/schema";
import { PLAN_RANK, PLANS, type PlanSlug } from "../../config/plans";

export { PLANS, formatPrice, type PlanSlug } from "../../config/plans";

/** Subscription display name — must include [slug] for reliable sync. */
export function subscriptionNameFor(plan: PlanSlug) {
  const def = PLANS[plan];
  return `CorePilot AI ${def.name} [${plan}]`;
}

export function planFromSubscriptionName(name: string): PlanSlug | null {
  const lower = name.toLowerCase().trim();
  // Exact handle match first (Shopify App Pricing plan_handle)
  if (lower in PLANS) return lower as PlanSlug;
  const bracket = lower.match(/\[([a-z_]+)\]/);
  if (bracket && bracket[1] in PLANS) return bracket[1] as PlanSlug;
  return (
    (Object.keys(PLANS) as PlanSlug[]).find((k) => lower.includes(k)) ?? null
  );
}

export async function getShopPlan(shopId: number): Promise<PlanSlug> {
  const sub = await db.query.billingSubscriptions.findFirst({
    where: eq(billingSubscriptions.shopId, shopId),
  });
  if (sub && sub.status === "active" && sub.plan in PLANS) {
    const slug = sub.plan as PlanSlug;
    // Keep shops.plan in sync — scans used to read shops.plan and miss upgrades
    const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
    if (shop && shop.plan !== slug) {
      await db
        .update(shops)
        .set({ plan: slug, updatedAt: new Date() })
        .where(eq(shops.id, shopId));
    }
    return slug;
  }
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  const plan = shop?.plan ?? "free";
  return plan in PLANS ? (plan as PlanSlug) : "free";
}

export async function upsertSubscription(input: {
  shopId: number;
  plan: string;
  status: string;
  shopifySubscriptionId?: string | null;
  currentPeriodEnd?: Date | null;
  planSource?: "shopify" | "admin";
}) {
  const existing = await db.query.billingSubscriptions.findFirst({
    where: eq(billingSubscriptions.shopId, input.shopId),
  });
  const values = {
    plan: input.plan,
    status: input.status,
    shopifySubscriptionId: input.shopifySubscriptionId ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(billingSubscriptions)
      .set(values)
      .where(eq(billingSubscriptions.id, existing.id));
  } else {
    await db
      .insert(billingSubscriptions)
      .values({ shopId: input.shopId, ...values });
  }

  const active = input.status === "active";
  await db
    .update(shops)
    .set({
      plan: active ? input.plan : input.planSource === "admin" ? input.plan : "free",
      planSource: input.planSource ?? "shopify",
      updatedAt: new Date(),
    })
    .where(eq(shops.id, input.shopId));
}

export type SubscribeResult =
  | { ok: true; confirmationUrl: string | null; plan: PlanSlug }
  | { ok: false; error: string };

/** App handle in Partner Dashboard / shopify.app.toml (used in Managed Pricing URLs). */
export function getShopifyAppHandle() {
  return (
    process.env.SHOPIFY_APP_HANDLE ||
    process.env.SHOPIFY_APP_HANDLE_NAME ||
    "corepilot-ai"
  ).trim();
}

/** Shopify-hosted plan picker (App Pricing / Managed Pricing). */
export function managedPricingUrl(shopDomain: string) {
  const storeHandle = shopDomain
    .replace(/\.myshopify\.com$/i, "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0];
  const appHandle = getShopifyAppHandle();
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/**
 * Start a plan change via Shopify App Pricing (Managed Pricing).
 * Billing API `appSubscriptionCreate` is blocked in this mode — open Shopify's
 * hosted plan page instead.
 *
 * @see https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing
 */
export async function createSubscription(
  _admin: AdminApiContext,
  shopId: number,
  plan: PlanSlug,
  _appUrl: string,
  _isTest?: boolean,
  shopDomain?: string,
): Promise<SubscribeResult> {
  const shop =
    shopDomain ||
    (await db.query.shops.findFirst({ where: eq(shops.id, shopId) }))
      ?.shopDomain;

  if (!shop) {
    return { ok: false, error: "Shop not found for billing redirect." };
  }

  return {
    ok: true,
    confirmationUrl: managedPricingUrl(shop),
    plan,
  };
}

/** After merchant approves charge, activate plan locally (also covered by webhook). */
export async function activateConfirmedPlan(shopId: number, plan: PlanSlug) {
  await upsertSubscription({
    shopId,
    plan,
    status: "active",
    planSource: "shopify",
  });
}

/** Reads live subscriptions and syncs the local record.
 *  Respects admin plan overrides (planSource=admin) so they are not wiped.
 */
export async function syncSubscription(
  admin: AdminApiContext,
  shopId: number,
): Promise<PlanSlug> {
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  if (shop?.planSource === "admin") {
    return getShopPlan(shopId);
  }

  try {
    const res = await admin.graphql(
      `#graphql
      query ActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions { id name status currentPeriodEnd }
        }
      }`,
    );
    const json = await res.json();
    const subs = json.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs.find(
      (s: { status: string }) => s.status === "ACTIVE",
    );

    if (!active) {
      // Keep pending local rows; don't force free if merchant is mid-checkout
      const pending = await db.query.billingSubscriptions.findFirst({
        where: eq(billingSubscriptions.shopId, shopId),
      });
      if (pending?.status === "pending") {
        return getShopPlan(shopId);
      }
      await upsertSubscription({
        shopId,
        plan: "free",
        status: "cancelled",
        planSource: "shopify",
      });
      return "free";
    }

    const slug = planFromSubscriptionName(String(active.name ?? "")) ?? "free";

    await upsertSubscription({
      shopId,
      plan: slug,
      status: "active",
      shopifySubscriptionId: active.id,
      currentPeriodEnd: active.currentPeriodEnd
        ? new Date(active.currentPeriodEnd)
        : null,
      planSource: "shopify",
    });
    return slug;
  } catch {
    return getShopPlan(shopId);
  }
}

/** Admin Core plan override — survives Shopify sync until cleared. */
export async function adminOverridePlan(shopId: number, plan: string) {
  const slug = plan in PLANS ? plan : "free";
  await upsertSubscription({
    shopId,
    plan: slug,
    status: "active",
    planSource: "admin",
  });
  return slug as PlanSlug;
}

export async function cancelSubscription(
  admin: AdminApiContext,
  shopId: number,
) {
  const sub = await db.query.billingSubscriptions.findFirst({
    where: eq(billingSubscriptions.shopId, shopId),
  });
  if (!sub?.shopifySubscriptionId) return;
  try {
    await admin.graphql(
      `#graphql
      mutation Cancel($id: ID!) {
        appSubscriptionCancel(id: $id) { userErrors { message } }
      }`,
      { variables: { id: sub.shopifySubscriptionId } },
    );
  } catch {
    /* already cancelled */
  }
}

export async function requireBilling(
  admin: AdminApiContext,
  shopId: number,
  minPlan: PlanSlug,
): Promise<{ ok: boolean; plan: PlanSlug; upgradeUrl?: string }> {
  const current = await getShopPlan(shopId);
  if (PLAN_RANK[current] >= PLAN_RANK[minPlan]) {
    return { ok: true, plan: current };
  }

  const synced = await syncSubscription(admin, shopId);
  if (PLAN_RANK[synced] >= PLAN_RANK[minPlan]) {
    return { ok: true, plan: synced };
  }

  return { ok: false, plan: synced, upgradeUrl: "/app/settings/billing" };
}
