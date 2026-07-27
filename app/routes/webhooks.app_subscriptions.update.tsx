import type { ActionFunctionArgs } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import { logWebhook } from "../services/shopify/webhook-log.server";
import { upsertSubscription, planFromSubscriptionName } from "../services/shopify/billing.server";
import { PLANS, type PlanSlug } from "../config/plans";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    const sub = (payload as { app_subscription?: Record<string, unknown> })
      .app_subscription;
    const row = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, shop),
    });

    if (row && sub) {
      const name = String(sub.name ?? "");
      const plan =
        planFromSubscriptionName(name) ??
        ((Object.keys(PLANS) as PlanSlug[]).find((k) =>
          name.toLowerCase().includes(k),
        ) ?? "free");
      const status = String(sub.status ?? "").toLowerCase();

      await upsertSubscription({
        shopId: row.id,
        plan: status === "active" ? plan : "free",
        status,
        shopifySubscriptionId: (sub.admin_graphql_api_id as string) ?? null,
        planSource: "shopify",
      });
    }

    await logWebhook({ shopDomain: shop, topic, payload });
  } catch (error) {
    await logWebhook({
      shopDomain: shop,
      topic,
      status: "error",
      payload,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return new Response();
};
