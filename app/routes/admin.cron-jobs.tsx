import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "../db/client";
import {
  activityLogs,
  appSettings,
  cronRunLogs,
  fixQueue,
  shops,
} from "../db/schema";
import { requireRole } from "../services/admin/auth.server";
import { enqueueShopScan } from "../services/shopify/shop-jobs.server";

const JOBS = [
  { name: "daily-scan", path: "/api/cron/daily-scan", label: "Daily scan" },
  { name: "process-jobs", path: "/api/cron/process-jobs", label: "Process queued jobs" },
  { name: "weekly-report", path: "/api/cron/weekly-report", label: "Weekly report" },
] as const;

const PER_PAGE = [10, 25, 50, 100];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRole(request, ["super_admin", "admin"]);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") === "stores" ? "stores" : "runs";
  const jobName = url.searchParams.get("job") || "";
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = PER_PAGE.includes(Number(url.searchParams.get("limit")))
    ? Number(url.searchParams.get("limit"))
    : 25;
  const flash = url.searchParams.get("flash");

  const conditions: SQL[] = [];
  if (jobName) conditions.push(eq(cronRunLogs.jobName, jobName));
  if (status) conditions.push(eq(cronRunLogs.status, status));
  const where = conditions.length ? and(...conditions) : undefined;

  const runs = await db
    .select()
    .from(cronRunLogs)
    .where(where)
    .orderBy(desc(cronRunLogs.startedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ n }] = await db.select({ n: count() }).from(cronRunLogs).where(where);

  const byStatus = await db
    .select({ status: cronRunLogs.status, n: count() })
    .from(cronRunLogs)
    .groupBy(cronRunLogs.status);

  const statusOptions = await db
    .selectDistinct({ status: cronRunLogs.status })
    .from(cronRunLogs);

  const storeJobs = await db
    .select({
      shopId: shops.id,
      shopDomain: shops.shopDomain,
      frozenAt: shops.frozenAt,
      jobStatus: appSettings.jobStatus,
      jobType: appSettings.jobType,
      jobMessage: appSettings.jobMessage,
      jobStartedAt: appSettings.jobStartedAt,
      jobFinishedAt: appSettings.jobFinishedAt,
      lastScannedAt: appSettings.lastScannedAt,
      pendingFixes: sql<number>`(select count(*) from fix_queue fq where fq.shop_id = ${shops.id} and fq.status = 'pending' and fq.deleted_at is null)`,
      failedFixes: sql<number>`(select count(*) from fix_queue fq where fq.shop_id = ${shops.id} and fq.status = 'failed' and fq.deleted_at is null)`,
    })
    .from(shops)
    .leftJoin(appSettings, eq(appSettings.shopId, shops.id))
    .where(isNull(shops.deletedAt))
    .orderBy(desc(appSettings.jobStartedAt))
    .limit(200);

  const [busyRow] = await db
    .select({ n: count() })
    .from(appSettings)
    .where(inArray(appSettings.jobStatus, ["queued", "running"]));

  const [pendingRow] = await db
    .select({ n: count() })
    .from(fixQueue)
    .where(and(eq(fixQueue.status, "pending"), isNull(fixQueue.deletedAt)));

  return {
    view,
    flash,
    filters: { jobName, status },
    page,
    limit,
    total: n,
    byStatus,
    statusOptions: statusOptions.map((s) => s.status).filter(Boolean),
    jobs: JOBS.map((j) => ({ name: j.name, label: j.label })),
    busyStores: busyRow?.n ?? 0,
    pendingFixTotal: pendingRow?.n ?? 0,
    runs: runs.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      status: r.status,
      shopsProcessed: r.shopsProcessed,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
    })),
    storeJobs: storeJobs.map((s) => ({
      ...s,
      pendingFixes: Number(s.pendingFixes ?? 0),
      failedFixes: Number(s.failedFixes ?? 0),
      frozen: Boolean(s.frozenAt),
      jobStatus: s.jobStatus || "idle",
      jobStartedAt: s.jobStartedAt ? new Date(s.jobStartedAt).toISOString() : null,
      jobFinishedAt: s.jobFinishedAt
        ? new Date(s.jobFinishedAt).toISOString()
        : null,
      lastScannedAt: s.lastScannedAt
        ? new Date(s.lastScannedAt).toISOString()
        : null,
      frozenAt: s.frozenAt ? new Date(s.frozenAt).toISOString() : null,
    })),
  };
}

