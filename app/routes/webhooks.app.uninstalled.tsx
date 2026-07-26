import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { markShopUninstalled } from "../services/shopify/shops.server";
import { logWebhook } from "../services/shopify/webhook-log.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  try {
    await markShopUninstalled(shop);
    await logWebhook({ shopDomain: shop, topic, payload });
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
