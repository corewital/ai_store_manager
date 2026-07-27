import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  Button,
  Banner,
  InlineStack,
  Badge,
  List,
  Divider,
  Layout,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { PLANS, formatPrice, type PlanSlug } from "../config/plans";
import {
  activateConfirmedPlan,
  createSubscription,
  syncSubscription,
} from "../services/shopify/billing.server";
import { ensureShop } from "../services/shopify/shops.server";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";
import {
  getPlanUsage,
  getPlanLimit,
} from "../services/shopify/plan-gate.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const confirmed = url.searchParams.get("confirmed");
  if (confirmed && confirmed in PLANS && confirmed !== "enterprise") {
    // Merchant returned from Shopify charge approval
    await activateConfirmedPlan(shop.id, confirmed as PlanSlug);
  }

  const plan = await syncSubscription(admin, shop.id);
  const usage = await getPlanUsage(shop.id);
  const [productLimit, aiLimit, scanLimit] = await Promise.all([
    getPlanLimit(plan, "products_limit"),
    getPlanLimit(plan, "ai_fixes_limit"),
    getPlanLimit(plan, "manual_scans_limit"),
  ]);
  return {
    plan,
    shopDomain: session.shop,
    usage,
    limits: { productLimit, aiLimit, scanLimit },
    billingTest: process.env.NODE_ENV !== "production",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const plan = String((await request.formData()).get("plan") ?? "");
  if (!(plan in PLANS)) return { ok: false as const, error: "invalid_plan" };
  if (plan === "enterprise") {
    return { ok: false as const, error: "Contact support for Enterprise." };
  }

  // Prefer the live request origin (current tunnel / domain) — not a stale .env tunnel
  const appUrl =
    new URL(request.url).origin ||
    process.env.SHOPIFY_APP_URL ||
    "https://corepilotai.corewital.com";

  const result = await createSubscription(
    admin,
    shop.id,
    plan as PlanSlug,
    appUrl,
  );

  if (!result.ok) return { ok: false as const, error: result.error };
  // Return URL to client — fetcher cannot navigate top-level to Shopify approve page
  return {
    ok: true as const,
    plan: result.plan,
    confirmationUrl: result.confirmationUrl,
  };
};

export default function SettingsBillingPage() {
  const { plan: currentPlan, shopDomain, usage, limits, billingTest } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params] = useSearchParams();
  const confirmed = params.get("confirmed");
  const need = params.get("need");
  const activePlan = (currentPlan in PLANS ? currentPlan : "free") as PlanSlug;

  // Open Shopify charge approval outside the embedded iframe
  useEffect(() => {
    const url = fetcher.data && "confirmationUrl" in fetcher.data
      ? fetcher.data.confirmationUrl
      : null;
    if (fetcher.data?.ok && url) {
      window.open(url, "_top");
    }
  }, [fetcher.data]);

  return (
    <Page>
      <TitleBar title="Plans & Billing" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="500">
        {need && (
          <Banner tone="warning">
            “{need}” needs a higher plan. Upgrade below to unlock it.
          </Banner>
        )}
        {confirmed && (
          <Banner tone="success">
            Subscription confirmed. You are on the{" "}
            {PLANS[activePlan]?.name ?? confirmed} plan.
          </Banner>
        )}
        {fetcher.data && !fetcher.data.ok && (
          <Banner tone="critical">
            <p>
              <strong>Upgrade failed</strong>
            </p>
            <p>{(fetcher.data as { error?: string }).error}</p>
            <p>
              Quick fix: Partners → CorePilot AI → <strong>Distribution</strong>{" "}
              → select <strong>Public distribution</strong> (no App Store submit
              needed). Then retry Upgrade. For demos, use Admin → Installs →
              Plan override.
            </p>
          </Banner>
        )}
        {fetcher.data?.ok && fetcher.data.confirmationUrl && (
          <Banner tone="info">
            Opening Shopify to approve the charge… If nothing opens,{" "}
            <a href={fetcher.data.confirmationUrl} target="_top" rel="noreferrer">
              click here to approve
            </a>
            .
          </Banner>
        )}
        {billingTest && (
          <Banner tone="info">
            Dev mode: upgrades create a <strong>test</strong> charge (no real
            money). Approve it on the Shopify charge page to activate the plan.
          </Banner>
        )}

        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Current plan
              </Text>
              <Badge tone="success">{PLANS[activePlan].name}</Badge>
            </InlineStack>
            <Text as="p" tone="subdued">
              Billed through Shopify for {shopDomain}.
            </Text>
            <Text as="p" variant="bodySm">
              Usage — AI fixes: {usage.aiFixesUsed}
              {limits.aiLimit != null ? ` / ${limits.aiLimit}` : ""} · Manual
              scans: {usage.manualScansUsed}
              {limits.scanLimit != null ? ` / ${limits.scanLimit}` : ""} ·
              Product cap: {limits.productLimit ?? "Unlimited"}
            </Text>
          </BlockStack>
        </Card>

        <Layout>
          {(Object.keys(PLANS) as PlanSlug[]).map((slug) => {
            const p = PLANS[slug];
            const isCurrent = slug === activePlan;
            const isEnterprise = p.priceCents < 0;
            const curPrice = Math.max(PLANS[activePlan].priceCents, 0);
            const isUpgrade = !isEnterprise && p.priceCents > curPrice;
            return (
              <Layout.Section key={slug} variant="oneHalf">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd">
                        {p.name}
                      </Text>
                      {isCurrent && <Badge tone="success">Current</Badge>}
                    </InlineStack>
                    <Text as="p" variant="headingLg">
                      {formatPrice(p.priceCents)}
                    </Text>
                    <Text as="p" tone="subdued">
                      {p.productLimit
                        ? `Up to ${p.productLimit} products · ${p.collectionLimit} collections`
                        : "Unlimited products & collections"}
                    </Text>
                    <Divider />
                    <List type="bullet">
                      {p.features.map((f) => (
                        <List.Item key={f}>{f}</List.Item>
                      ))}
                    </List>
                    {isCurrent ? (
                      <Button disabled fullWidth>
                        Current plan
                      </Button>
                    ) : isEnterprise ? (
                      <Button url="/app/support" fullWidth>
                        Contact support
                      </Button>
                    ) : (
                      <fetcher.Form method="post">
                        <input type="hidden" name="plan" value={slug} />
                        <Button
                          submit
                          fullWidth
                          variant={isUpgrade ? "primary" : "secondary"}
                          loading={fetcher.state !== "idle"}
                        >
                          {isUpgrade ? "Upgrade" : "Switch"} to {p.name}
                        </Button>
                      </fetcher.Form>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            );
          })}
        </Layout>
      </BlockStack>
    </Page>
  );
}
