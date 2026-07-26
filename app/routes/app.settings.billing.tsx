import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
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
import { authenticate } from "../shopify.server";
import { PLANS, formatPrice, type PlanSlug } from "../config/plans";
import {
  createSubscription,
  syncSubscription,
} from "../services/shopify/billing.server";
import { ensureShop } from "../services/shopify/shops.server";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const plan = await syncSubscription(admin, shop.id);
  return { plan, shopDomain: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const plan = String((await request.formData()).get("plan") ?? "");
  if (!(plan in PLANS)) return { ok: false, error: "invalid_plan" };

  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const result = await createSubscription(
    admin,
    shop.id,
    plan as PlanSlug,
    appUrl,
  );

  if (!result.ok) return { ok: false, error: result.error };
  if (result.confirmationUrl) return redirect(result.confirmationUrl);
  return { ok: true, plan: result.plan };
};

export default function SettingsBillingPage() {
  const { plan: currentPlan, shopDomain } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params] = useSearchParams();
  const confirmed = params.get("confirmed");
  const activePlan = currentPlan as PlanSlug;

  return (
    <Page>
      <TitleBar title="Plans & Billing" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="500">
        {confirmed && (
          <Banner tone="success">
            Subscription confirmed. You are on the {PLANS[activePlan].name} plan.
          </Banner>
        )}
        {fetcher.data && !fetcher.data.ok && (
          <Banner tone="critical">
            Could not start checkout:{" "}
            {(fetcher.data as { error?: string }).error}
          </Banner>
        )}
        {fetcher.data?.ok && (
          <Banner tone="success">Downgraded to the Free plan.</Banner>
        )}

        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Current plan
              </Text>
              <Text as="p" tone="subdued">
                Billed through Shopify for {shopDomain}. 7-day free trial on all
                paid plans.
              </Text>
            </BlockStack>
            <Badge tone="success">{PLANS[activePlan].name}</Badge>
          </InlineStack>
        </Card>

        <Layout>
          {(Object.keys(PLANS) as PlanSlug[]).map((slug) => {
            const p = PLANS[slug];
            const isCurrent = slug === activePlan;
            const isUpgrade = p.priceCents > PLANS[activePlan].priceCents;
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
                        ? `Up to ${p.productLimit} products`
                        : "Unlimited products"}
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
