import type { ActionFunctionArgs } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import { logWebhook } from "../services/shopify/webhook-log.server";

/**
 * Mandatory App Store compliance webhooks (single endpoint).
 * Topics: customers/data_request, customers/redact, shop/redact
 * @see https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 *
 * authenticate.webhook verifies HMAC — invalid HMAC → 401 (required by Shopify).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const normalized = String(topic || "")
    .toUpperCase()
    .replace(/\//g, "_");

  try {
    if (normalized === "SHOP_REDACT") {
      await db
        .update(shops)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
          accessToken: null,
        })
        .where(eq(shops.shopDomain, shop));
    }
    // customers/data_request + customers/redact: app stores little/no customer PII.
    // Acknowledge with 200; payload is logged for audit.
    await logWebhook({ shopDomain: shop, topic, payload, status: "ok" });
  } catch (error) {
    await logWebhook({
      shopDomain: shop,
      topic,
      payload,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    // Still return 200 after logging so Shopify doesn't keep retrying forever
    // for transient DB issues on data_request/redact (shop/redact should retry).
    if (normalized === "SHOP_REDACT") throw error;
  }

  return new Response();
};
