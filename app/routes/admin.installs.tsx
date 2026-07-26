import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  Outlet,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { useState } from "react";

import { db } from "../db/client";
import { activityLogs, appInstalls, appSettings, shops } from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";
import { reconcileInstallRecords } from "../services/shopify/shops.server";
import { enqueueShopScan } from "../services/shopify/shop-jobs.server";

const PER_PAGE = [10, 20, 50, 100];

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

function openIssues(table: string) {
  return sql<number>`(select count(*) from ${sql.raw(table)} t where t.shop_id = ${shops.id} and t.status = 'open' and t.deleted_at is null)`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await reconcileInstallRecords();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status") || "";
  const plan = url.searchParams.get("plan") || "";
  const frozen = url.searchParams.get("frozen") || "";
  const view = url.searchParams.get("view") === "grid" ? "grid" : "table";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = PER_PAGE.includes(Number(url.searchParams.get("limit")))
    ? Number(url.searchParams.get("limit"))
    : 20;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [isNull(appInstalls.deletedAt)];
  if (status) conditions.push(eq(appInstalls.status, status));
  if (plan) conditions.push(eq(shops.plan, plan));
  if (frozen === "1") conditions.push(isNotNull(appInstalls.frozenAt));
  if (frozen === "0") conditions.push(isNull(appInstalls.frozenAt));
  if (q) {
    conditions.push(
      or(like(appInstalls.shopDomain, `%${q}%`), like(appInstalls.notes, `%${q}%`))!,
    );
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      id: appInstalls.id,
      shopId: appInstalls.shopId,
      shopDomain: appInstalls.shopDomain,
      status: appInstalls.status,
      notes: appInstalls.notes,
      frozenAt: appInstalls.frozenAt,
      createdAt: appInstalls.createdAt,
      plan: shops.plan,
      timezone: shops.timezone,
      accessToken: shops.accessToken,
      installedAt: shops.installedAt,
      uninstalledAt: shops.uninstalledAt,
      jobStatus: appSettings.jobStatus,
      jobType: appSettings.jobType,
      lastScannedAt: appSettings.lastScannedAt,
      notifyEmail: appSettings.notifyEmail,
      products: openIssues("product_issues"),
      seo: openIssues("seo_issues"),
      images: openIssues("image_issues"),
      inventory: openIssues("inventory_flags"),
      collections: openIssues("collection_issues"),
      pendingFixes: sql<number>`(select count(*) from fix_queue fq where fq.shop_id = ${shops.id} and fq.status = 'pending' and fq.deleted_at is null)`,
      openTickets: sql<number>`(select count(*) from support_tickets st where st.shop_id = ${shops.id} and st.status = 'open' and st.deleted_at is null)`,
    })
    .from(appInstalls)
    .leftJoin(shops, eq(appInstalls.shopId, shops.id))
    .leftJoin(appSettings, eq(appSettings.shopId, shops.id))
    .where(where)
    .orderBy(desc(appInstalls.id))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(appInstalls)
    .leftJoin(shops, eq(appInstalls.shopId, shops.id))
    .where(where);

  const [summary] = await db
    .select({
      total: count(),
      active: sql<number>`sum(case when ${appInstalls.status} = 'active' then 1 else 0 end)`,
      uninstalled: sql<number>`sum(case when ${appInstalls.status} = 'uninstalled' then 1 else 0 end)`,
      frozen: sql<number>`sum(case when ${appInstalls.frozenAt} is not null then 1 else 0 end)`,
    })
    .from(appInstalls)
    .where(isNull(appInstalls.deletedAt));

  const [tokenRow] = await db
    .select({ n: count() })
    .from(shops)
    .where(and(isNull(shops.deletedAt), isNull(shops.accessToken)));

  const plans = await db
    .select({ plan: shops.plan, n: count() })
    .from(shops)
    .where(isNull(shops.deletedAt))
    .groupBy(shops.plan);

  return {
    rows: rows.map((r) => {
      const issues =
        Number(r.products ?? 0) +
        Number(r.seo ?? 0) +
        Number(r.images ?? 0) +
        Number(r.inventory ?? 0) +
        Number(r.collections ?? 0);
      return {
        id: r.id,
        shopId: r.shopId,
        shopDomain: r.shopDomain,
        storeName: r.shopDomain.replace(/\.myshopify\.com$/i, ""),
        status: r.status,
        notes: r.notes ?? "",
        frozen: Boolean(r.frozenAt),
        frozenAt: r.frozenAt ? new Date(r.frozenAt).toLocaleString() : null,
        plan: r.plan ?? "free",
        timezone: r.timezone ?? "UTC",
        tokenStatus: r.accessToken ? "Connected" : "Missing",
        notifyEmail: r.notifyEmail ?? "",
        jobStatus: r.jobStatus || "idle",
        jobType: r.jobType || "",
        lastScannedAt: r.lastScannedAt
          ? new Date(r.lastScannedAt).toLocaleString()
          : "never",
        installedAt: (r.installedAt ?? r.createdAt)
          ? new Date(r.installedAt ?? r.createdAt!).toLocaleString()
          : "—",
        uninstalledAt: r.uninstalledAt
          ? new Date(r.uninstalledAt).toLocaleString()
          : null,
        counts: {
          products: Number(r.products ?? 0),
          seo: Number(r.seo ?? 0),
          images: Number(r.images ?? 0),
          inventory: Number(r.inventory ?? 0),
          collections: Number(r.collections ?? 0),
          issues,
          pendingFixes: Number(r.pendingFixes ?? 0),
          openTickets: Number(r.openTickets ?? 0),
        },
      };
    }),
    total: n,
    page,
    limit,
    view,
    q,
    status,
    plan,
    frozen,
    plans,
    summary: {
      total: Number(summary?.total ?? 0),
      active: Number(summary?.active ?? 0),
      uninstalled: Number(summary?.uninstalled ?? 0),
      frozen: Number(summary?.frozen ?? 0),
      missingToken: Number(tokenRow?.n ?? 0),
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "installs.manage"))) {
    return json(
      { ok: false, error: "Forbidden — missing installs.manage" },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const bulkIds = String(form.get("ids") || "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
  const singleId = Number(form.get("id"));
  const ids = bulkIds.length
    ? bulkIds
    : Number.isInteger(singleId) && singleId > 0
      ? [singleId]
      : [];

  if (ids.length === 0) {
    return json({ ok: false, error: "Select at least one store" }, { status: 400 });
  }

  const installs = await db
    .select()
    .from(appInstalls)
    .where(
      or(...ids.map((id) => eq(appInstalls.id, id)))!,
    );
  if (installs.length === 0) {
    return json({ ok: false, error: "Install not found" }, { status: 404 });
  }

  let message = "Done";
  const now = new Date();

  if (intent === "freeze" || intent === "unfreeze") {
    const frozenAt = intent === "freeze" ? now : null;
    for (const install of installs) {
      await db
        .update(appInstalls)
        .set({ frozenAt, updatedAt: now })
        .where(eq(appInstalls.id, install.id));
      if (install.shopId) {
        await db
          .update(shops)
          .set({ frozenAt, updatedAt: now })
          .where(eq(shops.id, install.shopId));
      } else {
        await db
          .update(shops)
          .set({ frozenAt, updatedAt: now })
          .where(eq(shops.shopDomain, install.shopDomain));
      }
    }
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: intent === "freeze" ? "install_freeze" : "install_unfreeze",
      entityType: "app_install",
      entityId: ids.join(","),
      metaJson: JSON.stringify({ shops: installs.map((i) => i.shopDomain) }),
      ip: clientIp(request),
    });
    message =
      intent === "freeze"
        ? `Frozen ${installs.length} store(s) — merchant app blocked and cron skipped.`
        : `Unfroze ${installs.length} store(s) — access restored.`;
  } else if (intent === "queue_scan") {
    let queued = 0;
    const errors: string[] = [];
    for (const install of installs) {
      if (!install.shopId) continue;
      const result = await enqueueShopScan(install.shopId);
      if (result.ok) queued += 1;
      else errors.push(`${install.shopDomain}: ${result.error}`);
    }
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "install_queue_scan",
      entityType: "app_install",
      entityId: ids.join(","),
      metaJson: JSON.stringify({ queued, errors }),
      ip: clientIp(request),
    });
    message = `Queued background scan for ${queued} store(s).${errors.length ? ` Skipped: ${errors.join("; ")}` : ""}`;
  } else if (intent === "rescan_note") {
    const note = String(form.get("note") || "").trim();
    await db
      .update(appInstalls)
      .set({ notes: note, updatedAt: now })
      .where(eq(appInstalls.id, ids[0]));
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "install_rescan_note",
      entityType: "app_install",
      entityId: String(ids[0]),
      metaJson: JSON.stringify({ note }),
      ip: clientIp(request),
    });
    message = `Note saved for ${installs[0].shopDomain}`;
  } else {
    return json({ ok: false, error: `Unknown intent: ${intent}` }, { status: 400 });
  }

  const back = new URL(request.url);
  const next = new URLSearchParams(back.search);
  next.set("flash", message);
  return redirect(`/admin/installs?${next.toString()}`);
}

