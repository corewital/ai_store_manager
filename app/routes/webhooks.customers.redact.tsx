import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logWebhook } from "../services/shopify/webhook-log.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  await logWebhook({ shopDomain: shop, topic, payload, status: "ok" });
  return new Response();
};
