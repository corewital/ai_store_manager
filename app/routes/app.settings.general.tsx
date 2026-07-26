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
  Select,
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

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
].map((z) => ({ label: z, value: z }));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const settings = await getOrCreateSettings(shop.id);

  let contactEmail = settings.notifyEmail ?? "";
  if (!contactEmail) {
    try {
      const res = await admin.graphql(`#graphql
        query { shop { email contactEmail } }`);
      const json = await res.json();
      contactEmail =
        json.data?.shop?.contactEmail || json.data?.shop?.email || "";
      if (contactEmail) {
        await db
          .update(appSettings)
          .set({ notifyEmail: contactEmail, updatedAt: new Date() })
          .where(eq(appSettings.id, settings.id));
      }
    } catch {
      /* ignore */
    }
  }

  return {
    timezone: shop.timezone ?? "UTC",
    notifyEmail: contactEmail,
    notifyFrequency: settings.notifyFrequency ?? "daily",
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
  const timezone = String(form.get("timezone") ?? "UTC");
  const notifyEmail = String(form.get("notifyEmail") ?? "").trim();
  const notifyFrequency = String(form.get("notifyFrequency") ?? "daily");
  const autoFixEnabled = form.get("autoFixEnabled") === "on";

  await db
    .update(shops)
    .set({ timezone, updatedAt: new Date() })
    .where(eq(shops.id, shop.id));
  const settings = await getOrCreateSettings(shop.id);
  await db
    .update(appSettings)
    .set({
      notifyEmail: notifyEmail || null,
      notifyFrequency,
      autoFixEnabled,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, settings.id));

  return { ok: true };
};

export default function SettingsGeneralPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [tz, setTz] = useState(data.timezone);
  const [email, setEmail] = useState(data.notifyEmail);
  const [freq, setFreq] = useState(data.notifyFrequency);
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
              <Select
                label="Timezone"
                name="timezone"
                options={TIMEZONES}
                value={tz}
                onChange={setTz}
                helpText="Used for scan scheduling and report send times."
              />
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
                helpText="Defaults to your Shopify contact email."
              />
              <Select
                label="Report frequency"
                name="notifyFrequency"
                options={[
                  { label: "Daily", value: "daily" },
                  { label: "Weekly", value: "weekly" },
                  { label: "Off", value: "off" },
                ]}
                value={freq}
                onChange={setFreq}
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
