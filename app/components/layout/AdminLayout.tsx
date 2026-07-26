import { Outlet } from "@remix-run/react";
import type { AdminUser } from "../../services/admin/auth.server";
import { AdminFooter } from "./AdminFooter";
import { AdminHeader } from "./AdminHeader";
import { AdminNavbar } from "./AdminNavbar";
import { AdminSidebar } from "./AdminSidebar";

type Props = { user: AdminUser };

export function AdminLayout({ user }: Props) {
  return (
    <div className="admin-shell" data-design-tier="standard">
      <AdminHeader user={user} />
      <div className="admin-body">
        <AdminSidebar user={user} />
        <div className="admin-main">
          <AdminNavbar />
          <div className="admin-content">
            <Outlet />
          </div>
          <AdminFooter />
        </div>
      </div>
    </div>
  );
}
