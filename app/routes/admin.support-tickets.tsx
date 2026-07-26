import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  useSearchParams,
} from "@remix-run/react";
import { and, count, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";

import { db } from "../db/client";
import { activityLogs, shops, supportTickets } from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
const PER_PAGE = [10, 25, 50, 100];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status") || "";
  const priority = url.searchParams.get("priority") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const limit = PER_PAGE.includes(Number(url.searchParams.get("limit")))
    ? Number(url.searchParams.get("limit"))
    : 25;

  const conditions: SQL[] = [isNull(supportTickets.deletedAt)];
  if (status) conditions.push(eq(supportTickets.status, status));
  if (priority) conditions.push(eq(supportTickets.priority, priority));
  if (q) {
    conditions.push(
      or(
        like(supportTickets.subject, `%${q}%`),
        like(shops.shopDomain, `%${q}%`),
      )!,
    );
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      shopDomain: shops.shopDomain,
      shopId: shops.id,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      messages: sql<number>`(select count(*) from support_messages sm where sm.ticket_id = ${supportTickets.id})`,
      lastReplyAt: sql<string | null>`(select max(sm.created_at) from support_messages sm where sm.ticket_id = ${supportTickets.id})`,
      lastFromAdmin: sql<number | null>`(select sm.from_admin_user_id from support_messages sm where sm.ticket_id = ${supportTickets.id} order by sm.id desc limit 1)`,
    })
    .from(supportTickets)
    .innerJoin(shops, eq(supportTickets.shopId, shops.id))
    .where(where)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const [{ n }] = await db
    .select({ n: count() })
    .from(supportTickets)
    .innerJoin(shops, eq(supportTickets.shopId, shops.id))
    .where(where);

  const byStatus = await db
    .select({ status: supportTickets.status, n: count() })
    .from(supportTickets)
    .where(isNull(supportTickets.deletedAt))
    .groupBy(supportTickets.status);

  return {
    rows: rows.map((r) => ({
      ...r,
      messages: Number(r.messages ?? 0),
      awaitingUs: !r.lastFromAdmin,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      lastReplyAt: r.lastReplyAt ? new Date(r.lastReplyAt).toISOString() : null,
    })),
    total: n,
    page,
    limit,
    filters: { q, status, priority },
    byStatus,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "support.reply"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const ids = String(form.get("ids") || "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);

  if (intent === "bulk_status" && ids.length) {
    const status = String(form.get("status") || "open");
    for (const id of ids) {
      await db
        .update(supportTickets)
        .set({ status, updatedAt: new Date() })
        .where(eq(supportTickets.id, id));
    }
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "support_bulk_status",
      entityType: "support_ticket",
      entityId: ids.join(","),
      metaJson: JSON.stringify({ status, count: ids.length }),
    });
  }

  const url = new URL(request.url);
  return redirect(`/admin/support-tickets${url.search}`);
}

function statusClass(status: string) {
  if (status === "open") return "admin-badge admin-badge--warn";
  if (status === "pending") return "admin-badge";
  if (status === "resolved" || status === "closed")
    return "admin-badge admin-badge--ok";
  return "admin-badge";
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function AdminSupportTickets() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  if (location.pathname !== "/admin/support-tickets") {
    return <Outlet />;
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const allIds = data.rows.map((r) => r.id).join(",");

  function pageHref(next: number) {
    const sp = new URLSearchParams(params);
    sp.set("page", String(next));
    sp.set("limit", String(data.limit));
    return `?${sp.toString()}`;
  }

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Merchant conversations. Replies are stored in the thread and shown to the
        merchant inside the Shopify app (and emailed when Resend is configured).
      </p>

      <div className="admin-tiles">
        {TICKET_STATUSES.map((s) => (
          <div className="admin-tile" key={s}>
            <div className="admin-tile__value">
              {data.byStatus.find((b) => b.status === s)?.n ?? 0}
            </div>
            <div className="admin-tile__label" style={{ textTransform: "capitalize" }}>
              {s}
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card">
        <Form method="get" className="admin-toolbar">
          <input
            type="search"
            name="q"
            defaultValue={data.filters.q}
            placeholder="Search subject or store…"
          />
          <select name="status" defaultValue={data.filters.status}>
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={data.filters.priority}>
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
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
          <Link to="/admin/support-tickets" className="admin-btn">
            Reset
          </Link>
        </Form>

        <Form method="post" className="admin-toolbar">
          <input type="hidden" name="intent" value="bulk_status" />
          <input type="hidden" name="ids" value={allIds} />
          <span style={{ fontSize: "0.8125rem", color: "var(--admin-muted)" }}>
            Bulk set status for this page:
          </span>
          <select name="status" defaultValue="resolved">
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="admin-btn"
            disabled={busy || data.rows.length === 0}
          >
            Apply to {data.rows.length}
          </button>
        </Form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Store</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Messages</th>
                <th>Last reply</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/admin/support-tickets/${r.id}`}>
                      #{r.id} {r.subject}
                    </Link>
                    {r.awaitingUs && (
                      <div>
                        <span className="admin-badge admin-badge--err">
                          needs reply
                        </span>
                      </div>
                    )}
                  </td>
                  <td>{r.shopDomain}</td>
                  <td>
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </td>
                  <td>
                    <span
                      className={
                        r.priority === "high"
                          ? "admin-badge admin-badge--err"
                          : "admin-badge"
                      }
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td>{r.messages}</td>
                  <td>{fmt(r.lastReplyAt)}</td>
                  <td>{fmt(r.createdAt)}</td>
                  <td>
                    <div className="admin-actions">
                      <Link
                        to={`/admin/support-tickets/${r.id}`}
                        className="admin-btn admin-btn--primary"
                      >
                        Open
                      </Link>
                      {r.shopId && (
                        <Link to={`/admin/installs?q=${r.shopDomain}`} className="admin-btn">
                          Store
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={8}>No tickets match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-pager">
          <span>
            {data.total} tickets · page {data.page}/{pages}
          </span>
          <div className="admin-actions">
            <Link className="admin-btn" to={pageHref(Math.max(1, data.page - 1))}>
              Prev
            </Link>
            <Link
              className="admin-btn"
              to={pageHref(Math.min(pages, data.page + 1))}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
