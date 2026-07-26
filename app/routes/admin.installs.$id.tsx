import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { useMemo, useState } from "react";

import { PLANS } from "../config/plans";
import { db } from "../db/client";
import {
  activityLogs,
  appInstalls,
  appSettings,
  billingPlans,
  billingSubscriptions,
  collectionIssues,
  fixQueue,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  shops,
  themeIssues,
} from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";
import { getModuleVisibility } from "../services/admin/module-visibility.server";
import type { AppModuleVisibility } from "../services/admin/module-visibility";
import { fetchMerchantDatatable } from "../services/merchant/datatable.server";
import { computeHealthScore } from "../services/scoring/health-score.server";
import {
  enqueueShopFixes,
  enqueueShopScan,
  getShopJobState,
} from "../services/shopify/shop-jobs.server";
import { listShopActivity } from "../services/shopify/shop-activity.server";
import { runModuleFix } from "../services/shopify/module-fix.server";
import { unauthenticated } from "../shopify.server";

const MODULES = [
  { key: "products", table: "productIssues", label: "Products", schema: productIssues },
  { key: "seo", table: "seoIssues", label: "SEO", schema: seoIssues },
  { key: "images", table: "imageIssues", label: "Images", schema: imageIssues },
  {
    key: "inventory",
    table: "inventoryFlags",
    label: "Inventory",
    schema: inventoryFlags,
  },
  {
    key: "collections",
    table: "collectionIssues",
    label: "Collections",
    schema: collectionIssues,
  },
  {
    key: "navigation",
    table: "navigationIssues",
    label: "Navigation",
    schema: navigationIssues,
  },
  { key: "theme", table: "themeIssues", label: "Theme", schema: themeIssues },
] as const;

type ModuleKey = (typeof MODULES)[number]["key"];

function iso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

async function loadInstall(id: number) {
  const install = await db.query.appInstalls.findFirst({
    where: eq(appInstalls.id, id),
  });
  if (!install) return null;
  const shop = install.shopId
    ? await db.query.shops.findFirst({ where: eq(shops.id, install.shopId) })
    : await db.query.shops.findFirst({
        where: eq(shops.shopDomain, install.shopDomain),
      });
  return { install, shop };
}