async function invokeCron(request: Request, jobName: string) {
  const job = JOBS.find((j) => j.name === jobName) ?? JOBS[0];
  const origin = new URL(request.url).origin;
  const secret = process.env.CRON_SECRET || "";
  const res = await fetch(`${origin}${job.path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, label: job.label, body: body.slice(0, 300) };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRole(request, ["super_admin", "admin"]);
  const form = await request.formData();
  const intent = String(form.get("intent") || "run");
  const url = new URL(request.url);
  let flash = "Done";

  if (intent === "run" || intent === "rerun") {
    const jobName = String(form.get("job") || "daily-scan");
    const result = await invokeCron(request, jobName);
    flash = `${result.label}: ${result.ok ? "OK" : "FAILED"} (${result.status}) ${result.body}`;
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: intent === "rerun" ? "cron_rerun" : "cron_run",
      entityType: "cron_job",
      entityId: jobName,
      metaJson: JSON.stringify(result),
    });
  } else if (intent === "requeue_shop") {
    const shopId = Number(form.get("shopId"));
    const result = await enqueueShopScan(shopId);
    flash = result.ok
      ? `Scan queued for shop #${shopId} — next cron tick will run it.`
      : result.error;
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "cron_requeue_shop",
      entityType: "shop",
      entityId: String(shopId),
      metaJson: JSON.stringify(result),
    });
  } else if (intent === "reset_shop") {
    const shopId = Number(form.get("shopId"));
    await db
      .update(appSettings)
      .set({
        jobStatus: "idle",
        jobType: null,
        jobMessage: "Reset by admin.",
        jobFinishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(appSettings.shopId, shopId));
    flash = `Job state reset for shop #${shopId}.`;
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "cron_reset_shop_job",
      entityType: "shop",
      entityId: String(shopId),
    });
  } else if (intent === "retry_failed") {
    const shopId = Number(form.get("shopId"));
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
    flash = `Failed fixes re-queued for shop #${shopId}.`;
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "cron_retry_failed_fixes",
      entityType: "shop",
      entityId: String(shopId),
    });
  }

  const next = new URLSearchParams(url.search);
  next.set("flash", flash);
  return redirect(`/admin/cron-jobs?${next.toString()}`);
}

function statusBadge(status: string) {
  if (status === "success" || status === "ok" || status === "completed")
    return "admin-badge admin-badge--ok";
  if (status === "failed" || status === "error") return "admin-badge admin-badge--err";
  if (status === "running" || status === "queued" || status === "partial")
    return "admin-badge admin-badge--warn";
  return "admin-badge";
}

