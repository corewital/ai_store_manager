import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Shop/install bootstrap runs in afterAuth + session storage — do not
  // call ensureShop here (that caused duplicate app_installs rows).
  await authenticate.admin(request);
  return null;
};
