import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logWebhook } from "../services/shopify/webhook-log.server";

/**
 * Mandatory compliance webhook: customers/data_request
 * Merchant/customer requested export of customer data this app may hold.
 * CorePilot stores little/no customer PII — acknowledge + log for audit.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  try {
    await logWebhook({ shopDomain: shop, topic, payload, status: "ok" });
  } catch (error) {
    await logWebhook({
      shopDomain: shop,
      topic,
      payload,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
  return new Response();
};
