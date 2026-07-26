import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { asc, eq } from "drizzle-orm";

import { db } from "../db/client";
import {
  activityLogs,
  adminUsers,
  appSettings,
  shops,
  supportMessages,
  supportTickets,
} from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";
import { sendReportEmail } from "../services/email/resend.server";

const STATUSES = ["open", "pending", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const id = Number(params.id);
  const ticketRows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      shopDomain: shops.shopDomain,
      shopId: shops.id,
      plan: shops.plan,
      notifyEmail: appSettings.notifyEmail,
    })
    .from(supportTickets)
    .innerJoin(shops, eq(supportTickets.shopId, shops.id))
    .leftJoin(appSettings, eq(appSettings.shopId, shops.id))
    .where(eq(supportTickets.id, id))
    .limit(1);
  const ticket = ticketRows[0];
  if (!ticket) throw new Response("Not found", { status: 404 });

  const messages = await db
    .select({
      id: supportMessages.id,
      body: supportMessages.body,
      fromAdminUserId: supportMessages.fromAdminUserId,
      fromMerchantEmail: supportMessages.fromMerchantEmail,
      adminName: adminUsers.name,
      adminEmail: adminUsers.email,
      createdAt: supportMessages.createdAt,
    })
    .from(supportMessages)
    .leftJoin(adminUsers, eq(supportMessages.fromAdminUserId, adminUsers.id))
    .where(eq(supportMessages.ticketId, id))
    .orderBy(asc(supportMessages.id));

  return {
    ticket: {
      ...ticket,
      createdAt: ticket.createdAt ? new Date(ticket.createdAt).toISOString() : null,
      updatedAt: ticket.updatedAt ? new Date(ticket.updatedAt).toISOString() : null,
    },
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    })),
    emailReady: Boolean(process.env.RESEND_API_KEY),
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "support.reply"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const id = Number(params.id);
  const form = await request.formData();
  const intent = String(form.get("intent") || "reply");

  const ticketRows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      shopId: supportTickets.shopId,
      notifyEmail: appSettings.notifyEmail,
    })
    .from(supportTickets)
    .leftJoin(appSettings, eq(appSettings.shopId, supportTickets.shopId))
    .where(eq(supportTickets.id, id))
    .limit(1);
  const ticket = ticketRows[0];
  if (!ticket) return json({ error: "Not found" }, { status: 404 });

  if (intent === "set_status") {
    const status = String(form.get("status") || "open");
    const priority = String(form.get("priority") || "normal");
    await db
      .update(supportTickets)
      .set({ status, priority, updatedAt: new Date() })
      .where(eq(supportTickets.id, id));
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "support_status_change",
      entityType: "support_ticket",
      entityId: String(id),
      metaJson: JSON.stringify({ status, priority }),
    });
    return redirect(`/admin/support-tickets/${id}`);
  }

  const body = String(form.get("body") || "").trim();
  if (!body) return json({ error: "Message required" }, { status: 400 });
  const nextStatus = String(form.get("nextStatus") || "pending");

  await db.insert(supportMessages).values({
    ticketId: id,
    body,
    fromAdminUserId: user.id,
  });
  await db
    .update(supportTickets)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(supportTickets.id, id));

  const to = ticket.notifyEmail;
  if (to && process.env.RESEND_API_KEY) {
    try {
      await sendReportEmail({
        shopId: ticket.shopId,
        to,
        type: "support",
        subject: `Re: ${ticket.subject}`,
        html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
      });
    } catch {
      await db.insert(activityLogs).values({
        actorAdminUserId: user.id,
        action: "support_reply_email_failed",
        entityType: "support_ticket",
        entityId: String(id),
      });
    }
  } else {
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "support_reply_no_email",
      entityType: "support_ticket",
      entityId: String(id),
      metaJson: JSON.stringify({ bodyPreview: body.slice(0, 120) }),
    });
  }

  return redirect(`/admin/support-tickets/${id}`);
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function AdminSupportTicketDetail() {
  const { ticket, messages, emailReady } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            <Link to="/admin/support-tickets">← Tickets</Link>
          </p>
          <h1>
            #{ticket.id} {ticket.subject}
          </h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            {ticket.shopDomain} · plan {ticket.plan} · opened {fmt(ticket.createdAt)}
          </p>
        </div>
        <div className="admin-actions">
          <span className="admin-badge">{ticket.status}</span>
          <span className="admin-badge admin-badge--warn">{ticket.priority}</span>
          <Link
            to={`/admin/installs?q=${ticket.shopDomain}`}
            className="admin-btn"
          >
            Open store
          </Link>
        </div>
      </div>

      {!emailReady && (
        <div className="admin-card" style={{ borderColor: "#fcd34d" }}>
          RESEND_API_KEY is not set — replies are saved to the thread and shown
          in the merchant app, but no email is sent.
        </div>
      )}

      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card__title">Conversation</div>
          <div className="admin-thread">
            {messages.map((m) => {
              const fromAdmin = Boolean(m.fromAdminUserId);
              return (
                <div
                  key={m.id}
                  className={
                    fromAdmin
                      ? "admin-msg admin-msg--admin"
                      : "admin-msg admin-msg--merchant"
                  }
                >
                  <div className="admin-msg__meta">
                    {fromAdmin
                      ? `${m.adminName || m.adminEmail || "Admin"} (support)`
                      : m.fromMerchantEmail || "Merchant"}
                    {" · "}
                    {fmt(m.createdAt)}
                  </div>
                  <div className="admin-msg__body">{m.body}</div>
                </div>
              );
            })}
            {messages.length === 0 && (
              <p style={{ color: "var(--admin-muted)" }}>No messages yet.</p>
            )}
          </div>

          <Form method="post" className="admin-form" style={{ marginTop: "1rem" }}>
            <input type="hidden" name="intent" value="reply" />
            <label>
              Reply to merchant
              <textarea name="body" rows={5} required />
            </label>
            <label>
              Set status after sending
              <select name="nextStatus" defaultValue="pending">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={busy}
            >
              Send reply
            </button>
          </Form>
        </div>

        <div className="admin-card">
          <div className="admin-card__title">Ticket controls</div>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="set_status" />
            <label>
              Status
              <select name="status" defaultValue={ticket.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={ticket.priority}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="admin-btn" disabled={busy}>
              Update ticket
            </button>
          </Form>

          <table className="admin-table" style={{ marginTop: "1rem" }}>
            <tbody>
              <tr>
                <th>Store</th>
                <td>{ticket.shopDomain}</td>
              </tr>
              <tr>
                <th>Notify email</th>
                <td>{ticket.notifyEmail || "not set"}</td>
              </tr>
              <tr>
                <th>Messages</th>
                <td>{messages.length}</td>
              </tr>
              <tr>
                <th>Last update</th>
                <td>{fmt(ticket.updatedAt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
