import bcrypt from "bcryptjs";
import { redirect } from "@remix-run/node";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import {
  activityLogs,
  adminUsers,
  permissions,
  rolePermissions,
  roles,
} from "../../db/schema";
import {
  commitAdminSession,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  getAdminUserId,
} from "./session.server";

export type AdminUser = {
  id: number;
  email: string;
  name: string;
  roleId: number;
  roleSlug: string;
  status: string;
};

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

async function logActivity(
  request: Request,
  action: string,
  actorAdminUserId: number | null,
  meta?: Record<string, unknown>,
) {
  await db.insert(activityLogs).values({
    actorAdminUserId,
    action,
    entityType: "admin_user",
    metaJson: meta ? JSON.stringify(meta) : null,
    ip: clientIp(request),
  });
}

async function loadAdminUser(id: number): Promise<AdminUser | null> {
  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      roleId: adminUsers.roleId,
      roleSlug: roles.slug,
      status: adminUsers.status,
    })
    .from(adminUsers)
    .innerJoin(roles, eq(adminUsers.roleId, roles.id))
    .where(and(eq(adminUsers.id, id), isNull(adminUsers.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") return null;
  return row;
}

export async function getAdminUser(request: Request): Promise<AdminUser | null> {
  const id = await getAdminUserId(request);
  if (!id) return null;
  return loadAdminUser(id);
}

export async function requireAdmin(request: Request): Promise<AdminUser> {
  const user = await getAdminUser(request);
  if (!user) throw redirect("/admin/login");
  return user;
}

export async function requireRole(
  request: Request,
  allowedSlugs: string[],
): Promise<AdminUser> {
  const user = await requireAdmin(request);
  if (!allowedSlugs.includes(user.roleSlug)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function can(request: Request, permissionKey: string): Promise<boolean> {
  const user = await getAdminUser(request);
  if (!user) return false;

  const rows = await db
    .select({ id: permissions.id })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        eq(rolePermissions.roleId, user.roleId),
        eq(permissions.key, permissionKey),
      ),
    )
    .limit(1);

  return Boolean(rows[0]);
}

export async function loginAdmin(
  request: Request,
  email: string,
  password: string,
): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const rows = await db
    .select()
    .from(adminUsers)
    .where(
      and(eq(adminUsers.email, email.toLowerCase()), isNull(adminUsers.deletedAt)),
    )
    .limit(1);
  const user = rows[0];

  if (!user?.passwordHash || user.status !== "active") {
    await logActivity(request, "login_failed", null, { email });
    return { ok: false, error: "Invalid email or password" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await logActivity(request, "login_failed", user.id, { email });
    return { ok: false, error: "Invalid email or password" };
  }

  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(adminUsers.id, user.id));

  await logActivity(request, "login_success", user.id, { email });

  const cookie = await createAdminSession(user.id);
  return { ok: true, cookie };
}

export async function logoutAdmin(request: Request) {
  const user = await getAdminUser(request);
  if (user) {
    await logActivity(request, "logout", user.id);
  }
  return destroyAdminSession(request);
}

export async function completeInviteSignup(
  request: Request,
  token: string,
  password: string,
  name?: string,
): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const rows = await db
    .select()
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.inviteToken, token),
        eq(adminUsers.status, "invited"),
        isNull(adminUsers.deletedAt),
      ),
    )
    .limit(1);
  const user = rows[0];

  if (!user) {
    return { ok: false, error: "Invalid or expired invite" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .update(adminUsers)
    .set({
      passwordHash,
      inviteToken: null,
      status: "active",
      name: name?.trim() || user.name,
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id));

  await logActivity(request, "signup_complete", user.id, { email: user.email });

  const cookie = await createAdminSession(user.id);
  return { ok: true, cookie };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export { getAdminSession, commitAdminSession };
