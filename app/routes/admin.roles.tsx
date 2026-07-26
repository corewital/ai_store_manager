import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { permissions, rolePermissions, roles } from "../db/schema";
import { requireAdmin } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      slug: roles.slug,
      description: roles.description,
      permCount: sql<number>`count(${rolePermissions.id})`.as("perm_count"),
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(isNull(roles.deletedAt))
    .groupBy(roles.id);

  const perms = await db.select().from(permissions);
  return { roles: rows, permissions: perms };
}

export default function AdminRoles() {
  const { roles, permissions } = useLoaderData<typeof loader>();

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Role matrix for Admin Core. Permission keys are seeded; edit via DB in
        dev.
      </p>
      <div className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Slug</th>
              <th>Description</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>
                  <code>{r.slug}</code>
                </td>
                <td>{r.description}</td>
                <td>
                  <span className="admin-badge">{r.permCount}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-page__lead" style={{ marginBottom: 0 }}>
        {permissions.length} permission keys seeded.
      </p>
    </div>
  );
}