function visibleModules(vis: AppModuleVisibility) {
  return MODULES.filter((m) => vis[m.key as keyof AppModuleVisibility] !== false);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new Response("Not found", { status: 404 });

  const loaded = await loadInstall(id);
  if (!loaded) throw new Response("Not found", { status: 404 });
  const { install, shop } = loaded;
  const shopId = shop?.id ?? null;
  const isSuper = user.roleSlug === "super_admin";

  const visibility = await getModuleVisibility();
  const mods = visibleModules(visibility);
  const tabs = [
    "overview",
    "health",
    ...mods.map((m) => m.key),
    "reports",
    "fixes",
    "activity",
  ];

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") || "overview";
  const tab = tabs.includes(tabParam) ? tabParam : "overview";
  const view = url.searchParams.get("view") === "grid" ? "grid" : "table";
  const status = url.searchParams.get("status") || "open";
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") || 20)));
  const flash = url.searchParams.get("flash");

  const [settings, billing, plans, job] = await Promise.all([
    shopId
      ? db.query.appSettings.findFirst({ where: eq(appSettings.shopId, shopId) })
      : null,
    shopId
      ? db.query.billingSubscriptions.findFirst({
          where: and(
            eq(billingSubscriptions.shopId, shopId),
            isNull(billingSubscriptions.deletedAt),
          ),
          orderBy: [desc(billingSubscriptions.updatedAt)],
        })
      : null,
    db
      .select({ slug: billingPlans.slug, name: billingPlans.name })
      .from(billingPlans)
      .where(isNull(billingPlans.deletedAt)),
    shopId ? getShopJobState(shopId) : null,
  ]);

  const health = shopId ? await computeHealthScore(shopId) : null;

  const moduleCounts = shopId
    ? await Promise.all(
        mods.map(async (m) => {
          const [row] = await db
            .select({
              total: count(),
              open: sql<number>`sum(case when ${m.schema.status} = 'open' then 1 else 0 end)`,
            })
            .from(m.schema)
            .where(and(eq(m.schema.shopId, shopId), isNull(m.schema.deletedAt)));
          const total = Number(row?.total ?? 0);
          const open = Number(row?.open ?? 0);
          return {
            key: m.key as string,
            label: m.label,
            total,
            open,
            clear: total - open,
            clearPct: total > 0 ? Math.round(((total - open) / total) * 100) : 100,
          };
        }),
      )
    : [];

  const [fixCounts] = shopId
    ? await db
        .select({
          pending: sql<number>`sum(case when ${fixQueue.status} = 'pending' then 1 else 0 end)`,
          done: sql<number>`sum(case when ${fixQueue.status} = 'done' then 1 else 0 end)`,
          failed: sql<number>`sum(case when ${fixQueue.status} = 'failed' then 1 else 0 end)`,
        })
        .from(fixQueue)
        .where(and(eq(fixQueue.shopId, shopId), isNull(fixQueue.deletedAt)))
    : [{ pending: 0, done: 0, failed: 0 }];

  let listing: Awaited<ReturnType<typeof fetchMerchantDatatable>> | null = null;
  const module = mods.find((m) => m.key === tab);
  if (shopId && module) {
    listing = await fetchMerchantDatatable(module.table, shopId, {
      page,
      limit,
      status,
      search: q || undefined,
    });
  } else if (shopId && tab === "reports") {
    listing = await fetchMerchantDatatable("reportsSent", shopId, {
      page,
      limit,
      search: q || undefined,
    });
  } else if (shopId && tab === "fixes") {
    const fixStatus =
      status === "all" ? undefined : status === "open" ? "pending" : status;
    listing = await fetchMerchantDatatable("fixQueue", shopId, {
      page,
      limit,
      status: fixStatus,
      search: q || undefined,
    });
  }

  const activity =
    shopId && tab === "activity"
      ? await listShopActivity(shopId, install.shopDomain, 40)
      : [];

  return {
    flash,
    tab,
    view,
    status,
    q,
    page,
    limit,
    isSuper,
    job: job
      ? {
          status: job.status,
          type: job.type,
          message: job.message,
          busy: job.busy,
          startedAt: iso(job.startedAt),
          finishedAt: iso(job.finishedAt),
        }
      : null,
    planOptions: [
      ...Object.keys(PLANS).map((slug) => ({
        slug,
        name: PLANS[slug as keyof typeof PLANS].name,
      })),
      ...plans.filter((p) => !(p.slug in PLANS)),
    ],
    install: {
      id: install.id,
      shopDomain: install.shopDomain,
      storeName: install.shopDomain.replace(/\.myshopify\.com$/i, ""),
      status: install.status,
      notes: install.notes,
      frozenAt: iso(install.frozenAt),
      createdAt: iso(install.createdAt),
      updatedAt: iso(install.updatedAt),
    },
    shop: shop
      ? {
          id: shop.id,
          plan: shop.plan,
          timezone: shop.timezone,
          tokenStatus: shop.accessToken ? "Connected" : "Missing",
          accessToken: isSuper ? shop.accessToken : null,
          appApiUrl: isSuper ? shop.appApiUrl : null,
          installedAt: iso(shop.installedAt),
          uninstalledAt: iso(shop.uninstalledAt),
          updatedAt: iso(shop.updatedAt),
        }
      : null,
    settings: settings
      ? {
          scanFrequency: settings.scanFrequency,
          notifyEmail: settings.notifyEmail,
          lastScannedAt: iso(settings.lastScannedAt),
          aiEnabled: settings.aiEnabled,
          autoFixEnabled: settings.autoFixEnabled,
        }
      : null,
    billing: billing ? { plan: billing.plan, status: billing.status } : null,
    health,
    listing,
    activity,
    moduleCounts,
    fixCounts: {
      pending: Number(fixCounts?.pending ?? 0),
      done: Number(fixCounts?.done ?? 0),
      failed: Number(fixCounts?.failed ?? 0),
    },
    modules: mods.map((m) => ({ key: m.key as string, label: m.label })),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "installs.manage"))) {
    throw new Response("Forbidden", { status: 403 });
  }

  const id = Number(params.id);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const tab = String(form.get("tab") || "overview");
  const loaded = await loadInstall(id);
  if (!loaded?.shop?.id) throw new Response("Not found", { status: 404 });
  const { shop } = loaded;
  const shopId = shop.id;
  const domain = shop.shopDomain;

  let flash = "Done";

  try {
    if (intent === "set_plan") {
      if (!(await can(request, "billing.manage"))) {
        throw new Response("Forbidden", { status: 403 });
      }
      const plan = String(form.get("plan") || "free").trim();
      const { adminOverridePlan } = await import(
        "../services/shopify/billing.server"
      );
      await adminOverridePlan(shopId, plan);
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "store_plan_override",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ plan, shopDomain: domain }),
      });
      flash = `Plan override set to ${plan} (app side updated; survives Shopify sync)`;
    } else if (intent === "freeze" || intent === "unfreeze") {
      const frozenAt = intent === "freeze" ? new Date() : null;
      await db
        .update(appInstalls)
        .set({ frozenAt, updatedAt: new Date() })
        .where(eq(appInstalls.id, id));
      await db
        .update(shops)
        .set({ frozenAt, updatedAt: new Date() })
        .where(eq(shops.id, shopId));
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: intent === "freeze" ? "install_freeze" : "install_unfreeze",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ shopDomain: domain }),
      });
      flash =
        intent === "freeze"
          ? "Store frozen — merchant app blocked and cron skipped."
          : "Store unfrozen — access restored.";
    } else if (intent === "save_note") {
      const note = String(form.get("note") || "").trim();
      await db
        .update(appInstalls)
        .set({ notes: note, updatedAt: new Date() })
        .where(eq(appInstalls.id, id));
      flash = "Note saved.";
    } else if (intent === "run_scan") {
      const result = await enqueueShopScan(shopId);
      flash = result.ok
        ? "Scan started and processed for this store."
        : result.error;
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "admin_store_scan_queued",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ shopDomain: domain, result }),
      });
    } else if (intent === "retry_failed") {
      await db
        .update(fixQueue)
        .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
        .where(and(eq(fixQueue.shopId, shopId), eq(fixQueue.status, "failed")));
      await db
        .update(appSettings)
        .set({
          jobStatus: "queued",
          jobType: "fix",
          jobMessage: "Failed fixes re-queued by admin.",
          jobStartedAt: new Date(),
          jobFinishedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(appSettings.shopId, shopId));
      flash = "Failed fixes re-queued for the next cron tick.";
    } else if (intent === "fix_one") {
      const module = String(form.get("module") || "");
      const issueId = Number(form.get("issueId"));
      const { admin } = await unauthenticated.admin(domain);
      const result = await runModuleFix(admin, shopId, module, issueId);
      flash = result.ok
        ? `Fixed issue #${issueId}`
        : `Fix failed: ${result.error || result.skipMessage || "unknown"}`;
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "admin_store_fix",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ module, issueId, result, shopDomain: domain }),
      });
    } else if (intent === "fix_selected") {
      const module = String(form.get("module") || "");
      const ids = String(form.get("issueIds") || "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0);
      const result = await enqueueShopFixes(shopId, module, ids);
      flash = result.ok
        ? `Bulk fix: ${result.queued} item(s) sent to background cron.`
        : result.error;
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "admin_store_fix_queued",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ module, ids, result, shopDomain: domain }),
      });
    } else if (intent === "fix_module_all") {
      const module = String(form.get("module") || "");
      const mod = MODULES.find((m) => m.key === module);
      if (!mod) throw new Response("Unknown module", { status: 400 });
      const open = await fetchMerchantDatatable(mod.table, shopId, {
        page: 1,
        limit: 50,
        status: "open",
      });
      const ids = open.rows.map((r) => Number(r.id));
      const result = await enqueueShopFixes(shopId, module, ids);
      flash = result.ok
        ? `Fix All: ${result.queued} ${module} item(s) sent to background cron.`
        : result.error;
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "admin_store_fix_all_queued",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ module, result, shopDomain: domain }),
      });
    }
  } catch (error) {
    flash =
      error instanceof Error
        ? `Error: ${error.message}`
        : "Action failed — offline session may be missing";
  }

  return redirect(
    `/admin/installs/${id}?tab=${encodeURIComponent(tab)}&flash=${encodeURIComponent(flash)}`,
  );
}

