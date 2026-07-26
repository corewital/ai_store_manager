import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shopify/shops.server";
import { logWebhook } from "../services/shopify/webhook-log.server";
import { flagOrderInventory } from "../services/scanners/inventory-scanner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  try {
    const shopRow = await ensureShop(shop);
    await flagOrderInventory(shopRow.id, payload);
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
