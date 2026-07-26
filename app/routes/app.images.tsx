import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { IssueListPage } from "../components/IssueListPage";
import { ensureShop } from "../services/shopify/shops.server";
import { getOrCreateSettings } from "../services/shopify/app-settings.server";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const modules = await requireAppModule("images");
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const settings = await getOrCreateSettings(shop.id);
  return {
    shopDomain: session.shop,
    modules,
    lastScannedAt: settings.lastScannedAt
      ? new Date(settings.lastScannedAt).toISOString()
      : null,
  };
};

export default function ImagesPage() {
  const { shopDomain, lastScannedAt, modules } = useLoaderData<typeof loader>();
  return (
    <IssueListPage
      title="Image Auditor"
      table="imageIssues"
      module="images"
      shopDomain={shopDomain}
      field="alt"
      fieldLabel="Alt text"
      showImage
      fixLabel="Optimize"
      lastScannedAt={lastScannedAt}
      modules={modules}
    />
  );
}
