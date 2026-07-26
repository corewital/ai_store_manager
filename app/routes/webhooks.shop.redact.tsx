import type { ActionFunctionArgs } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import { logWebhook } from "../services/shopify/webhook-log.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  try {
    await db
      .update(shops)
      .set({ deletedAt: new Date(), updatedAt: new Date(), accessToken: null })
      .where(eq(shops.shopDomain, shop));
    await logWebhook({ shopDomain: shop, topic, payload, status: "ok" });
  } catch (error) {
    await logWebhook({
      shopDomain: shop,
      topic,
      status: "error",
      payload,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return new Response();
};
