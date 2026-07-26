import type { ActionFunctionArgs } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { authenticate } from "../../shopify.server";
import { db } from "../../db/client";
import { shops } from "../../db/schema";
import { ensureShop } from "./shops.server";
import { runModuleFix } from "./module-fix.server";

export async function merchantFixAction(
  request: ActionFunctionArgs["request"],
  module: string,
) {
  const { session, admin } = await authenticate.admin(request);
  let shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });
  if (!shop) shop = await ensureShop(session.shop, session.accessToken);
  const issueId = Number((await request.formData()).get("issueId"));
  return runModuleFix(admin, shop.id, module, issueId);
}
