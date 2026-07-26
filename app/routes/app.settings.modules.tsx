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
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
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
import { ensureShop } from "../services/shopify/shops.server";
import { getShopPlan } from "../services/shopify/billing.server";
import { isPlanFeatureEnabled } from "../services/shopify/plan-gate.server";
import { PLANS } from "../config/plans";

const LABELS: Record<string, string> = {
  products: "Products (titles, SKU, descriptions)",
  seo: "SEO (meta title/description length)",
  images: "Images (alt text, missing media)",
  inventory: "Inventory",
  collections: "Collections (description & metadata)",
  navigation: "Navigation",
  theme: "Theme",
  apps: "Apps",
  performance: "Performance",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const [master, enabled, plan] = await Promise.all([
    getModuleVisibility(),
    getShopModulesEnabledRaw(shop.id),
    getShopPlan(shop.id),
  ]);

  const planAllowed: Record<string, boolean> = {};
  for (const m of SCAN_MODULE_KEYS) {
    const key = `module_${m}`;
    planAllowed[m] = await isPlanFeatureEnabled(plan, key);
  }

  return {
    master,
    enabled,
    plan,
    planName: PLANS[plan]?.name ?? plan,
    planAllowed,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const plan = await getShopPlan(shop.id);

  const form = await request.formData();
  const enabled: Record<string, boolean> = {};
  for (const m of SCAN_MODULE_KEYS) {
    const planOk = await isPlanFeatureEnabled(plan, `module_${m}`);
    // Locked plan modules stay off; others follow checkbox
    enabled[m] = planOk && form.get(m) === "on";
  }
  await saveShopModulesEnabled(shop.id, enabled);
  return { ok: true };
};

export default function SettingsModulesPage() {
  const { enabled, master, planName, planAllowed } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [state, setState] = useState(enabled);

  const visible = SCAN_MODULE_KEYS.filter(
    (m) => master[m as keyof AppModuleVisibility] !== false,
  );

  return (
    <Page>
      <TitleBar title="Settings — Modules" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="400">
        {fetcher.data?.ok && (
          <Banner tone="success">
            Modules saved. Queue Scan and cron only run enabled scanners.
          </Banner>
        )}
        <Banner tone="info">
          Your plan: <strong>{planName}</strong>. Locked modules need an upgrade.
          Unlocked ones can be toggled for Queue Scan.
        </Banner>
        <fetcher.Form method="post">
          <Card>
            <BlockStack gap="300">
              {visible.length === 0 && (
                <Banner tone="warning">
                  No modules available — Admin Core disabled all health modules.
                </Banner>
              )}
              {visible.map((m) => {
                const allowed = planAllowed[m] !== false;
                return (
                  <InlineStack key={m} align="space-between" blockAlign="center">
                    <Checkbox
                      label={LABELS[m] || m}
                      name={m}
                      checked={allowed && state[m as ScanModuleKey] !== false}
                      disabled={!allowed}
                      onChange={(v) =>
                        setState((s) => ({ ...s, [m]: v }))
                      }
                    />
                    {!allowed && (
                      <Badge tone="attention">Upgrade plan</Badge>
                    )}
                  </InlineStack>
                );
              })}
              {SCAN_MODULE_KEYS.filter(
                (m) => master[m as keyof AppModuleVisibility] === false,
              ).map((m) => (
                <input key={m} type="hidden" name={m} value="" />
              ))}
              <Button
                url="/app/settings/billing"
                variant="plain"
              >
                View plans & upgrade
              </Button>
              <Button
                submit
                variant="primary"
                loading={fetcher.state !== "idle"}
                disabled={visible.length === 0}
              >
                Save scanners
              </Button>
            </BlockStack>
          </Card>
        </fetcher.Form>
      </BlockStack>
    </Page>
  );
}
