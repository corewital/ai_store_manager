import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page,
  Text,
  BlockStack,
  Button,
  Banner,
  InlineStack,
  Badge,
  ProgressBar,
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
import billingCss from "../styles/billing.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: billingCss },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const confirmed = url.searchParams.get("confirmed");
  if (confirmed && confirmed in PLANS && confirmed !== "enterprise") {
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
  return {
    ok: true as const,
    plan: result.plan,
    confirmationUrl: result.confirmationUrl,
  };
};

function usagePct(used: number, limit: number | null) {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default function SettingsBillingPage() {
  const { plan: currentPlan, shopDomain, usage, limits, billingTest } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params] = useSearchParams();
  const confirmed = params.get("confirmed");
  const need = params.get("need");
  const activePlan = (currentPlan in PLANS ? currentPlan : "free") as PlanSlug;
  const curPrice = Math.max(PLANS[activePlan].priceCents, 0);

  useEffect(() => {
    const url =
      fetcher.data && "confirmationUrl" in fetcher.data
        ? fetcher.data.confirmationUrl
        : null;
    if (fetcher.data?.ok && url) {
      window.open(url, "_top");
    }
  }, [fetcher.data]);

  const slugs = Object.keys(PLANS) as PlanSlug[];

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
              Quick fix: Partners → CorePilot AI → Distribution → Public
              distribution. Then retry Upgrade. For demos, use Admin → Installs →
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
            money).
          </Banner>
        )}

        <div className="cp-billing-hero">
          <div className="cp-billing-hero__glow" aria-hidden />
          <div className="cp-billing-hero__content">
            <Text as="p" variant="bodySm" tone="subdued">
              Billed through Shopify · {shopDomain}
            </Text>
            <InlineStack gap="300" blockAlign="center" wrap>
              <Text as="h2" variant="headingXl">
                {PLANS[activePlan].name}
              </Text>
              <Badge tone="success">Current plan</Badge>
            </InlineStack>
            <Text as="p" variant="headingLg">
              {formatPrice(PLANS[activePlan].priceCents)}
            </Text>
            <div className="cp-billing-usage">
              <div>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm">
                    AI fixes
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {usage.aiFixesUsed}
                    {limits.aiLimit != null ? ` / ${limits.aiLimit}` : " · Unlimited"}
                  </Text>
                </InlineStack>
                <ProgressBar
                  progress={usagePct(usage.aiFixesUsed, limits.aiLimit)}
                  size="small"
                />
              </div>
              <div>
                <InlineStack align="space-between">
                  <Text as="span" variant="bodySm">
                    Manual scans
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {usage.manualScansUsed}
                    {limits.scanLimit != null
                      ? ` / ${limits.scanLimit}`
                      : " · Unlimited"}
                  </Text>
                </InlineStack>
                <ProgressBar
                  progress={usagePct(usage.manualScansUsed, limits.scanLimit)}
                  size="small"
                />
              </div>
              <Text as="p" variant="bodySm" tone="subdued">
                Product cap: {limits.productLimit ?? "Unlimited"}
              </Text>
            </div>
          </div>
        </div>

        <div className="cp-billing-grid">
          {slugs.map((slug) => {
            const p = PLANS[slug];
            const isCurrent = slug === activePlan;
            const isEnterprise = p.priceCents < 0;
            const isUpgrade = !isEnterprise && p.priceCents > curPrice;
            const featured = slug === "business" || slug === "enterprise";
            return (
              <div
                key={slug}
                className={`cp-plan-card${isCurrent ? " is-current" : ""}${
                  featured ? " is-featured" : ""
                }${isEnterprise ? " is-enterprise" : ""}`}
              >
                <div className="cp-plan-card__face">
                  <InlineStack align="space-between" blockAlign="start">
                    <Text as="h3" variant="headingMd">
                      {p.name}
                    </Text>
                    {isCurrent && <Badge tone="success">Current</Badge>}
                    {featured && !isCurrent && (
                      <Badge tone="info">
                        {isEnterprise ? "Custom" : "Popular"}
                      </Badge>
                    )}
                  </InlineStack>
                  <p className="cp-plan-card__price">{formatPrice(p.priceCents)}</p>
                  <p className="cp-plan-card__meta">
                    {p.productLimit
                      ? `Up to ${p.productLimit} products · ${p.collectionLimit} collections`
                      : "Unlimited products & collections"}
                  </p>
                  <ul className="cp-plan-card__features">
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button disabled fullWidth>
                      Current plan
                    </Button>
                  ) : isEnterprise ? (
                    <Button url="/app/support" fullWidth variant="primary">
                      Contact for Enterprise
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
                </div>
              </div>
            );
          })}
        </div>
      </BlockStack>
    </Page>
  );
}
