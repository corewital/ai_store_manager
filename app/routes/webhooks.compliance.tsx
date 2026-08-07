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

/** Browser / health probes use GET — do not 500 (action-only routes throw). */
export const loader = async () =>
  new Response(
    JSON.stringify({
      ok: true,
      endpoint: "compliance",
      methods: ["POST"],
      topics: ["customers/data_request", "customers/redact", "shop/redact"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

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
    await logWebhook({ shopDomain: shop, topic, payload, status: "ok" });
  } catch (error) {
    await logWebhook({
      shopDomain: shop,
      topic,
      payload,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (normalized === "SHOP_REDACT") throw error;
  }

  return new Response();
};
