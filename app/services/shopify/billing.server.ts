import { eq } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { billingSubscriptions, shops } from "../../db/schema";
import { PLAN_RANK, PLANS, type PlanSlug } from "../../config/plans";

export { PLANS, formatPrice, type PlanSlug } from "../../config/plans";

const TRIAL_DAYS = 7;

export async function getShopPlan(shopId: number): Promise<PlanSlug> {
  const sub = await db.query.billingSubscriptions.findFirst({
    where: eq(billingSubscriptions.shopId, shopId),
  });
  if (sub && sub.status === "active" && sub.plan in PLANS) {
    return sub.plan as PlanSlug;
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

  await db
    .update(shops)
    .set({
      plan: input.status === "active" ? input.plan : "free",
      updatedAt: new Date(),
    })
    .where(eq(shops.id, input.shopId));
}

export type SubscribeResult =
  | { ok: true; confirmationUrl: string | null; plan: PlanSlug }
  | { ok: false; error: string };

/** Creates a real Shopify recurring charge and returns its confirmation URL. */
export async function createSubscription(
  admin: AdminApiContext,
  shopId: number,
  plan: PlanSlug,
  appUrl: string,
  isTest = process.env.NODE_ENV !== "production",
): Promise<SubscribeResult> {
  const definition = PLANS[plan];

  if (definition.priceCents === 0) {
    await cancelSubscription(admin, shopId);
    await upsertSubscription({ shopId, plan: "free", status: "active" });
    return { ok: true, confirmationUrl: null, plan };
  }

  if (definition.priceCents < 0) {
    return {
      ok: false,
      error: "Enterprise plans require contacting support.",
    };
  }

  const returnUrl = `${appUrl}/app/settings/billing?confirmed=${plan}`;

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
          name: `${definition.name} plan`,
          returnUrl,
          trialDays: TRIAL_DAYS,
          test: isTest,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: definition.priceCents / 100,
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

    const json = await res.json();
    const result = json.data?.appSubscriptionCreate;
    const errors = result?.userErrors ?? [];
    if (errors.length) {
      return { ok: false, error: errors[0].message ?? "billing_error" };
    }

    await upsertSubscription({
      shopId,
      plan,
      status: "pending",
      shopifySubscriptionId: result?.appSubscription?.id ?? null,
    });

    return { ok: true, confirmationUrl: result?.confirmationUrl ?? null, plan };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "billing_error",
    };
  }
}

/** Reads live subscriptions and syncs the local record. */
export async function syncSubscription(
  admin: AdminApiContext,
  shopId: number,
): Promise<PlanSlug> {
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
      await upsertSubscription({ shopId, plan: "free", status: "cancelled" });
      return "free";
    }

    const slug = (Object.keys(PLANS) as PlanSlug[]).find((k) =>
      String(active.name ?? "").toLowerCase().includes(k),
    );
    if (!slug) return getShopPlan(shopId);

    await upsertSubscription({
      shopId,
      plan: slug,
      status: "active",
      shopifySubscriptionId: active.id,
      currentPeriodEnd: active.currentPeriodEnd
        ? new Date(active.currentPeriodEnd)
        : null,
    });
    return slug;
  } catch {
    return getShopPlan(shopId);
  }
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
