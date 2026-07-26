import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { Banner, BlockStack, Card, Page, Text } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { ensureShop } from "../services/shopify/shops.server";
import { getModuleVisibility } from "../services/admin/module-visibility.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const modules = await getModuleVisibility();
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    frozen: Boolean(shop.frozenAt),
    shopDomain: shop.shopDomain,
    modules,
  };
};

export default function App() {
  const { apiKey, frozen, shopDomain, modules } = useLoaderData<typeof loader>();

  if (frozen) {
    return (
      <AppProvider isEmbeddedApp apiKey={apiKey}>
        <Page title="App frozen">
          <Card>
            <BlockStack gap="300">
              <Banner tone="warning" title="This store is frozen">
                <p>
                  Admin Core has frozen <strong>{shopDomain}</strong>. Scans and
                  merchant features are paused until an admin clicks{" "}
                  <strong>Unfreeze</strong> on the installs page.
                </p>
              </Banner>
              <Text as="p" tone="subdued">
                Contact your CorePilot admin if you need access restored.
              </Text>
            </BlockStack>
          </Card>
        </Page>
      </AppProvider>
    );
  }

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Dashboard
        </Link>
        {modules.health !== false && (
          <Link to="/app/health">Store Health</Link>
        )}
        {(modules.reports !== false || modules.fixes !== false) && (
          <Link to="/app/reports">Reports &amp; Fixes</Link>
        )}
        {modules.assistant !== false && (
          <Link to="/app/assistant">AI Assistant</Link>
        )}
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      <Outlet context={{ modules }} />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
