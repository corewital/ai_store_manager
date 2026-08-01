import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Banner,
  Button,
  Text,
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
import { DEFAULT_MODULE_VISIBILITY } from "../services/admin/module-visibility";
import { getCatalogCounts } from "../services/shopify/catalog.server";
import { listShopActivity } from "../services/shopify/shop-activity.server";
import { issueLabel } from "../lib/issue-labels";
import dashboardStyles from "../styles/dashboard.css?url";

/** Vercel Function limit for scan kickoff / waitUntil (Pro). */
export const config = { maxDuration: 300 };

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: dashboardStyles },
];

const CATEGORIES: {
  key: HealthCategory;
  label: string;
  href: string;
  icon: string;
}[] = [
  { key: "products", label: "Product Health", href: "/app/products", icon: "/images/Products.png" },
  { key: "seo", label: "SEO", href: "/app/seo", icon: "/images/SEO.png" },
  { key: "images", label: "Images", href: "/app/images", icon: "/images/Images.png" },
  { key: "inventory", label: "Inventory", href: "/app/inventory", icon: "/images/Inventory.png" },
  { key: "performance", label: "Performance", href: "/app/performance", icon: "/images/Performance.png" },
  { key: "collections", label: "Collections", href: "/app/collections", icon: "/images/Collections.png" },
];

