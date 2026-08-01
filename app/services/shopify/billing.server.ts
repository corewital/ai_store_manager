import { eq } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { billingSubscriptions, shops } from "../../db/schema";
import { PLAN_RANK, PLANS, type PlanSlug } from "../../config/plans";

export { PLANS, formatPrice, type PlanSlug } from "../../config/plans";

const TRIAL_DAYS = 7;

/** Subscription display name — must include [slug] for reliable sync. */
export function subscriptionNameFor(plan: PlanSlug) {
  const def = PLANS[plan];
  return `CorePilot AI ${def.name} [${plan}]`;
}

export function planFromSubscriptionName(name: string): PlanSlug | null {
  const lower = name.toLowerCase();
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

function formatBillingError(error: unknown): string {
  if (error instanceof Error) return error.message || "Billing request failed";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Billing request failed";
  }
}

function shouldUseTestCharge(appUrl: string, forceTest?: boolean): boolean {
  if (forceTest != null) return forceTest;
  if (process.env.BILLING_TEST === "true") return true;
  if (process.env.BILLING_TEST === "false") return false;
  // Dev tunnels / local always use test charges (no real money)
  try {
    const host = new URL(appUrl).hostname;
    if (
      host.includes("localhost") ||
      host.includes("trycloudflare.com") ||
      host.includes("ngrok") ||
      host.endsWith(".vercel.app")
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV !== "production";
}

async function isPartnerDevelopmentStore(admin: AdminApiContext): Promise<boolean> {
  try {
    const res = await admin.graphql(`#graphql
      query {
        shop {
          plan { partnerDevelopment displayName }
        }
      }`);
    const json = await res.json();
    const plan = json.data?.shop?.plan;
    if (plan?.partnerDevelopment) return true;
    const name = String(plan?.displayName ?? "").toLowerCase();
    return name.includes("development") || name.includes("partner");
  } catch {
    return false;
  }
}

/**
 * Creates a Shopify AppSubscription via GraphQL (API billing).
 * Requires Partner Dashboard → Distribution → Public (even before App Store listing).
 * Merchant must approve the confirmationUrl (opens outside the embedded iframe).
 */
export async function createSubscription(
  admin: AdminApiContext,
  shopId: number,
  plan: PlanSlug,
  appUrl: string,
  isTest?: boolean,
): Promise<SubscribeResult> {
  const definition = PLANS[plan];

  if (definition.priceCents === 0) {
    await cancelSubscription(admin, shopId);
    await upsertSubscription({
      shopId,
      plan: "free",
      status: "active",
      planSource: "shopify",
    });
    return { ok: true, confirmationUrl: null, plan };
  }

  if (definition.priceCents < 0) {
    return {
      ok: false,
      error: "Enterprise plans require contacting support.",
    };
  }

  const returnUrl = `${appUrl.replace(/\/$/, "")}/app/settings/billing?confirmed=${plan}`;
  if (!/^https:\/\//i.test(returnUrl)) {
    return {
      ok: false,
      error: `Billing return URL must be HTTPS. Got: ${returnUrl}`,
    };
  }

  const partnerDev = await isPartnerDevelopmentStore(admin);
  const test = shouldUseTestCharge(appUrl, isTest) || partnerDev;

  try {
    const res = await admin.graphql(
      `#graphql
      mutation CreateSubscription(
        $name: String!
        $returnUrl: URL!
        $trialDays: Int
        $test: Boolean
        $lineItems: [AppSubscriptionLineItemInput!]!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          trialDays: $trialDays
          test: $test
          lineItems: $lineItems
        ) {
          confirmationUrl
          appSubscription { id status }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          name: subscriptionNameFor(plan),
          returnUrl,
          trialDays: TRIAL_DAYS,
          test,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    // Shopify Decimal — string is the safest wire format
                    amount: (definition.priceCents / 100).toFixed(2),
                    currencyCode: "USD",
                  },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        },
      },
    );

    const json = (await res.json()) as {
      data?: {
        appSubscriptionCreate?: {
          confirmationUrl?: string | null;
          appSubscription?: { id?: string; status?: string } | null;
          userErrors?: { field?: string[]; message: string }[];
        };
      };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join("; ");
      return { ok: false, error: humanizeBillingApiError(msg) };
    }

    const result = json.data?.appSubscriptionCreate;
    const errors = result?.userErrors ?? [];
    if (errors.length) {
      return {
        ok: false,
        error: humanizeBillingApiError(errors.map((e) => e.message).join("; ")),
      };
    }

    if (!result?.confirmationUrl) {
      return {
        ok: false,
        error:
          "Shopify did not return a confirmation URL. Set Partner Dashboard → Distribution → Public, and use test charges on a development store.",
      };
    }

    await upsertSubscription({
      shopId,
      plan,
      status: "pending",
      shopifySubscriptionId: result.appSubscription?.id ?? null,
      planSource: "shopify",
    });

    return { ok: true, confirmationUrl: result.confirmationUrl, plan };
  } catch (error) {
    console.error("[billing] appSubscriptionCreate failed", error);
    return {
      ok: false,
      error: humanizeBillingApiError(formatBillingError(error)),
    };
  }
}

function humanizeBillingApiError(msg: string): string {
  const m = msg.toLowerCase();
  if (
    m.includes("public distribution") ||
    m.includes("without a public") ||
    m.includes("billing api")
  ) {
    return (
      "Shopify Billing API blocked: open Partners → your app → Distribution → " +
      "choose Public distribution (you do not need to publish to the App Store yet). " +
      "Original: " +
      msg
    );
  }
  if (m.includes("test") && m.includes("development")) {
    return (
      "Use a development store and test charges. Original: " + msg
    );
  }
  return msg || "Could not create Shopify subscription. Try again.";
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
