import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  Checkbox,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { appSettings, shops } from "../db/schema";
import { getOrCreateSettings } from "../services/shopify/app-settings.server";
import { ensureShop } from "../services/shopify/shops.server";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const settings = await getOrCreateSettings(shop.id);

  let contactEmail = settings.notifyEmail ?? "";
  let storeTimezone = shop.timezone ?? "UTC";

  try {
    const res = await admin.graphql(`#graphql
      query {
        shop {
          email
          contactEmail
          ianaTimezone
        }
      }`);
    const json = await res.json();
    const shopData = json.data?.shop;
    if (!contactEmail) {
      contactEmail = shopData?.contactEmail || shopData?.email || "";
    }
    if (shopData?.ianaTimezone) {
      storeTimezone = String(shopData.ianaTimezone);
    }
    // Always keep store timezone in sync with Shopify
    if (storeTimezone && storeTimezone !== shop.timezone) {
      await db
        .update(shops)
        .set({ timezone: storeTimezone, updatedAt: new Date() })
        .where(eq(shops.id, shop.id));
    }
    if (contactEmail && contactEmail !== settings.notifyEmail) {
      await db
        .update(appSettings)
        .set({ notifyEmail: contactEmail, updatedAt: new Date() })
        .where(eq(appSettings.id, settings.id));
    }
  } catch {
    /* ignore GraphQL errors */
  }

  return {
    timezone: storeTimezone,
    notifyEmail: contactEmail,
    autoFixEnabled: settings.autoFixEnabled ?? false,
    installedAt: shop.installedAt
      ? new Date(shop.installedAt).toISOString()
      : null,
    shopDomain: shop.shopDomain,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const form = await request.formData();
  const notifyEmail = String(form.get("notifyEmail") ?? "").trim();
  const autoFixEnabled = form.get("autoFixEnabled") === "on";

  const settings = await getOrCreateSettings(shop.id);
  await db
    .update(appSettings)
    .set({
      notifyEmail: notifyEmail || null,
      autoFixEnabled,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, settings.id));

  return { ok: true };
};

export default function SettingsGeneralPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [email, setEmail] = useState(data.notifyEmail);
  const [autoFix, setAutoFix] = useState(data.autoFixEnabled);

  return (
    <Page>
      <TitleBar title="Settings — General" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="400">
        {fetcher.data?.ok && <Banner tone="success">Settings saved.</Banner>}
        <fetcher.Form method="post">
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Store
              </Text>
              <Text as="p" tone="subdued">
                {data.shopDomain}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Installed:{" "}
                {data.installedAt
                  ? new Date(data.installedAt).toLocaleString()
                  : "—"}
              </Text>
              <Banner tone="info">
                Timezone is set automatically from your Shopify store:{" "}
                <strong>{data.timezone}</strong>
              </Banner>
              <Divider />
              <Text as="h2" variant="headingMd">
                Notifications
              </Text>
              <TextField
                label="Notification email"
                name="notifyEmail"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                helpText="Defaults to your Shopify contact email. Report cadence follows your plan (weekly / daily)."
              />
              <Checkbox
                label="Auto-fix low-risk issues (when available)"
                name="autoFixEnabled"
                checked={autoFix}
                onChange={setAutoFix}
              />
              <Button submit variant="primary" loading={fetcher.state !== "idle"}>
                Save
              </Button>
            </BlockStack>
          </Card>
        </fetcher.Form>
      </BlockStack>
    </Page>
  );
}
