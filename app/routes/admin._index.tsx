import type { LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { and, count, desc, eq, gte, isNotNull, isNull, ne } from "drizzle-orm";

import { AreaChart, BarChart, DonutChart, StackBars } from "../components/admin/Charts";
import { db } from "../db/client";
import {
  activityLogs,
  adminUsers,
  apiCallLogs,
  appInstalls,
  billingSubscriptions,
  cronRunLogs,
  fixQueue,
  sessions,
  shops,
  supportTickets,
  webhookLogs,
} from "../db/schema";
import { requireAdmin } from "../services/admin/auth.server";
import { PLANS } from "../config/plans";

const DAYS = 30;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number) {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

function bucket(rows: { at: Date | null }[], days: string[]) {
  const map = new Map(days.map((d) => [d, 0]));
  for (const r of rows) {
    if (!r.at) continue;
    const key = dayKey(new Date(r.at));
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return days.map((label) => ({ label: label.slice(5), value: map.get(label) ?? 0 }));
}

function planPrice(plan: string) {
  return plan in PLANS ? PLANS[plan as keyof typeof PLANS].priceCents : 0;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    [activeRow],
    [totalRow],
    [uninstalledRow],
    [uninstalledMonth],
    [installsMonth],
    [ticketsOpen],
    [ticketsDone],
    [webhookErrorsRow],
    [webhookTotalRow],
    [shopsWithToken],
    [adminCount],
    [sessionCount],
    [apiErr24h],
    [pendingFixes],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(appInstalls)
      .where(and(isNull(appInstalls.deletedAt), eq(appInstalls.status, "active"))),
    db.select({ n: count() }).from(appInstalls).where(isNull(appInstalls.deletedAt)),
    db
      .select({ n: count() })
      .from(appInstalls)
      .where(
        and(isNull(appInstalls.deletedAt), eq(appInstalls.status, "uninstalled")),
      ),
    db
      .select({ n: count() })
      .from(appInstalls)
      .where(
        and(
          isNull(appInstalls.deletedAt),
          eq(appInstalls.status, "uninstalled"),
          gte(appInstalls.updatedAt, monthStart),
        ),
      ),
    db
      .select({ n: count() })
      .from(appInstalls)
      .where(and(isNull(appInstalls.deletedAt), gte(appInstalls.createdAt, monthStart))),
    db
      .select({ n: count() })
      .from(supportTickets)
      .where(
        and(isNull(supportTickets.deletedAt), eq(supportTickets.status, "open")),
      ),
    db
      .select({ n: count() })
      .from(supportTickets)
      .where(
        and(isNull(supportTickets.deletedAt), ne(supportTickets.status, "open")),
      ),
    db
      .select({ n: count() })
      .from(webhookLogs)
      .where(
        and(eq(webhookLogs.status, "error"), gte(webhookLogs.createdAt, since24h)),
      ),
    db.select({ n: count() }).from(webhookLogs).where(gte(webhookLogs.createdAt, since24h)),
    db
      .select({ n: count() })
      .from(shops)
      .where(and(isNull(shops.deletedAt), isNotNull(shops.accessToken))),
    db.select({ n: count() }).from(adminUsers).where(isNull(adminUsers.deletedAt)),
    db.select({ n: count() }).from(sessions),
    db
      .select({ n: count() })
      .from(apiCallLogs)
      .where(
        and(eq(apiCallLogs.status, "error"), gte(apiCallLogs.createdAt, since24h)),
      ),
    db
      .select({ n: count() })
      .from(fixQueue)
      .where(and(eq(fixQueue.status, "pending"), isNull(fixQueue.deletedAt))),
  ]);

  const days = lastNDays(DAYS);

  const installTrendRows = await db
    .select({ at: appInstalls.createdAt })
    .from(appInstalls)
    .where(and(isNull(appInstalls.deletedAt), gte(appInstalls.createdAt, since30d)));
  const uninstallTrendRows = await db
    .select({ at: appInstalls.updatedAt })
    .from(appInstalls)
    .where(
      and(
        isNull(appInstalls.deletedAt),
        eq(appInstalls.status, "uninstalled"),
        gte(appInstalls.updatedAt, since30d),
      ),
    );

  const subs = await db.query.billingSubscriptions.findMany({
    where: and(
      eq(billingSubscriptions.status, "active"),
      isNull(billingSubscriptions.deletedAt),
    ),
  });

  let mrrCents = 0;
  const revenueByPlan: Record<string, number> = {};
  const countByPlan: Record<string, number> = {};
  for (const s of subs) {
    const price = planPrice(s.plan);
    mrrCents += price;
    revenueByPlan[s.plan] = (revenueByPlan[s.plan] ?? 0) + price;
    countByPlan[s.plan] = (countByPlan[s.plan] ?? 0) + 1;
  }

  // Cumulative MRR trend: subs active on each day, priced at today's plan price.
  const subStarts = subs
    .map((s) => ({
      at: s.createdAt ? new Date(s.createdAt) : null,
      cents: planPrice(s.plan),
    }))
    .filter((s) => s.at);
  const mrrTrend = days.map((day) => {
    const cutoff = new Date(`${day}T23:59:59`);
    const cents = subStarts
      .filter((s) => s.at! <= cutoff)
      .reduce((sum, s) => sum + s.cents, 0);
    return { label: day.slice(5), value: cents / 100 };
  });

  const shopPlans = await db
    .select({ plan: shops.plan, n: count() })
    .from(shops)
    .where(isNull(shops.deletedAt))
    .groupBy(shops.plan);

  const recentInstalls = await db
    .select({
      id: appInstalls.id,
      shopDomain: appInstalls.shopDomain,
      status: appInstalls.status,
      createdAt: appInstalls.createdAt,
    })
    .from(appInstalls)
    .where(isNull(appInstalls.deletedAt))
    .orderBy(desc(appInstalls.id))
    .limit(10);

  const recentTickets = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      shopDomain: shops.shopDomain,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .innerJoin(shops, eq(supportTickets.shopId, shops.id))
    .where(isNull(supportTickets.deletedAt))
    .orderBy(desc(supportTickets.id))
    .limit(10);

  const recentCron = await db.query.cronRunLogs.findMany({
    orderBy: [desc(cronRunLogs.id)],
    limit: 10,
  });

  const recentWebhooks = await db.query.webhookLogs.findMany({
    orderBy: [desc(webhookLogs.id)],
    limit: 10,
  });

  const recentAudit = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      actorName: adminUsers.name,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(adminUsers, eq(activityLogs.actorAdminUserId, adminUsers.id))
    .orderBy(desc(activityLogs.id))
    .limit(10);

  const lastCron = recentCron[0] ?? null;

  const total = totalRow.n || 1;
  const churnPct = Math.round(((uninstalledMonth.n || 0) / total) * 1000) / 10;
  const webhookFailRate =
    webhookTotalRow.n > 0
      ? Math.round((webhookErrorsRow.n / webhookTotalRow.n) * 1000) / 10
      : 0;

  const installs30d = installTrendRows.length;
  const uninstalls30d = uninstallTrendRows.length;
  const netPerDay = (installs30d - uninstalls30d) / DAYS;
  const arpuCents = subs.length > 0 ? Math.round(mrrCents / subs.length) : 0;
  const projectedNextMonthCents = Math.max(
    0,
    Math.round(mrrCents + netPerDay * 30 * arpuCents),
  );

  return {
    active: activeRow.n,
    total: totalRow.n,
    uninstalled: uninstalledRow.n,
    installsMonth: installsMonth.n,
    churnPct,
    openTickets: ticketsOpen.n,
    doneTickets: ticketsDone.n,
    webhookErrors24h: webhookErrorsRow.n,
    webhookFailRate,
    shopsWithToken: shopsWithToken.n,
    adminCount: adminCount.n,
    sessionCount: sessionCount.n,
    apiErr24h: apiErr24h.n,
    pendingFixes: pendingFixes.n,
    revenue: {
      mrrCents,
      arrCents: mrrCents * 12,
      perDayCents: Math.round(mrrCents / 30),
      perYearPerStoreCents: subs.length ? Math.round((mrrCents * 12) / subs.length) : 0,
      arpuCents,
      paidSubs: subs.length,
      projectedNextMonthCents,
      netPerDay: Math.round(netPerDay * 100) / 100,
    },
    charts: {
      installTrend: bucket(installTrendRows, days),
      uninstallTrend: bucket(uninstallTrendRows, days),
      mrrTrend,
      revenueByPlan: Object.entries(revenueByPlan).map(([label, cents]) => ({
        label: `${label} (${countByPlan[label]})`,
        value: cents / 100,
      })),
      shopPlans: shopPlans.map((p) => ({ label: p.plan, value: p.n })),
    },
    recentInstalls: recentInstalls.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
    recentTickets: recentTickets.map((t) => ({
      ...t,
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    })),
    recentCron: recentCron.map((c) => ({
      id: c.id,
      jobName: c.jobName,
      status: c.status,
      shopsProcessed: c.shopsProcessed,
      startedAt: c.startedAt ? new Date(c.startedAt).toISOString() : null,
    })),
    recentWebhooks: recentWebhooks.map((w) => ({
      id: w.id,
      topic: w.topic,
      status: w.status,
      shopDomain: w.shopDomain,
      createdAt: w.createdAt ? new Date(w.createdAt).toISOString() : null,
    })),
    recentAudit: recentAudit.map((a) => ({
      ...a,
      createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
    })),
    lastCron: lastCron
      ? {
          jobName: lastCron.jobName,
          status: lastCron.status,
          shopsProcessed: lastCron.shopsProcessed,
          startedAt: lastCron.startedAt
            ? new Date(lastCron.startedAt).toISOString()
            : null,
        }
      : null,
  };
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="admin-card__title admin-card__title--row">
      <span>{title}</span>
      <Link to={to} className="admin-btn">
        View all
      </Link>
    </div>
  );
}