function fmt(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function duration(a: string | null, b: string | null) {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function AdminCronJobsPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const busy = navigation.state !== "idle";
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  function href(overrides: Record<string, string>) {
    const sp = new URLSearchParams(params);
    sp.delete("flash");
    for (const [k, v] of Object.entries(overrides)) sp.set(k, v);
    return `?${sp.toString()}`;
  }

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <h1>Cron jobs</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            Hobby Vercel: daily-scan 03:00 UTC · process-jobs 03:15 UTC ·
            weekly-report Sun 04:00 UTC. Use Run buttons below for an immediate
            tick. Upgrade to Pro for minute-level crons.
          </p>
        </div>
        <div className="admin-actions">
          {JOBS.map((j) => (
            <Form method="post" key={j.name}>
              <input type="hidden" name="intent" value="run" />
              <input type="hidden" name="job" value={j.name} />
              <button
                type="submit"
                className={
                  j.name === "process-jobs"
                    ? "admin-btn admin-btn--primary"
                    : "admin-btn"
                }
                disabled={busy}
              >
                Run {j.label}
              </button>
            </Form>
          ))}
        </div>
      </div>

      {data.flash && (
        <div className="admin-card" style={{ borderColor: "#86efac" }}>
          {data.flash}
        </div>
      )}

      <div className="admin-tiles">
        <div className="admin-tile">
          <div className="admin-tile__value">{data.busyStores}</div>
          <div className="admin-tile__label">Stores queued / running</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.pendingFixTotal}</div>
          <div className="admin-tile__label">Pending fix-queue items</div>
        </div>
        {data.byStatus.map((s) => (
          <div className="admin-tile" key={s.status}>
            <div className="admin-tile__value">{s.n}</div>
            <div className="admin-tile__label">Runs · {s.status}</div>
          </div>
        ))}
      </div>

      <div className="admin-tabs">
        <Link
          to={href({ view: "runs", page: "1" })}
          className={data.view === "runs" ? "active" : undefined}
        >
          Run history
        </Link>
        <Link
          to={href({ view: "stores", page: "1" })}
          className={data.view === "stores" ? "active" : undefined}
        >
          Store jobs ({data.storeJobs.length})
        </Link>
      </div>

      {data.view === "runs" && (
        <div className="admin-card">
          <Form method="get" className="admin-toolbar">
            <input type="hidden" name="view" value="runs" />
            <select name="job" defaultValue={data.filters.jobName}>
              <option value="">All jobs</option>
              {data.jobs.map((j) => (
                <option key={j.name} value={j.name}>
                  {j.label}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={data.filters.status}>
              <option value="">All statuses</option>
              {data.statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select name="limit" defaultValue={String(data.limit)}>
              {PER_PAGE.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
            <button type="submit" className="admin-btn admin-btn--primary">
              Filter
            </button>
            <Link to="/admin/cron-jobs" className="admin-btn">
              Reset
            </Link>
          </Form>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Shops</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Duration</th>
                  <th>Error</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>{r.jobName}</td>
                    <td>
                      <span className={statusBadge(r.status)}>{r.status}</span>
                    </td>
                    <td>{r.shopsProcessed ?? 0}</td>
                    <td>{fmt(r.startedAt)}</td>
                    <td>{fmt(r.finishedAt)}</td>
                    <td>{duration(r.startedAt, r.finishedAt)}</td>
                    <td style={{ maxWidth: 320 }}>
                      {r.errorMessage ? (
                        <details>
                          <summary className="admin-link-like">View error</summary>
                          <pre className="admin-pre">{r.errorMessage}</pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Form method="post">
                        <input type="hidden" name="intent" value="rerun" />
                        <input type="hidden" name="job" value={r.jobName} />
                        <button type="submit" className="admin-btn" disabled={busy}>
                          Rerun
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
                {data.runs.length === 0 && (
                  <tr>
                    <td colSpan={9}>No cron runs logged for this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pager">
            <span>
              {data.total} runs · page {data.page}/{pages}
            </span>
            <div className="admin-actions">
              <Link
                className="admin-btn"
                to={href({ page: String(Math.max(1, data.page - 1)) })}
              >
                Prev
              </Link>
              <Link
                className="admin-btn"
                to={href({ page: String(Math.min(pages, data.page + 1)) })}
              >
                Next
              </Link>
            </div>
          </div>
        </div>
      )}

      {data.view === "stores" && (
        <div className="admin-card">
          <div className="admin-card__title">
            Per-store job state — scan and bulk fixes run store by store
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Job status</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Last scan</th>
                  <th>Queue</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.storeJobs.map((s) => (
                  <tr key={s.shopId}>
                    <td>
                      {s.shopDomain}
                      {s.frozen && (
                        <div>
                          <span className="admin-badge admin-badge--warn">frozen</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={statusBadge(s.jobStatus)}>{s.jobStatus}</span>
                    </td>
                    <td>{s.jobType || "—"}</td>
                    <td style={{ maxWidth: 280 }}>{s.jobMessage || "—"}</td>
                    <td>{fmt(s.jobStartedAt)}</td>
                    <td>{fmt(s.jobFinishedAt)}</td>
                    <td>{fmt(s.lastScannedAt)}</td>
                    <td>
                      {s.pendingFixes} pending
                      {s.failedFixes > 0 && (
                        <div>
                          <span className="admin-badge admin-badge--err">
                            {s.failedFixes} failed
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <Form method="post">
                          <input type="hidden" name="intent" value="requeue_shop" />
                          <input type="hidden" name="shopId" value={s.shopId} />
                          <button
                            type="submit"
                            className="admin-btn"
                            disabled={busy || s.jobStatus === "running"}
                          >
                            Queue scan
                          </button>
                        </Form>
                        {s.failedFixes > 0 && (
                          <Form method="post">
                            <input type="hidden" name="intent" value="retry_failed" />
                            <input type="hidden" name="shopId" value={s.shopId} />
                            <button type="submit" className="admin-btn" disabled={busy}>
                              Retry failed
                            </button>
                          </Form>
                        )}
                        <Form method="post">
                          <input type="hidden" name="intent" value="reset_shop" />
                          <input type="hidden" name="shopId" value={s.shopId} />
                          <button type="submit" className="admin-btn" disabled={busy}>
                            Reset
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.storeJobs.length === 0 && (
                  <tr>
                    <td colSpan={9}>No stores installed yet.</td>
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