function Spark({ color = "#fff" }: { color?: string }) {
  return (
    <svg className="dashSpark" width="88" height="28" viewBox="0 0 88 28" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="0,22 12,18 22,20 34,12 46,15 58,8 70,11 88,4"
      />
    </svg>
  );
}

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

  const emptyScore = {
    overall: 100,
    products: 100,
    seo: 100,
    images: 100,
    inventory: 100,
    collections: 100,
    navigation: 100,
    theme: 100,
    apps: 100,
    performance: 100,
  };

  try {
    const shop = await ensureShop(session.shop, session.accessToken);
    const settings = await getOrCreateSettings(shop.id);
    const job = await getShopJobState(shop.id);
    const plan = await getShopPlan(shop.id);
    const planDef = PLANS[(plan in PLANS ? plan : "free") as keyof typeof PLANS];

    const [master, scanModules, catalog, activity, score] = await Promise.all([
      getModuleVisibility().catch(() => DEFAULT_MODULE_VISIBILITY),
      getEffectiveScanModules(shop.id).catch(
        () =>
          Object.fromEntries(
            Object.keys(DEFAULT_MODULE_VISIBILITY).map((k) => [k, true]),
          ) as Record<string, boolean>,
      ),
      getCatalogCounts(admin),
      listShopActivity(shop.id, session.shop, 5).catch(() => []),
      computeHealthScore(shop.id).catch(() => emptyScore),
    ]);

    const productCap = planDef.productLimit ?? catalog.products;
    const collectionCap = planDef.collectionLimit ?? catalog.collections;

    const issueCounts = {
      products: 0,
      seo: 0,
      images: 0,
      inventory: 0,
      collections: 0,
      navigation: 0,
      theme: 0,
    };
    try {
      const [
        productsN,
        seoN,
        imagesN,
        inventoryN,
        collectionsN,
        navigationN,
        themeN,
        pendingRow,
      ] = await Promise.all([
        openCount(productIssues, shop.id),
        openCount(seoIssues, shop.id),
        openCount(imageIssues, shop.id),
        openCount(inventoryFlags, shop.id),
        openCount(collectionIssues, shop.id),
        openCount(navigationIssues, shop.id),
        openCount(themeIssues, shop.id),
        db
          .select({ pendingFixes: count() })
          .from(fixQueue)
          .where(
            and(
              eq(fixQueue.shopId, shop.id),
              eq(fixQueue.status, "pending"),
              isNull(fixQueue.deletedAt),
            ),
          ),
      ]);
      issueCounts.products = productsN;
      issueCounts.seo = seoN;
      issueCounts.images = imagesN;
      issueCounts.inventory = inventoryN;
      issueCounts.collections = collectionsN;
      issueCounts.navigation = navigationN;
      issueCounts.theme = themeN;
      const totalOpen = Object.values(issueCounts).reduce((a, b) => a + b, 0);
      const pendingFixes = pendingRow[0]?.pendingFixes ?? 0;

      return {
        shopDomain: session.shop,
        score,
        plan,
        productCap,
        collectionCap,
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
    } catch (error) {
      console.error("[dashboard] counts:", error);
      return {
        shopDomain: session.shop,
        score,
        plan,
        productCap,
        collectionCap,
        issueCounts,
        catalog,
        totalOpen: 0,
        pendingFixes: 0,
        modules: master,
        scanModules,
        lastScannedAt: null,
        job: {
          status: job.status,
          type: job.type,
          message: job.message,
          busy: job.busy,
        },
        activity,
      };
    }
  } catch (error) {
    console.error("[dashboard] loader:", error);
    return {
      shopDomain: session.shop,
      score: emptyScore,
      plan: "free" as const,
      productCap: PLANS.free.productLimit,
      collectionCap: PLANS.free.collectionLimit,
      issueCounts: {
        products: 0,
        seo: 0,
        images: 0,
        inventory: 0,
        collections: 0,
        navigation: 0,
        theme: 0,
      },
      catalog: { products: 0, collections: 0 },
      totalOpen: 0,
      pendingFixes: 0,
      modules: DEFAULT_MODULE_VISIBILITY,
      scanModules: {},
      lastScannedAt: null,
      job: { status: "idle", type: null, message: null, busy: false },
      activity: [],
    };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const plan = await getShopPlan(shop.id);
  try {
    await assertCanScan(shop.id, plan);
    const result = await enqueueShopScan(shop.id);
    if (!result.ok) return { ok: false, error: result.error };
    await recordManualScan(shop.id, plan);
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
    productCap,
    collectionCap,
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
      ? 8
      : job.status === "completed"
        ? 100
        : 0;

  useEffect(() => {
    if (!job.busy && scan.state === "idle") return;
    const t = setInterval(() => revalidator.revalidate(), 2500);
    return () => clearInterval(t);
  }, [job.busy, scan.state, revalidator]);

  useEffect(() => {
    if (scan.state === "idle" && scan.data?.ok) {
      revalidator.revalidate();
    }
  }, [scan.state, scan.data, revalidator]);

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
      return { total: productCap || catalog.products, open };
    }
    if (key === "collections") {
      return { total: collectionCap || catalog.collections, open };
    }
    return { total: Math.max(open, 0), open };
  }

  const insights = [
    issueCounts.products > 0
      ? `${issueLabel("missing_description")} · ${issueCounts.products} product issue(s)`
      : null,
    issueCounts.images > 0
      ? `${issueLabel("no_media")} / image issues · ${issueCounts.images}`
      : null,
    issueCounts.seo > 0 ? `SEO issues · ${issueCounts.seo}` : null,
    pendingFixes > 0 ? `Pending AI fixes · ${pendingFixes}` : null,
    totalOpen === 0 ? "Store looks healthy — run a scan to refresh scores." : null,
  ].filter(Boolean) as string[];

  const topFixCount = Math.max(
    issueCounts.products,
    issueCounts.seo,
    issueCounts.images,
    pendingFixes,
  );

  const showProgress = job.busy || scanning;
  const progressLabel = job.message || (scanning ? "5% · Scan starting…" : job.status);

  return (
    <Page fullWidth>
      <TitleBar title="Dashboard" />
      <div className="dash">
        {scan.data?.ok && "queued" in scan.data && scan.data.queued && (
          <Banner tone="success">
            {(scan.data as { message?: string }).message === "scan_started"
              ? "Scan started — watch the progress bar below."
              : (scan.data as { message?: string }).message === "scan_done"
                ? "Scan completed. Scores and issue counts updated."
                : "Scan finished. Refresh if counts look stale."}
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
        {job.status === "failed" && job.message && (
          <Banner tone="critical">Job failed: {job.message}</Banner>
        )}

        {showProgress && (
          <div className="dashProgress">
            <div className="dashProgressHead">
              <span>{job.type === "fix" ? "Job running" : "Scan in progress"}</span>
              <span>{scanProgress || 5}%</span>
            </div>
            <div className="dashBar">
              <span style={{ width: `${scanProgress || 5}%`, background: "#ea580c" }} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              {progressLabel}
            </Text>
          </div>
        )}

        <section className="dashHero">
          <ScoreGauge value={score.overall} size={132} />
          <div className="dashHeroCopy">
            <h1>Store Health</h1>
            <p className="dashHeroMeta">
              {gradeLabel(score.overall)} · {shopDomain} · {PLANS[plan].name} ·{" "}
              {catalog.products.toLocaleString()} in store · scan cap{" "}
              {productCap.toLocaleString()} products / {collectionCap} collections
            </p>
            <p className="dashHeroMeta">
              {showProgress
                ? job.type === "fix"
                  ? "Job in progress…"
                  : "Scan in progress — scores update when it finishes."
                : lastScannedAt
                  ? `Last scan ${new Date(lastScannedAt).toLocaleString()}`
                  : "No scan yet — queue one now"}
            </p>
          </div>
          <div className="dashHeroActions">
            <scan.Form method="post">
              <button
                type="submit"
                className="dashBtn dashBtnPrimary"
                disabled={job.busy || scanning}
              >
                {job.busy || scanning
                  ? `Scanning… ${scanProgress || 5}%`
                  : "Scan Now"}
              </button>
            </scan.Form>
            <Link className="dashBtn dashBtnAccent" to="/app/assistant">
              AI Analysis
            </Link>
          </div>
        </section>

        <section className="dashMetrics">
          <Link to="/app/inventory" className="dashMetric dashMetricMint">
            <div>
              <div className="dashMetricLabel">Inventory · Low stock</div>
              <div className="dashMetricValue">{issueCounts.inventory}</div>
              <div className="dashMetricHint">Open inventory flags</div>
            </div>
            <Spark color="#14532d" />
          </Link>
          <Link to="/app/seo" className="dashMetric dashMetricGreen">
            <div>
              <div className="dashMetricLabel">SEO score</div>
              <div className="dashMetricValue">{score.seo}</div>
              <div className="dashMetricHint">{issueCounts.seo} open SEO issues</div>
            </div>
            <Spark />
          </Link>
          <Link to="/app/fixes" className="dashMetric dashMetricBlue">
            <div>
              <div className="dashMetricLabel">Open issues</div>
              <div className="dashMetricValue">{totalOpen}</div>
              <div className="dashMetricHint">
                {pendingFixes} pending fixes · {PLANS[plan].name}
              </div>
            </div>
            <Spark />
          </Link>
        </section>

        <section className="dashMain">
          <div className="dashPanel">
            <h2 className="dashPanelTitle">Category Health</h2>
            <div className="dashCats">
              {visibleCategories.map(({ key, label, href, icon }) => {
                const { total, open } = moduleTotals(key);
                const clearPct =
                  total > 0
                    ? Math.round(((total - Math.min(open, total)) / total) * 100)
                    : score[key];
                return (
                  <Link key={key} to={href} className="dashCat">
                    <img src={icon} alt="" className="dashCatIcon" />
                    <p className="dashCatName">{label}</p>
                    <p className="dashCatScore">{score[key]}</p>
                    <p className="dashCatClear">
                      {open} open · {clearPct}% clear
                    </p>
                    <div className="dashBar">
                      <span style={{ width: `${clearPct}%` }} />
                    </div>
                  </Link>
                );
              })}
              {visibleCategories.length === 0 && (
                <Text as="p" tone="subdued">
                  No modules enabled for your plan.
                </Text>
              )}
            </div>
          </div>

          <div className="dashSide">
            <div className="dashPanel">
              <h2 className="dashPanelTitle">Reports · Insights</h2>
              <ul className="dashInsight">
                {insights.slice(0, 5).map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {activity.slice(0, 2).map((item) =>
                  item ? <li key={item.id}>{item.title}</li> : null,
                )}
              </ul>
              <div style={{ marginTop: "0.85rem" }}>
                <Link to="/app/reports" className="dashBtn dashBtnAccent" style={{ display: "inline-block" }}>
                  View reports
                </Link>
              </div>
            </div>

            <div className="dashPanel">
              <h2 className="dashPanelTitle">AI Assistant</h2>
              <div className="dashRec">
                <h3>
                  {topFixCount > 0
                    ? `Optimize ${topFixCount} issue${topFixCount === 1 ? "" : "s"}`
                    : "Store looks healthy"}
                </h3>
                <p>
                  {pendingFixes > 0
                    ? `${pendingFixes} fix(es) queued. Review One-Click Fix or apply AI drafts in each module.`
                    : totalOpen > 0
                      ? "Open modules to preview AI fixes, then save to Shopify."
                      : "Run Scan Now to refresh health, or ask the assistant for next steps."}
                </p>
                <Link
                  className="dashBtn dashBtnPrimary"
                  to={pendingFixes > 0 || totalOpen > 0 ? "/app/fixes" : "/app/assistant"}
                  style={{ width: "100%", textAlign: "center", display: "inline-block" }}
                >
                  {pendingFixes > 0 || totalOpen > 0 ? "Apply fixes" : "Open AI Assistant"}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