export default function AdminDashboard() {
  const data = useLoaderData<typeof loader>();
  const r = data.revenue;

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <h1>Platform control center</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            Installs, recurring revenue, background jobs, and support — last 30
            days.
          </p>
        </div>
        <div className="admin-actions">
          <Link to="/admin/installs" className="admin-btn admin-btn--primary">
            Manage stores
          </Link>
          <Link to="/admin/cron-jobs" className="admin-btn">
            Cron jobs
          </Link>
          <Link to="/admin/billing-plans" className="admin-btn">
            Plans
          </Link>
        </div>
      </div>

      <div className="admin-tiles">
        <div className="admin-tile">
          <div className="admin-tile__value">{money(r.mrrCents)}</div>
          <div className="admin-tile__label">MRR · {r.paidSubs} paid subs</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{money(r.arrCents)}</div>
          <div className="admin-tile__label">ARR (run rate)</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{money(r.perDayCents)}</div>
          <div className="admin-tile__label">Average revenue / day</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{money(r.arpuCents)}</div>
          <div className="admin-tile__label">ARPU / store / month</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{money(r.projectedNextMonthCents)}</div>
          <div className="admin-tile__label">
            Next month projection · {r.netPerDay} net installs/day
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.active}</div>
          <div className="admin-tile__label">
            Active installs · {data.total} lifetime
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.churnPct}%</div>
          <div className="admin-tile__label">
            MTD churn · {data.installsMonth} new this month
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.pendingFixes}</div>
          <div className="admin-tile__label">Fixes waiting in cron queue</div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.openTickets}</div>
          <div className="admin-tile__label">
            Open tickets · {data.doneTickets} closed
          </div>
        </div>
        <div className="admin-tile">
          <div className="admin-tile__value">{data.webhookFailRate}%</div>
          <div className="admin-tile__label">
            Webhook fail 24h ({data.webhookErrors24h}) · {data.apiErr24h} API errors
          </div>
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card__title">Recurring revenue trend (30 days)</div>
          <AreaChart data={data.charts.mrrTrend} format={(n) => `$${n.toFixed(2)}`} />
        </div>
        <div className="admin-card">
          <div className="admin-card__title">Revenue by plan</div>
          <DonutChart
            data={data.charts.revenueByPlan}
            format={(n) => `$${n.toFixed(2)}`}
          />
        </div>
        <div className="admin-card">
          <div className="admin-card__title">New installs / day</div>
          <BarChart data={data.charts.installTrend} color="#0f766e" />
        </div>
        <div className="admin-card">
          <div className="admin-card__title">Uninstalls / day</div>
          <BarChart data={data.charts.uninstallTrend} color="#ef4444" />
        </div>
        <div className="admin-card">
          <div className="admin-card__title">Stores per plan</div>
          <StackBars data={data.charts.shopPlans} />
        </div>
        <div className="admin-card">
          <div className="admin-card__title">System health</div>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--admin-muted)" }}>
            Last cron:{" "}
            {data.lastCron
              ? `${data.lastCron.jobName} · ${data.lastCron.status} · ${data.lastCron.shopsProcessed ?? 0} shops · ${fmt(data.lastCron.startedAt)}`
              : "No runs yet"}
          </p>
          <ul className="admin-facts">
            <li>
              <span>Stores with API token</span>
              <b>{data.shopsWithToken}</b>
            </li>
            <li>
              <span>Shopify sessions</span>
              <b>{data.sessionCount}</b>
            </li>
            <li>
              <span>Admin users</span>
              <b>{data.adminCount}</b>
            </li>
          </ul>
          <div className="admin-actions">
            <Link to="/admin/cron-jobs" className="admin-btn">
              Cron
            </Link>
            <Link to="/admin/webhooks-health" className="admin-btn">
              Webhooks
            </Link>
            <Link to="/admin/audit-log" className="admin-btn">
              Audit log
            </Link>
          </div>
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card">
          <SectionHeader title="Last 10 installs" to="/admin/installs" />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInstalls.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/admin/installs/${row.id}`}>{row.shopDomain}</Link>
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
                  <td>{fmt(row.createdAt)}</td>
                </tr>
              ))}
              {data.recentInstalls.length === 0 && (
                <tr>
                  <td colSpan={3}>No installs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card">
          <SectionHeader title="Last 10 tickets" to="/admin/support-tickets" />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Store</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTickets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/admin/support-tickets/${t.id}`}>
                      #{t.id} {t.subject}
                    </Link>
                  </td>
                  <td>{t.shopDomain}</td>
                  <td>
                    <span className="admin-badge">{t.status}</span>
                  </td>
                </tr>
              ))}
              {data.recentTickets.length === 0 && (
                <tr>
                  <td colSpan={3}>No tickets</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card">
          <SectionHeader title="Last 10 cron runs" to="/admin/cron-jobs" />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Status</th>
                <th>Shops</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentCron.map((c) => (
                <tr key={c.id}>
                  <td>{c.jobName}</td>
                  <td>
                    <span
                      className={
                        c.status === "failed"
                          ? "admin-badge admin-badge--err"
                          : c.status === "partial" || c.status === "running"
                            ? "admin-badge admin-badge--warn"
                            : "admin-badge admin-badge--ok"
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>{c.shopsProcessed ?? 0}</td>
                  <td>{fmt(c.startedAt)}</td>
                </tr>
              ))}
              {data.recentCron.length === 0 && (
                <tr>
                  <td colSpan={4}>No cron runs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card">
          <SectionHeader title="Last 10 webhooks" to="/admin/webhooks-health" />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Store</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentWebhooks.map((w) => (
                <tr key={w.id}>
                  <td>{w.topic}</td>
                  <td>{w.shopDomain ?? "—"}</td>
                  <td>
                    <span
                      className={
                        w.status === "error"
                          ? "admin-badge admin-badge--err"
                          : "admin-badge admin-badge--ok"
                      }
                    >
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
              {data.recentWebhooks.length === 0 && (
                <tr>
                  <td colSpan={3}>No webhooks yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-card" style={{ gridColumn: "1 / -1" }}>
          <SectionHeader title="Last 10 admin actions" to="/admin/audit-log" />
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {data.recentAudit.map((a) => (
                <tr key={a.id}>
                  <td>{fmt(a.createdAt)}</td>
                  <td>{a.actorName || "system"}</td>
                  <td>
                    <code>{a.action}</code>
                  </td>
                  <td>
                    {a.entityType || "—"}
                    {a.entityId ? ` #${a.entityId}` : ""}
                  </td>
                </tr>
              ))}
              {data.recentAudit.length === 0 && (
                <tr>
                  <td colSpan={4}>No admin activity yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
