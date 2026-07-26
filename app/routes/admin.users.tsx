import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { DataTable } from "../components/datatable/DataTable";
import { db } from "../db/client";
import { activityLogs, adminUsers, roles } from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";
import { confirmDelete } from "../lib/sweetalert.client";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const roleRows = await db
    .select({ id: roles.id, name: roles.name, slug: roles.slug })
    .from(roles)
    .where(isNull(roles.deletedAt));
  return json({ roles: roleRows });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "users.manage"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "invite") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    const roleId = Number(form.get("roleId"));
    const name = String(form.get("name") || email.split("@")[0]);
    if (!email || !roleId) {
      return json({ error: "Email and role required" }, { status: 400 });
    }

    const token = randomBytes(24).toString("hex");
    await db.insert(adminUsers).values({
      email,
      name,
      roleId,
      status: "invited",
      inviteToken: token,
      invitedAt: new Date(),
    });

    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "user_invited",
      entityType: "admin_user",
      metaJson: JSON.stringify({
        email,
        invitePath: `/admin/signup?token=${token}`,
      }),
    });

    return redirect("/admin/users");
  }

  if (intent === "delete") {
    const id = Number(form.get("id"));
    await db
      .update(adminUsers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(adminUsers.id, id));
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "user_soft_delete",
      entityType: "admin_user",
      entityId: String(id),
    });
    return redirect("/admin/users");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function AdminUsers() {
  const { roles } = useLoaderData<typeof loader>();

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Invite teammates with role-based access. Invite links appear in the audit log.
      </p>
      <div className="admin-card">
        <div className="admin-card__title">Invite user</div>
        <Form method="post" className="admin-form" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "0.75rem", alignItems: "end" }}>
          <input type="hidden" name="intent" value="invite" />
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <label>
            Name
            <input type="text" name="name" />
          </label>
          <label>
            Role
            <select name="roleId" required>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="admin-btn admin-btn--primary" style={{ marginBottom: "0.85rem" }}>
            Invite
          </button>
        </Form>
      </div>
      <div className="admin-card">
        <DataTable
          table="adminUsers"
          statusFilter
          renderActions={(row) => (
            <Form
              method="post"
              onSubmit={async (e) => {
                e.preventDefault();
                const formEl = e.currentTarget;
                if (await confirmDelete(String(row.email ?? "user"))) {
                  formEl.submit();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={String(row.id)} />
              <button type="submit" className="admin-btn">
                Delete
              </button>
            </Form>
          )}
        />
      </div>
    </div>
  );
}
