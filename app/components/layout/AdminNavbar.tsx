import { useLocation } from "@remix-run/react";

const TITLES: Record<string, { title: string; path: string }> = {
  "/admin": { title: "Dashboard", path: "Overview" },
  "/admin/installs": { title: "App installs", path: "Stores" },
  "/admin/users": { title: "Admin users", path: "Admin" },
  "/admin/roles": { title: "Roles & permissions", path: "Admin" },
  "/admin/audit-log": { title: "Audit log", path: "Admin" },
  "/admin/billing-plans": { title: "Billing & plans", path: "Billing" },
  "/admin/webhooks-health": { title: "Webhook health", path: "Ops" },
  "/admin/cron-jobs": { title: "Cron jobs", path: "Ops" },
  "/admin/support-tickets": { title: "Support tickets", path: "Support" },
  "/admin/settings": { title: "System settings", path: "Admin" },
  "/admin/ai": { title: "AI providers", path: "Admin" },
  "/admin/modules": { title: "App modules", path: "Admin" },
  "/admin/profile": { title: "My profile", path: "Admin" },
};

export function AdminNavbar() {
  const { pathname } = useLocation();
  const base = pathname.replace(/\/\d+$/, "");
  const meta = TITLES[base] || TITLES[pathname] || {
    title: "Admin",
    path: "CorePilot",
  };

  return (
    <div className="admin-navbar">
      <div className="admin-navbar__crumbs">
        <span className="admin-navbar__path">Admin / {meta.path}</span>
        <span className="admin-navbar__title">{meta.title}</span>
      </div>
    </div>
  );
}