function tabHref(id: number, tab: string, extra?: Record<string, string>) {
  const qs = new URLSearchParams({ tab, ...extra });
  return `/admin/installs/${id}?${qs}`;
}

export default function AdminInstallDetail() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const submitting = navigation.state !== "idle";
  const id = data.install.id;
  const canApi = data.shop?.tokenStatus === "Connected";
  const jobBusy = Boolean(data.job?.busy);
  const scanLocked = submitting || !canApi || jobBusy;
  const bulkLocked = submitting || !canApi || jobBusy;
  const singleLocked =
    submitting || !canApi || (jobBusy && data.job?.type === "scan");
  const [selected, setSelected] = useState<number[]>([]);
  const isModuleTab = data.modules.some((m) => m.key === data.tab);

  const totalPages = useMemo(() => {
    const total = data.listing?.total ?? 0;
    return Math.max(1, Math.ceil(total / data.limit));
  }, [data.listing?.total, data.limit]);

  const totals = useMemo(() => {
    const open = data.moduleCounts.reduce((sum, m) => sum + m.open, 0);
    const all = data.moduleCounts.reduce((sum, m) => sum + m.total, 0);
    return { open, all, clearPct: all > 0 ? Math.round(((all - open) / all) * 100) : 100 };
  }, [data.moduleCounts]);

  const rows = data.listing?.rows ?? [];
  const showImageCol =
    data.tab === "images" || data.tab === "products" || rows.some((r) => r.imageUrl);

  function toggle(idNum: number) {
    setSelected((prev) =>
      prev.includes(idNum) ? prev.filter((x) => x !== idNum) : [...prev, idNum],
    );
  }

  function toggleAll() {
    const openIds = rows
      .filter((r) => String(r.status) === "open")
      .map((r) => Number(r.id));
    setSelected((prev) => (prev.length === openIds.length ? [] : openIds));
  }

  function viewHref(nextView: "grid" | "table") {
    const sp = new URLSearchParams(params);
    sp.set("view", nextView);
    sp.delete("flash");
    return `?${sp.toString()}`;
  }

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            <Link to="/admin/installs">← Installs</Link>
          </p>
          <h1>{data.install.storeName}</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            {data.install.shopDomain} · same dashboard the merchant sees. Scans and
            bulk fixes run on cron; a single Fix runs immediately.
          </p>
        </div>
        <div className="admin-actions">
          <Form method="post">
            <input type="hidden" name="intent" value="run_scan" />
            <input type="hidden" name="tab" value={data.tab} />
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={scanLocked}
              title={
                jobBusy
                  ? "A background job is already running"
                  : !canApi
                    ? "Offline session / token required"
                    : "Run full scan (background)"
              }
            >
              {jobBusy ? "Job running…" : "Queue scan"}
            </button>
          </Form>
          {data.fixCounts.failed > 0 && (
            <Form method="post">
              <input type="hidden" name="intent" value="retry_failed" />
              <input type="hidden" name="tab" value={data.tab} />
              <button type="submit" className="admin-btn" disabled={submitting}>
                Retry {data.fixCounts.failed} failed
              </button>
            </Form>
          )}
          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value={data.install.frozenAt ? "unfreeze" : "freeze"}
            />
            <input type="hidden" name="tab" value={data.tab} />
            <button type="submit" className="admin-btn" disabled={submitting}>
              {data.install.frozenAt ? "Unfreeze store" : "Freeze store"}
            </button>
          </Form>
          <a
            href={`https://${data.install.shopDomain}/admin`}
            target="_blank"
            rel="noreferrer"
            className="admin-btn"
          >
            Shopify admin
          </a>
        </div>
      </div>

      {data.flash && (
        <div className="admin-card" style={{ borderColor: "#86efac" }}>
          {data.flash}
        </div>
      )}

      {data.job && data.job.status !== "idle" && (
        <div
          className="admin-card"
          style={{
            borderColor: jobBusy
              ? "#fbbf24"
              : data.job.status === "failed"
                ? "#f87171"
                : "#86efac",
          }}
        >
          <strong>Background job:</strong> {data.job.status}
          {data.job.type ? ` · ${data.job.type}` : ""} — {data.job.message || "—"}
          {jobBusy && <span> (actions disabled until complete)</span>}
        </div>
      )}

      <div className="admin-tiles">
        <div className="admin-tile">
          <div className="admin-tile__value">{data.install.status}</div>
          <div className="admin-tile__label">
            Install {data.install.frozenAt ? "· FROZEN" : ""}
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.shop?.tokenStatus ?? "Missing"}</div>
          <div className="admin-tile__label">API session</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.shop?.plan ?? "free"}</div>
          <div className="admin-tile__label">
            Plan · billing {data.billing?.status ?? "none"}
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.health?.overall ?? "—"}</div>
          <div className="admin-tile__label">Health score</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{totals.open}</div>
          <div className="admin-tile__label">
            Open issues of {totals.all} checks · {totals.clearPct}% clear
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.fixCounts.pending}</div>
          <div className="admin-tile__label">
            Fixes queued · {data.fixCounts.done} done · {data.fixCounts.failed} failed
          </div>
        </div>
      </div>

      <div className="admin-tabs">
        <Link
          to={tabHref(id, "overview")}
          className={data.tab === "overview" ? "active" : undefined}
        >
          Overview
        </Link>
        <Link
          to={tabHref(id, "health")}
          className={data.tab === "health" ? "active" : undefined}
        >
          Store Health
        </Link>
        {data.modules.map((m) => (
          <Link
            key={m.key}
            to={tabHref(id, m.key)}
            className={data.tab === m.key ? "active" : undefined}
          >
            {m.label}
          </Link>
        ))}
        <Link
          to={tabHref(id, "reports")}
          className={data.tab === "reports" ? "active" : undefined}
        >
          Reports
        </Link>
        <Link
          to={tabHref(id, "fixes")}
          className={data.tab === "fixes" ? "active" : undefined}
        >
          One-Click Fix
        </Link>
        <Link
          to={tabHref(id, "activity")}
          className={data.tab === "activity" ? "active" : undefined}
        >
          Activity
        </Link>
      </div>

      {data.tab === "overview" && (
        <>
          <div className="admin-card">
            <div className="admin-card__title">Module health</div>
            <div className="admin-module-grid">
              {data.moduleCounts.map((m) => (
                <Link
                  key={m.key}
                  to={tabHref(id, m.key)}
                  className="admin-module"
                >
                  <div className="admin-module__head">
                    <span>{m.label}</span>
                    <span
                      className={
                        m.open === 0
                          ? "admin-badge admin-badge--ok"
                          : "admin-badge admin-badge--warn"
                      }
                    >
                      {m.open} open
                    </span>
                  </div>
                  <div className="admin-progress">
                    <span style={{ width: `${m.clearPct}%` }} />
                  </div>
                  <div className="admin-module__meta">
                    {m.clear} clear of {m.total} checked · {m.clearPct}%
                  </div>
                </Link>
              ))}
              {data.moduleCounts.length === 0 && (
                <p>No scan data yet — queue a scan to populate this store.</p>
              )}
            </div>
          </div>

          <div className="admin-grid-2">
            <div className="admin-card">
              <div className="admin-card__title">Lifecycle</div>
              <table className="admin-table">
                <tbody>
                  <tr>
                    <th>Installed</th>
                    <td>{date(data.shop?.installedAt ?? data.install.createdAt)}</td>
                  </tr>
                  <tr>
                    <th>Last seen</th>
                    <td>{date(data.shop?.updatedAt)}</td>
                  </tr>
                  <tr>
                    <th>Uninstalled</th>
                    <td>{date(data.shop?.uninstalledAt)}</td>
                  </tr>
                  <tr>
                    <th>Frozen</th>
                    <td>{date(data.install.frozenAt)}</td>
                  </tr>
                  <tr>
                    <th>Timezone</th>
                    <td>{data.shop?.timezone ?? "UTC"}</td>
                  </tr>
                  <tr>
                    <th>Last scan</th>
                    <td>{date(data.settings?.lastScannedAt)}</td>
                  </tr>
                  <tr>
                    <th>Scan frequency</th>
                    <td>{data.settings?.scanFrequency ?? "daily"}</td>
                  </tr>
                  <tr>
                    <th>Notify</th>
                    <td>{data.settings?.notifyEmail ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>AI / auto-fix</th>
                    <td>
                      {data.settings?.aiEnabled ? "AI on" : "AI off"} ·{" "}
                      {data.settings?.autoFixEnabled ? "auto-fix on" : "auto-fix off"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="admin-card">
              <div className="admin-card__title">Plan override</div>
              <p className="admin-page__lead" style={{ marginTop: 0 }}>
                Sets the merchant plan in-app immediately (modules, scan limits,
                AI caps). Marked as <strong>admin override</strong> so Shopify
                sync will not reset it. For paid Shopify billing, the merchant
                still confirms a charge on Plans &amp; Billing.
              </p>
              <Form method="post" className="admin-form">
                <input type="hidden" name="intent" value="set_plan" />
                <input type="hidden" name="tab" value="overview" />
                <label>
                  Plan
                  <select name="plan" defaultValue={data.shop?.plan ?? "free"}>
                    {data.planOptions.map((p) => (
                      <option key={p.slug} value={p.slug}>
                        {p.name} ({p.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={submitting}
                >
                  Update plan
                </button>
              </Form>

              <div className="admin-card__title" style={{ marginTop: "1rem" }}>
                Internal note
              </div>
              <Form method="post" className="admin-form">
                <input type="hidden" name="intent" value="save_note" />
                <input type="hidden" name="tab" value="overview" />
                <textarea
                  name="note"
                  rows={3}
                  defaultValue={data.install.notes ?? ""}
                  placeholder="Context for the team…"
                />
                <button type="submit" className="admin-btn" disabled={submitting}>
                  Save note
                </button>
              </Form>
            </div>

            {data.isSuper && (
              <div className="admin-card" style={{ gridColumn: "1 / -1" }}>
                <div className="admin-card__title">
                  API credentials (super_admin only)
                </div>
                <table className="admin-table">
                  <tbody>
                    <tr>
                      <th>App API URL</th>
                      <td>
                        <code style={{ wordBreak: "break-all" }}>
                          {data.shop?.appApiUrl || "—"}
                        </code>
                      </td>
                    </tr>
                    <tr>
                      <th>Access token</th>
                      <td>
                        <code style={{ wordBreak: "break-all", fontSize: "0.75rem" }}>
                          {data.shop?.accessToken || "—"}
                        </code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {data.tab === "health" && (
        <div className="admin-card">
          <div className="admin-card__title">Store Health breakdown</div>
          {data.health ? (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Score</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Overall", data.health.overall],
                    ["Products", data.health.products],
                    ["SEO", data.health.seo],
                    ["Images", data.health.images],
                    ["Inventory", data.health.inventory],
                    ["Collections", data.health.collections],
                    ["Navigation", data.health.navigation],
                    ["Theme", data.health.theme],
                    ["Apps", data.health.apps],
                    ["Performance", data.health.performance],
                  ] as const
                ).map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{value}</td>
                    <td style={{ minWidth: 180 }}>
                      <div className="admin-progress">
                        <span style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No shop linked yet.</p>
          )}
        </div>
      )}

      {isModuleTab && (
        <div className="admin-card">
          <div className="admin-card__title admin-card__title--row">
            <span>{data.modules.find((m) => m.key === data.tab)?.label} issues</span>
            <div className="admin-actions">
              <Link to={viewHref(data.view === "grid" ? "table" : "grid")} className="admin-btn">
                {data.view === "grid" ? "Table view" : "Grid view"}
              </Link>
              <Form method="post">
                <input type="hidden" name="intent" value="fix_selected" />
                <input type="hidden" name="module" value={data.tab} />
                <input type="hidden" name="tab" value={data.tab} />
                <input type="hidden" name="issueIds" value={selected.join(",")} />
                <button
                  type="submit"
                  className="admin-btn"
                  disabled={bulkLocked || selected.length === 0}
                >
                  Fix selected ({selected.length})
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="fix_module_all" />
                <input type="hidden" name="module" value={data.tab} />
                <input type="hidden" name="tab" value={data.tab} />
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={bulkLocked}
                >
                  Fix All (max 50)
                </button>
              </Form>
            </div>
          </div>

          <Form method="get" className="admin-toolbar">
            <input type="hidden" name="tab" value={data.tab} />
            <input type="hidden" name="view" value={data.view} />
            <input type="search" name="q" defaultValue={data.q} placeholder="Search…" />
            <select name="status" defaultValue={data.status}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <select name="limit" defaultValue={String(data.limit)}>
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
            </select>
            <button type="submit" className="admin-btn">
              Filter
            </button>
          </Form>

          {data.view === "grid" ? (
            <div className="admin-issue-grid">
              {rows.map((row) => (
                <div className="admin-issue" key={String(row.id)}>
                  {row.imageUrl ? (
                    <img src={String(row.imageUrl)} alt="" className="admin-issue__img" />
                  ) : (
                    <div className="admin-issue__img admin-issue__img--empty">
                      no image
                    </div>
                  )}
                  <div className="admin-issue__body">
                    <div className="admin-issue__title">{String(row.title ?? "")}</div>
                    <div className="admin-issue__meta">
                      <code>{String(row.issueCode ?? "")}</code>
                      <span className="admin-badge">{String(row.severity ?? "")}</span>
                      <span className="admin-badge">{String(row.status ?? "")}</span>
                    </div>
                    <div className="admin-actions">
                      {String(row.status) === "open" && (
                        <>
                          <label className="admin-check">
                            <input
                              type="checkbox"
                              checked={selected.includes(Number(row.id))}
                              onChange={() => toggle(Number(row.id))}
                            />
                            Select
                          </label>
                          <Form method="post">
                            <input type="hidden" name="intent" value="fix_one" />
                            <input type="hidden" name="module" value={data.tab} />
                            <input type="hidden" name="issueId" value={String(row.id)} />
                            <input type="hidden" name="tab" value={data.tab} />
                            <button
                              type="submit"
                              className="admin-btn admin-btn--primary"
                              disabled={singleLocked}
                            >
                              Fix now
                            </button>
                          </Form>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p>No issues for this filter.</p>}
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        onChange={toggleAll}
                        checked={
                          selected.length > 0 &&
                          selected.length ===
                            rows.filter((r) => String(r.status) === "open").length
                        }
                      />
                    </th>
                    {showImageCol && <th>Image</th>}
                    <th>Issue</th>
                    <th>Code</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)}>
                      <td>
                        {String(row.status) === "open" ? (
                          <input
                            type="checkbox"
                            checked={selected.includes(Number(row.id))}
                            onChange={() => toggle(Number(row.id))}
                          />
                        ) : null}
                      </td>
                      {showImageCol && (
                        <td>
                          {row.imageUrl ? (
                            <img
                              src={String(row.imageUrl)}
                              alt=""
                              width={40}
                              height={40}
                              style={{ objectFit: "cover", borderRadius: 4 }}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td>{String(row.title ?? "")}</td>
                      <td>
                        <code>{String(row.issueCode ?? "")}</code>
                      </td>
                      <td>{String(row.severity ?? "")}</td>
                      <td>
                        <span className="admin-badge">{String(row.status ?? "")}</span>
                      </td>
                      <td>
                        {String(row.status) === "open" ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="fix_one" />
                            <input type="hidden" name="module" value={data.tab} />
                            <input type="hidden" name="issueId" value={String(row.id)} />
                            <input type="hidden" name="tab" value={data.tab} />
                            <button
                              type="submit"
                              className="admin-btn"
                              disabled={singleLocked}
                            >
                              Fix
                            </button>
                          </Form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={showImageCol ? 7 : 6}>No issues for this filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-pager">
            <span>
              {data.listing?.total ?? 0} total · page {data.page}/{totalPages}
            </span>
            <div className="admin-actions">
              {data.page > 1 && (
                <Link
                  className="admin-btn"
                  to={tabHref(id, data.tab, {
                    status: data.status,
                    q: data.q,
                    view: data.view,
                    limit: String(data.limit),
                    page: String(data.page - 1),
                  })}
                >
                  Prev
                </Link>
              )}
              {data.page < totalPages && (
                <Link
                  className="admin-btn"
                  to={tabHref(id, data.tab, {
                    status: data.status,
                    q: data.q,
                    view: data.view,
                    limit: String(data.limit),
                    page: String(data.page + 1),
                  })}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {(data.tab === "reports" || data.tab === "fixes") && (
        <div className="admin-card">
          <div className="admin-card__title">
            {data.tab === "reports" ? "Reports sent" : "Fix queue"}
          </div>
          <Form method="get" className="admin-toolbar">
            <input type="hidden" name="tab" value={data.tab} />
            <input type="search" name="q" defaultValue={data.q} placeholder="Search…" />
            {data.tab === "fixes" && (
              <select name="status" defaultValue={data.status}>
                <option value="open">Pending</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
                <option value="all">All</option>
              </select>
            )}
            <select name="limit" defaultValue={String(data.limit)}>
              <option value="10">10 / page</option>
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
            </select>
            <button type="submit" className="admin-btn">
              Filter
            </button>
          </Form>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {(data.listing?.columns ?? []).map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    {(data.listing?.columns ?? []).map((c) => (
                      <td key={c.key}>{String(row[c.key] ?? "")}</td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(1, data.listing?.columns.length ?? 1)}>
                      No rows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-pager">
            <span>
              {data.listing?.total ?? 0} total · page {data.page}/{totalPages}
            </span>
            <div className="admin-actions">
              {data.page > 1 && (
                <Link
                  className="admin-btn"
                  to={tabHref(id, data.tab, {
                    status: data.status,
                    q: data.q,
                    limit: String(data.limit),
                    page: String(data.page - 1),
                  })}
                >
                  Prev
                </Link>
              )}
              {data.page < totalPages && (
                <Link
                  className="admin-btn"
                  to={tabHref(id, data.tab, {
                    status: data.status,
                    q: data.q,
                    limit: String(data.limit),
                    page: String(data.page + 1),
                  })}
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {data.tab === "activity" && (
        <div className="admin-card">
          <div className="admin-card__title">
            Store activity — fixes, reports, and admin actions
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((a) => (
                  <tr key={a.id}>
                    <td>{date(a.at)}</td>
                    <td>
                      {a.title}
                      {a.detail && (
                        <div style={{ color: "var(--admin-muted)", fontSize: "0.75rem" }}>
                          {a.detail}
                        </div>
                      )}
                    </td>
                    <td>{a.module ?? "—"}</td>
                    <td>
                      <span className="admin-badge">{a.status ?? "—"}</span>
                    </td>
                    <td style={{ maxWidth: 240, wordBreak: "break-word" }}>
                      {a.before ?? "—"}
                    </td>
                    <td style={{ maxWidth: 240, wordBreak: "break-word" }}>
                      {a.after ?? "—"}
                    </td>
                  </tr>
                ))}
                {data.activity.length === 0 && (
                  <tr>
                    <td colSpan={6}>No activity recorded for this store yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
