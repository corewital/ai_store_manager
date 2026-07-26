import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Banner, Card, Text, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";

/** Team feature flagged off — keep route for later. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function SettingsTeamPage() {
  return (
    <Page>
      <TitleBar title="Settings — Team" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="400">
        <Banner tone="info" title="Coming soon">
          Team invites are temporarily unavailable. Multi-user access will return
          in a later release.
        </Banner>
        <Card>
          <Text as="p" tone="subdued">
            This page is hidden from the main navigation until the feature is
            ready.
          </Text>
        </Card>
      </BlockStack>
    </Page>
  );
}
