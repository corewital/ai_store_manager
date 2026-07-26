import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Checkbox,
  Button,
  Banner,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";
import { getModuleVisibility } from "../services/admin/module-visibility.server";
import {
  getShopModulesEnabledRaw,
  saveShopModulesEnabled,
} from "../services/shopify/effective-modules.server";
import {
  SCAN_MODULE_KEYS,
  type ScanModuleKey,
} from "../services/shopify/scan-modules";
import type { AppModuleVisibility } from "../services/admin/module-visibility";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });
  const master = await getModuleVisibility();
  if (!shop) {
    return {
      master,
      enabled: Object.fromEntries(SCAN_MODULE_KEYS.map((m) => [m, true])),
    };
  }
  const enabled = await getShopModulesEnabledRaw(shop.id);
  return { master, enabled };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });
  if (!shop) return { ok: false };

  const form = await request.formData();
  const enabled = Object.fromEntries(
    SCAN_MODULE_KEYS.map((m) => [m, form.get(m) === "on"]),
  );
  await saveShopModulesEnabled(shop.id, enabled);
  return { ok: true };
};

export default function SettingsModulesPage() {
  const { enabled, master } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [state, setState] = useState(enabled);

  const available = SCAN_MODULE_KEYS.filter(
    (m) => master[m as keyof AppModuleVisibility] !== false,
  );

  return (
    <Page>
      <TitleBar title="Settings — Modules" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="400">
        {fetcher.data?.ok && (
          <Banner tone="success">
            Modules saved. Daily / queued scans will only run enabled modules.
          </Banner>
        )}
        <fetcher.Form method="post">
          <Card>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                Toggle which scanners run on Queue Scan and cron. Modules turned
                off by Admin Core are hidden here and never scanned.
              </Text>
              {available.length === 0 && (
                <Banner tone="warning">
                  No modules are available — your admin disabled all health
                  modules.
                </Banner>
              )}
              {available.map((m) => (
                <Checkbox
                  key={m}
                  label={m.charAt(0).toUpperCase() + m.slice(1)}
                  name={m}
                  checked={state[m as ScanModuleKey] !== false}
                  onChange={(v) =>
                    setState((s) => ({ ...s, [m]: v }))
                  }
                />
              ))}
              {/* Keep admin-hidden keys submitted as off */}
              {SCAN_MODULE_KEYS.filter(
                (m) => master[m as keyof AppModuleVisibility] === false,
              ).map((m) => (
                <input key={m} type="hidden" name={m} value="" />
              ))}
              <Button
                submit
                variant="primary"
                loading={fetcher.state !== "idle"}
                disabled={available.length === 0}
              >
                Save
              </Button>
            </BlockStack>
          </Card>
        </fetcher.Form>
      </BlockStack>
    </Page>
  );
}
