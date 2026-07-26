import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { eq } from "drizzle-orm";

import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { parseDatatableParams } from "../services/admin/datatable.server";
import { fetchMerchantDatatable } from "../services/merchant/datatable.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  let shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });
  if (!shop) shop = await ensureShop(session.shop);

  const data = await fetchMerchantDatatable(
    params.table!,
    shop.id,
    parseDatatableParams(new URL(request.url)),
  );
  return json(data);
}
