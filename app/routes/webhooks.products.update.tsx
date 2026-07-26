import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shopify/shops.server";
import { logWebhook } from "../services/shopify/webhook-log.server";
import { scanSingleProduct } from "../services/scanners/product-scanner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  try {
    const shopRow = await ensureShop(shop);
    const productId = (payload as { admin_graphql_api_id?: string })
      ?.admin_graphql_api_id;
    if (admin && productId) {
      await scanSingleProduct(shopRow.id, admin, productId);
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
    throw error;
  }
  return new Response();
};
