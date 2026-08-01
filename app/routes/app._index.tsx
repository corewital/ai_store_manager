import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  ProgressBar,
  Banner,
  Badge,
  Button,
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { and, count, eq, isNull } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import {
  collectionIssues,
  fixQueue,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  themeIssues,
} from "../db/schema";
import {
  computeHealthScore,
  type HealthCategory,
} from "../services/scoring/health-score.server";
import { ensureShop } from "../services/shopify/shops.server";
import { getShopPlan } from "../services/shopify/billing.server";
import { PLANS } from "../config/plans";
import { ScoreGauge } from "../components/ScoreGauge";
import { getOrCreateSettings } from "../services/shopify/app-settings.server";
import {
  enqueueShopScan,
  getShopJobState,
} from "../services/shopify/shop-jobs.server";
import {
  assertCanScan,
  recordManualScan,
  PlanGateError,
} from "../services/shopify/plan-gate.server";
import { getModuleVisibility } from "../services/admin/module-visibility.server";
import { getEffectiveScanModules } from "../services/shopify/effective-modules.server";
import type { AppModuleVisibility } from "../services/admin/module-visibility";
import { getCatalogCounts } from "../services/shopify/catalog.server";
import { listShopActivity } from "../services/shopify/shop-activity.server";

const CATEGORIES: { key: HealthCategory; label: string; href: string }[] = [
  { key: "products", label: "Products", href: "/app/products" },
  { key: "seo", label: "SEO", href: "/app/seo" },
  { key: "images", label: "Images", href: "/app/images" },
  { key: "inventory", label: "Inventory", href: "/app/inventory" },
  { key: "collections", label: "Collections", href: "/app/collections" },
  { key: "navigation", label: "Navigation", href: "/app/navigation" },
  { key: "theme", label: "Theme", href: "/app/theme" },
  { key: "apps", label: "Apps", href: "/app/apps" },
  { key: "performance", label: "Performance", href: "/app/performance" },
];

async function openCount(
  table:
    | typeof productIssues
    | typeof seoIssues
    | typeof imageIssues
    | typeof inventoryFlags
    | typeof collectionIssues
    | typeof navigationIssues
    | typeof themeIssues,
  shopId: number,
) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(table)
    .where(
      and(eq(table.shopId, shopId), eq(table.status, "open"), isNull(table.deletedAt)),
    );
  return n;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const settings = await getOrCreateSettings(shop.id);
  const job = await getShopJobState(shop.id);
  const score = await computeHealthScore(shop.id);
  const plan = await getShopPlan(shop.id);
  const [master, scanModules, catalog, activity] = await Promise.all([
    getModuleVisibility(),
    getEffectiveScanModules(shop.id),
    getCatalogCounts(admin),
    listShopActivity(shop.id, session.shop, 5),
  ]);

  const issueCounts = {
    products: await openCount(productIssues, shop.id),
    seo: await openCount(seoIssues, shop.id),
    images: await openCount(imageIssues, shop.id),
    inventory: await openCount(inventoryFlags, shop.id),
    collections: await openCount(collectionIssues, shop.id),
    navigation: await openCount(navigationIssues, shop.id),
    theme: await openCount(themeIssues, shop.id),
  };
  const totalOpen = Object.values(issueCounts).reduce((a, b) => a + b, 0);

  const [{ pendingFixes }] = await db
    .select({ pendingFixes: count() })
    .from(fixQueue)
    .where(
      and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "pending"),
        isNull(fixQueue.deletedAt),
      ),
    );

  return {
    shopDomain: session.shop,
    score,
    plan,
    issueCounts,
    catalog,
    totalOpen,
    pendingFixes,
    modules: master,
    scanModules,
    lastScannedAt: settings.lastScannedAt
      ? new Date(settings.lastScannedAt).toISOString()
      : null,
    job: {
      status: job.status,
      type: job.type,
      message: job.message,
      busy: job.busy,
    },
    activity,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const plan = await getShopPlan(shop.id);
  try {
    await assertCanScan(shop.id, plan);
    const result = await enqueueShopScan(shop.id);
    if (!result.ok) return { ok: false, error: result.error };
    await recordManualScan(shop.id);
    return {
      ok: true,
      queued: true,
      processed: result.processed,
      message: result.message,
    };
  } catch (error) {
    if (error instanceof PlanGateError) {
      return { ok: false, error: error.message, upgrade: true };
    }
    throw error;
  }
};

