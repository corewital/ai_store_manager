import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shopify/shops.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  try {
    await ensureShop(session.shop, session.accessToken);
  } catch (error) {
    console.error("[auth.$] ensureShop:", error);
  }
  return null;
};
