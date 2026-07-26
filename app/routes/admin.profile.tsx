import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { db } from "../db/client";
import { activityLogs, adminUsers } from "../db/schema";
import { requireAdmin } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roleSlug: user.roleSlug,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "profile");

  if (intent === "profile") {
    const name = String(form.get("name") || "").trim();
    if (!name) return { error: "Name is required" };
    await db
      .update(adminUsers)
      .set({ name, updatedAt: new Date() })
      .where(eq(adminUsers.id, user.id));
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "admin_profile_update",
      entityType: "admin_user",
      entityId: String(user.id),
    });
    return { ok: true, message: "Profile updated" };
  }

  if (intent === "password") {
    const password = String(form.get("password") || "");
    if (password.length < 8) {
      return { error: "Password must be at least 8 characters" };
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db
      .update(adminUsers)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(adminUsers.id, user.id));
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "admin_password_update",
      entityType: "admin_user",
      entityId: String(user.id),
    });
    return { ok: true, message: "Password updated" };
  }

  return { error: "Unknown action" };
}

export default function AdminProfile() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Your Admin Core profile. Super Admin can also manage{" "}
        <Link to="/admin/users">users</Link> and{" "}
        <Link to="/admin/roles">roles</Link>.
      </p>

      {actionData && "error" in actionData && actionData.error && (
        <div className="admin-card" style={{ borderColor: "#fca5a5" }}>
          {actionData.error}
        </div>
      )}
      {actionData && "ok" in actionData && actionData.ok && (
        <div className="admin-card" style={{ borderColor: "#86efac" }}>
          {actionData.message}
        </div>
      )}

      <div className="admin-grid-2">
        <div className="admin-card">
          <div className="admin-card__title">Profile</div>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="profile" />
            <label>
              Email
              <input value={user.email} readOnly />
            </label>
            <label>
              Role
              <input value={user.roleSlug} readOnly />
            </label>
            <label>
              Display name
              <input name="name" defaultValue={user.name} required />
            </label>
            <button type="submit" className="admin-btn admin-btn--primary">
              Save profile
            </button>
          </Form>
        </div>

        <div className="admin-card">
          <div className="admin-card__title">Change password</div>
          <Form method="post" className="admin-form">
            <input type="hidden" name="intent" value="password" />
            <label>
              New password
              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <button type="submit" className="admin-btn admin-btn--primary">
              Update password
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