function jobBadge(status: string) {
  if (status === "running" || status === "queued")
    return "admin-badge admin-badge--warn";
  if (status === "failed") return "admin-badge admin-badge--err";
  if (status === "completed") return "admin-badge admin-badge--ok";
  return "admin-badge";
}

export default function AdminInstalls() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<number[]>([]);
  const flash = params.get("flash");
  const busy = navigation.state !== "idle";

  // Parent route for /admin/installs/:id — render the child detail instead.
  if (location.pathname !== "/admin/installs") {
    return <Outlet />;
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  function href(overrides: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete("flash");
    for (const [k, v] of Object.entries(overrides)) next.set(k, v);
    return `?${next.toString()}`;
  }

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const allIds = data.rows.map((r) => r.id);
  const allChecked = allIds.length > 0 && selected.length === allIds.length;

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <h1>App installs</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            Every store that installed the app. <strong>Freeze</strong> blocks the
            merchant app and skips cron; <strong>Queue scan</strong> hands the store
            to the background worker. Tokens are never displayed here.
          </p>
        </div>
        <div className="admin-actions">
          <Link
            to={href({ view: data.view === "grid" ? "table" : "grid" })}
            className="admin-btn"
          >
            {data.view === "grid" ? "Table view" : "Grid view"}
          </Link>
          <Link to="/admin/cron-jobs?view=stores" className="admin-btn">
            Store jobs
          </Link>
        </div>
      </div>

      <div className="admin-tiles">
        <div className="admin-tile">
          <div className="admin-tile__value">{data.summary.total}</div>
          <div className="admin-tile__label">Total installs</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.summary.active}</div>
          <div className="admin-tile__label">Active</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.summary.uninstalled}</div>
          <div className="admin-tile__label">Uninstalled</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.summary.frozen}</div>
          <div className="admin-tile__label">Frozen</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.summary.missingToken}</div>
          <div className="admin-tile__label">Missing API token</div>
        </div>
      </div>

      {(flash || (actionData && "error" in actionData && actionData.error)) && (
        <div
          className="admin-card"
          style={{
            borderColor:
              actionData && "error" in actionData && actionData.error
                ? "#fca5a5"
                : "#86efac",
          }}
        >
          {actionData && "error" in actionData && actionData.error
            ? actionData.error
            : flash}
        </div>
      )}

      <div className="admin-card">
        <Form method="get" className="admin-toolbar">
          <input type="hidden" name="view" value={data.view} />
          <input
            type="search"
            name="q"
            defaultValue={data.q}
            placeholder="Search store or notes…"
          />
          <select name="status" defaultValue={data.status}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="uninstalled">Uninstalled</option>
          </select>
          <select name="plan" defaultValue={data.plan}>
            <option value="">All plans</option>
            {data.plans.map((p) => (
              <option key={p.plan} value={p.plan}>
                {p.plan} ({p.n})
              </option>
            ))}
          </select>
          <select name="frozen" defaultValue={data.frozen}>
            <option value="">Frozen: any</option>
            <option value="1">Frozen only</option>
            <option value="0">Live only</option>
          </select>
          <select name="limit" defaultValue={String(data.limit)}>
            {PER_PAGE.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <button type="submit" className="admin-btn admin-btn--primary">
            Apply
          </button>
          <Link to="/admin/installs" className="admin-btn">
            Reset
          </Link>
        </Form>

        <div className="admin-bulkbar">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => setSelected(allChecked ? [] : allIds)}
            />
            Select page
          </label>
          <span style={{ color: "var(--admin-muted)", fontSize: "0.8125rem" }}>
            {selected.length} selected
          </span>
          {(["queue_scan", "freeze", "unfreeze"] as const).map((intent) => (
            <Form method="post" key={intent}>
              <input type="hidden" name="intent" value={intent} />
              <input type="hidden" name="ids" value={selected.join(",")} />
              <button
                type="submit"
                className={
                  intent === "queue_scan"
                    ? "admin-btn admin-btn--primary"
                    : "admin-btn"
                }
                disabled={busy || selected.length === 0}
              >
                {intent === "queue_scan"
                  ? "Queue scan"
                  : intent === "freeze"
                    ? "Freeze"
                    : "Unfreeze"}
              </button>
            </Form>
          ))}
        </div>

        {data.view === "grid" ? (
          <div className="admin-store-grid">
            {data.rows.map((row) => (
              <div
                key={row.id}
                className={row.frozen ? "admin-store admin-store--frozen" : "admin-store"}
              >
                <div className="admin-store__head">
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </label>
                  <div>
                    <Link to={`/admin/installs/${row.id}`} className="admin-store__name">
                      {row.storeName}
                    </Link>
                    <div className="admin-store__domain">{row.shopDomain}</div>
                  </div>
                  <span
                    className={
                      row.status === "active"
                        ? "admin-badge admin-badge--ok"
                        : "admin-badge"
                    }
                  >
                    {row.status}
                  </span>
                </div>

                <div className="admin-store__badges">
                  <span className="admin-badge">{row.plan}</span>
                  <span
                    className={
                      row.tokenStatus === "Connected"
                        ? "admin-badge admin-badge--ok"
                        : "admin-badge admin-badge--err"
                    }
                  >
                    {row.tokenStatus}
                  </span>
                  <span className={jobBadge(row.jobStatus)}>
                    {row.jobStatus}
                    {row.jobType ? ` · ${row.jobType}` : ""}
                  </span>
                  {row.frozen && (
                    <span className="admin-badge admin-badge--warn">frozen</span>
                  )}
                </div>

                <div className="admin-store__stats">
                  <div>
                    <b>{row.counts.issues}</b>
                    <span>Open issues</span>
                  </div>
                  <div>
                    <b>{row.counts.products}</b>
                    <span>Products</span>
                  </div>
                  <div>
                    <b>{row.counts.seo}</b>
                    <span>SEO</span>
                  </div>
                  <div>
                    <b>{row.counts.images}</b>
                    <span>Images</span>
                  </div>
                  <div>
                    <b>{row.counts.pendingFixes}</b>
                    <span>Queued fixes</span>
                  </div>
                  <div>
                    <b>{row.counts.openTickets}</b>
                    <span>Tickets</span>
                  </div>
                </div>

                <div className="admin-store__meta">
                  Installed {row.installedAt} · last scan {row.lastScannedAt}
                </div>

                <div className="admin-actions">
                  <Link
                    to={`/admin/installs/${row.id}`}
                    className="admin-btn admin-btn--primary"
                  >
                    Open dashboard
                  </Link>
                  <Form method="post">
                    <input type="hidden" name="intent" value="queue_scan" />
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" className="admin-btn" disabled={busy}>
                      Queue scan
                    </button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="id" value={row.id} />
                    <input
                      type="hidden"
                      name="intent"
                      value={row.frozen ? "unfreeze" : "freeze"}
                    />
                    <button type="submit" className="admin-btn" disabled={busy}>
                      {row.frozen ? "Unfreeze" : "Freeze"}
                    </button>
                  </Form>
                </div>
              </div>
            ))}
            {data.rows.length === 0 && <p>No installs found.</p>}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>Store</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Token</th>
                  <th>Background job</th>
                  <th>Open issues</th>
                  <th>Installed / last scan</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    style={
                      row.frozen ? { background: "rgba(251, 191, 36, 0.12)" } : undefined
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td>
                      <Link to={`/admin/installs/${row.id}`} className="admin-store__name">
                        {row.storeName}
                      </Link>
                      <div className="admin-store__domain">{row.shopDomain}</div>
                      {row.frozen && (
                        <span className="admin-badge admin-badge--warn">
                          frozen {row.frozenAt}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          row.status === "active"
                            ? "admin-badge admin-badge--ok"
                            : "admin-badge"
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>{row.plan}</td>
                    <td>
                      <span
                        className={
                          row.tokenStatus === "Connected"
                            ? "admin-badge admin-badge--ok"
                            : "admin-badge admin-badge--err"
                        }
                      >
                        {row.tokenStatus}
                      </span>
                    </td>
                    <td>
                      <span className={jobBadge(row.jobStatus)}>{row.jobStatus}</span>
                      {row.jobType && (
                        <div className="admin-store__domain">{row.jobType}</div>
                      )}
                    </td>
                    <td>
                      <b>{row.counts.issues}</b>
                      <div className="admin-store__domain">
                        P {row.counts.products} · S {row.counts.seo} · I{" "}
                        {row.counts.images} · C {row.counts.collections} · Inv{" "}
                        {row.counts.inventory}
                      </div>
                    </td>
                    <td>
                      {row.installedAt}
                      <div className="admin-store__domain">
                        scan: {row.lastScannedAt}
                      </div>
                    </td>
                    <td>
                      <Form method="post" className="admin-inline-form">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="intent" value="rescan_note" />
                        <input name="note" defaultValue={row.notes} placeholder="Note" />
                        <button type="submit" className="admin-btn" disabled={busy}>
                          Save
                        </button>
                      </Form>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <Link
                          to={`/admin/installs/${row.id}`}
                          className="admin-btn admin-btn--primary"
                        >
                          Details
                        </Link>
                        <Form method="post">
                          <input type="hidden" name="intent" value="queue_scan" />
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className="admin-btn" disabled={busy}>
                            Scan
                          </button>
                        </Form>
                        <Form method="post">
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="intent"
                            value={row.frozen ? "unfreeze" : "freeze"}
                          />
                          <button type="submit" className="admin-btn" disabled={busy}>
                            {row.frozen ? "Unfreeze" : "Freeze"}
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={10}>No installs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-pager">
          <span>
            {data.total} total · page {data.page}/{pages}
          </span>
          <div className="admin-actions">
            <Link className="admin-btn" to={href({ page: String(Math.max(1, data.page - 1)) })}>
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
    </div>
  );
}
