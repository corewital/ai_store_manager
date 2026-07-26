import type { LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { and, count, desc, eq, gte, like, lte, or, type SQL } from "drizzle-orm";

import { db } from "../db/client";
import { activityLogs, adminUsers } from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";

const PER_PAGE = [10, 25, 50, 100, 200];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  if (!(await can(request, "audit.view"))) {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const entityType = (url.searchParams.get("entityType") || "").trim();
  const actor = url.searchParams.get("actor") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = PER_PAGE.includes(Number(url.searchParams.get("limit")))
    ? Number(url.searchParams.get("limit"))
    : 25;

  const conditions: SQL[] = [];
  if (action) conditions.push(eq(activityLogs.action, action));
  if (entityType) conditions.push(eq(activityLogs.entityType, entityType));
  if (actor === "system") {
    conditions.push(eq(activityLogs.actorAdminUserId, 0));
  } else if (actor) {
    conditions.push(eq(activityLogs.actorAdminUserId, Number(actor)));
  }
  if (from) conditions.push(gte(activityLogs.createdAt, new Date(`${from}T00:00:00`)));
  if (to) conditions.push(lte(activityLogs.createdAt, new Date(`${to}T23:59:59`)));
  if (q) {
    conditions.push(
      or(
        like(activityLogs.action, `%${q}%`),
        like(activityLogs.entityId, `%${q}%`),
        like(activityLogs.metaJson, `%${q}%`),
        like(activityLogs.ip, `%${q}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      metaJson: activityLogs.metaJson,
      actorName: adminUsers.name,
      actorEmail: adminUsers.email,
      ip: activityLogs.ip,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(adminUsers, eq(activityLogs.actorAdminUserId, adminUsers.id))
    .where(where)
    .orderBy(desc(activityLogs.id))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ n }] = await db
    .select({ n: count() })
    .from(activityLogs)
    .where(where);

  const actions = await db
    .select({ value: activityLogs.action, n: count() })
    .from(activityLogs)
    .groupBy(activityLogs.action)
    .orderBy(desc(count()))
    .limit(80);

  const entities = await db
    .select({ value: activityLogs.entityType, n: count() })
    .from(activityLogs)
    .groupBy(activityLogs.entityType)
    .limit(40);

  const actors = await db
    .select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email })
    .from(adminUsers)
    .limit(100);

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
    total: n,
    page,
    limit,
    filters: { q, action, entityType, actor, from, to },
    actions: actions.filter((a) => a.value),
    entities: entities.filter((e) => e.value),
    actors,
  };
}

function prettyMeta(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function AdminAuditLog() {
  const data = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  function pageHref(next: number) {
    const sp = new URLSearchParams(params);
    sp.set("page", String(next));
    sp.set("limit", String(data.limit));
    return `?${sp.toString()}`;
  }

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Every admin action across installs, users, billing, cron, and support.
        Filter by actor, action, entity, or date, then expand a row for the full
        payload.
      </p>

      <div className="admin-card">
        <Form method="get" className="admin-toolbar">
          <input
            type="search"
            name="q"
            defaultValue={data.filters.q}
            placeholder="Search action, entity id, payload, IP…"
          />
          <select name="action" defaultValue={data.filters.action}>
            <option value="">All actions</option>
            {data.actions.map((a) => (
              <option key={a.value} value={a.value ?? ""}>
                {a.value} ({a.n})
              </option>
            ))}
          </select>
          <select name="entityType" defaultValue={data.filters.entityType}>
            <option value="">All entities</option>
            {data.entities.map((e) => (
              <option key={e.value} value={e.value ?? ""}>
                {e.value}
              </option>
            ))}
          </select>
          <select name="actor" defaultValue={data.filters.actor}>
            <option value="">All actors</option>
            {data.actors.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name || a.email}
              </option>
            ))}
          </select>
          <input type="date" name="from" defaultValue={data.filters.from} />
          <input type="date" name="to" defaultValue={data.filters.to} />
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
          <Link to="/admin/audit-log" className="admin-btn">
            Reset
          </Link>
        </Form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>IP</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const meta = prettyMeta(r.metaJson);
                return (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}
                    </td>
                    <td>
                      {r.actorName || r.actorEmail || (
                        <span className="admin-badge">system</span>
                      )}
                    </td>
                    <td>
                      <code>{r.action}</code>
                    </td>
                    <td>
                      {r.entityType || "—"}
                      {r.entityId ? ` #${r.entityId}` : ""}
                    </td>
                    <td>{r.ip || "—"}</td>
                    <td>
                      {meta ? (
                        <details>
                          <summary className="admin-link-like">View payload</summary>
                          <pre className="admin-pre" style={{ maxWidth: 460 }}>
                            {meta}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={7}>No audit events match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-pager">
          <span>
            {data.total} events · page {data.page}/{pages}
          </span>
          <div className="admin-actions">
            <Link
              className="admin-btn"
              to={pageHref(1)}
              aria-disabled={data.page === 1}
            >
              First
            </Link>
            <Link className="admin-btn" to={pageHref(Math.max(1, data.page - 1))}>
              Prev
            </Link>
            <Link
              className="admin-btn"
              to={pageHref(Math.min(pages, data.page + 1))}
            >
              Next
            </Link>
            <Link className="admin-btn" to={pageHref(pages)}>
              Last
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