function statusFor(score: number, open: number) {
  if (open === 0 && score >= 90) return { label: "Healthy", tone: "success" as const };
  if (open === 0) return { label: "OK", tone: "info" as const };
  if (score < 60) return { label: `${open} Problems`, tone: "critical" as const };
  return { label: `${open} Problems`, tone: "warning" as const };
}

function gradeLabel(overall: number) {
  if (overall >= 90) return "Excellent Store";
  if (overall >= 75) return "Good Store";
  if (overall >= 60) return "Needs Attention";
  return "Critical Issues";
}

export default function Index() {
  const {
    shopDomain,
    score,
    plan,
    issueCounts,
    catalog,
    totalOpen,
    pendingFixes,
    lastScannedAt,
    job,
    activity,
    modules,
    scanModules,
  } = useLoaderData<typeof loader>();
  const scan = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const scanning = scan.state !== "idle" || job.busy;
  const progressMatch = String(job.message || "").match(/^(\d{1,3})\s*%/);
  const scanProgress = progressMatch
    ? Math.min(100, Number(progressMatch[1]))
    : job.busy
      ? 12
      : job.status === "completed"
        ? 100
        : 0;

  useEffect(() => {
    if (!job.busy) return;
    const t = setInterval(() => revalidator.revalidate(), 2500);
    return () => clearInterval(t);
  }, [job.busy, revalidator]);

  const visibleCategories = CATEGORIES.filter((c) => {
    const key = c.key as keyof AppModuleVisibility;
    if (modules[key] === false) return false;
    if (c.key in scanModules && scanModules[c.key as keyof typeof scanModules] === false) {
      return false;
    }
    return true;
  });

  function moduleTotals(key: HealthCategory) {
    const open = key in issueCounts ? issueCounts[key as keyof typeof issueCounts] : 0;
    if (key === "products" || key === "seo" || key === "images" || key === "inventory") {
      return { total: catalog.products, open };
    }
    if (key === "collections") return { total: catalog.collections, open };
    return { total: Math.max(open, 0), open };
  }

  return (
    <Page>
      <TitleBar title="Dashboard" />
      <BlockStack gap="500">
        {scan.data?.ok && "queued" in scan.data && scan.data.queued && (
          <Banner tone="success">
            {(scan.data as { message?: string }).message === "scan_done"
              ? "Scan completed. Refresh to see updated issue counts."
              : "Scan finished processing. Refresh if counts look stale."}
          </Banner>
        )}
        {scan.data && !scan.data.ok && "error" in scan.data && scan.data.error && (
          <Banner tone="warning">
            {String(scan.data.error)}
            {"upgrade" in scan.data && scan.data.upgrade ? (
              <>
                {" "}
                <Button url="/app/settings/billing" variant="plain">
                  Upgrade plan
                </Button>
              </>
            ) : null}
          </Banner>
        )}
        {job.busy && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {job.type === "scan" ? "Scan in progress" : "Job running"}
                </Text>
                <Badge tone="attention">{`${scanProgress}%`}</Badge>
              </InlineStack>
              <ProgressBar progress={scanProgress} size="small" />
              <Text as="p" tone="subdued" variant="bodySm">
                {job.message || job.status}
              </Text>
            </BlockStack>
          </Card>
        )}
        {!job.busy && job.status === "completed" && job.message && (
          <Banner tone="success">{job.message}</Banner>
        )}
        {job.status === "failed" && job.message && (
          <Banner tone="critical">Job failed: {job.message}</Banner>
        )}

        <Banner tone="info">
          Fix missing product data, SEO, images, and speed issues to improve
          conversions. Queue a scan, then open modules or One-Click Fix to clear
          problems.
        </Banner>

        <Card>
          <InlineStack gap="600" align="space-between" blockAlign="center" wrap>
            <InlineStack gap="500" blockAlign="center">
              <ScoreGauge value={score.overall} size={140} />
              <BlockStack gap="200">
                <Text as="h1" variant="headingLg">
                  Store Health
                </Text>
                <Text as="p" variant="headingSm">
                  {gradeLabel(score.overall)}
                </Text>
                <Text as="p" tone="subdued">
                  {shopDomain} · {PLANS[plan].name} ·{" "}
                  {catalog.products.toLocaleString()} products
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lastScannedAt
                    ? `Last scan ${new Date(lastScannedAt).toLocaleString()}`
                    : "No scan yet — queue one now"}
                </Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200">
              <scan.Form method="post">
                <Button
                  submit
                  variant="primary"
                  loading={scanning}
                  disabled={job.busy}
                  size="large"
                >
                  {job.busy
                    ? `Scanning… ${scanProgress}%`
                    : scanning
                      ? "Starting…"
                      : "Scan now"}
                </Button>
              </scan.Form>
              <Button url="/app/fixes" size="large" disabled={job.busy}>
                One-Click Fix
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">
                Open issues
              </Text>
              <Text as="p" variant="heading2xl">
                {totalOpen}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">
                Pending fixes
              </Text>
              <Text as="p" variant="heading2xl">
                {pendingFixes}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">
                Products
              </Text>
              <Text as="p" variant="heading2xl">
                {catalog.products}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">
                Plan
              </Text>
              <Text as="p" variant="headingLg">
                {PLANS[plan].name}
              </Text>
              <Button url="/app/settings/billing" size="slim">
                Upgrade plan
              </Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Open issues by module
            </Text>
            <BlockStack gap="200">
              {visibleCategories.map(({ key, label }) => {
                const open =
                  key in issueCounts
                    ? issueCounts[key as keyof typeof issueCounts]
                    : 0;
                const max = Math.max(totalOpen, 1);
                const pct = Math.round((open / max) * 100);
                return (
                  <BlockStack key={key} gap="100">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm">
                        {label}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {open}
                      </Text>
                    </InlineStack>
                    <ProgressBar
                      progress={pct}
                      size="small"
                      tone={open > 0 ? "critical" : "primary"}
                    />
                  </BlockStack>
                );
              })}
            </BlockStack>
          </BlockStack>
        </Card>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Module health
                  </Text>
                  {modules.health !== false && (
                    <Button url="/app/health">View all</Button>
                  )}
                </InlineStack>
                <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                  {visibleCategories.map(({ key, label, href }) => {
                    const { total, open } = moduleTotals(key);
                    const healthyPct =
                      total > 0
                        ? Math.round(((total - Math.min(open, total)) / total) * 100)
                        : score[key];
                    const st = statusFor(score[key], open);
                    return (
                      <Card key={key}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text as="h3" variant="headingSm">
                              {label}
                            </Text>
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {total > 0
                              ? `${total.toLocaleString()} total · ${open.toLocaleString()} problems`
                              : `${open.toLocaleString()} problems`}
                          </Text>
                          <Text as="p" variant="headingLg">
                            Score {score[key]}
                          </Text>
                          <ProgressBar
                            progress={healthyPct}
                            size="small"
                            tone={open > 0 ? "critical" : "primary"}
                          />
                          <Text as="p" variant="bodySm" tone="subdued">
                            {healthyPct}% clear
                          </Text>
                          <Button url={href} size="slim" fullWidth>
                            Review &amp; fix
                          </Button>
                        </BlockStack>
                      </Card>
                    );
                  })}
                </InlineGrid>
                {visibleCategories.length === 0 && (
                  <Text as="p" tone="subdued">
                    No health modules are enabled. Ask your admin to turn modules
                    on under Admin → App modules.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent activity
                  </Text>
                  <Button url="/app/fixes" size="slim">
                    Fixes
                  </Button>
                </InlineStack>
                {activity.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No activity yet. Run a scan or apply a fix to see history here.
                  </Text>
                ) : (
                  activity.map((item) => (
                    <BlockStack key={item.id} gap="100">
                      <Button url={item.href} variant="plain" textAlign="left">
                        {item.title}
                      </Button>
                      {item.detail && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          {item.detail}
                        </Text>
                      )}
                      {(item.before || item.after) && (
                        <Text as="p" variant="bodySm">
                          {item.before ? `Before: ${item.before.slice(0, 80)}` : ""}
                          {item.before && item.after ? " → " : ""}
                          {item.after ? `After: ${item.after.slice(0, 80)}` : ""}
                        </Text>
                      )}
                      <InlineStack gap="200">
                        {item.module && <Badge>{item.module}</Badge>}
                        {item.status && <Badge tone="info">{item.status}</Badge>}
                        <Text as="span" variant="bodySm" tone="subdued">
                          {item.at ? new Date(item.at).toLocaleString() : ""}
                        </Text>
                      </InlineStack>
                      <Divider />
                    </BlockStack>
                  ))
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
