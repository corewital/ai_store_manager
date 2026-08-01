import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logWebhook } from "../services/shopify/webhook-log.server";

/**
 * Mandatory compliance webhook: customers/redact
 * Request to delete customer data. App does not retain customer profiles;
 * acknowledge + log so Partner review / GDPR tooling can verify the endpoint.
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
