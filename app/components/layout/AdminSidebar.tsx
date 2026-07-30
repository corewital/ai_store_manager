import { Link, useLocation } from "@remix-run/react";
import { useEffect, useState } from "react";
import type { AdminUser } from "../../services/admin/auth.server";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  roles?: string[];
  children?: NavItem[];
};
type NavGroup = {
  title: string;
  icon: string;
  items: NavItem[];
  roles?: string[];
};

const GROUPS: NavGroup[] = [
  {
    title: "Overview",
    icon: "▦",
    items: [{ to: "/admin", label: "Dashboard", end: true }],
  },
  {
    title: "Stores",
    icon: "▣",
    items: [
      {
        to: "/admin/installs",
        label: "Installs & tokens",
        children: [
          { to: "/admin/installs?status=active", label: "Active stores" },
          { to: "/admin/installs?status=uninstalled", label: "Uninstalled" },
          { to: "/admin/installs?frozen=1", label: "Frozen" },
        ],
      },
    ],
  },
  {
    title: "Billing",
    icon: "◈",
    items: [{ to: "/admin/billing-plans", label: "Plans" }],
  },
  {
    title: "Operations",
    icon: "⚙",
    items: [
      {
        to: "/admin/cron-jobs",
        label: "Cron jobs",
        children: [
          { to: "/admin/cron-jobs?view=runs", label: "Run history" },
          { to: "/admin/cron-jobs?view=stores", label: "Store jobs" },
        ],
      },
      { to: "/admin/webhooks-health", label: "Webhooks" },
    ],
  },
  {
    title: "Support",
    icon: "✉",
    items: [
      {
        to: "/admin/support-tickets",
        label: "Tickets",
        children: [
          { to: "/admin/support-tickets?status=open", label: "Open" },
          { to: "/admin/support-tickets?status=pending", label: "Pending" },
          { to: "/admin/support-tickets?status=closed", label: "Closed" },
        ],
      },
    ],
  },
  {
    title: "Admin account",
    icon: "👤",
    roles: ["super_admin", "admin"],
    items: [
      { to: "/admin/profile", label: "My profile" },
      {
        to: "/admin/users",
        label: "Admin users",
        roles: ["super_admin", "admin"],
      },
      { to: "/admin/roles", label: "Roles", roles: ["super_admin"] },
      { to: "/admin/audit-log", label: "Audit log" },
      {
        to: "/admin/modules",
        label: "App modules",
        roles: ["super_admin"],
      },
      {
        to: "/admin/ai",
        label: "AI providers",
        roles: ["super_admin"],
      },
      {
        to: "/admin/settings",
        label: "System settings",
        roles: ["super_admin"],
      },
    ],
  },
];

const STORAGE_KEY = "admin-sidebar-open";

function pathOf(to: string) {
  return to.split("?")[0];
}

function isActive(pathname: string, item: NavItem) {
  const base = pathOf(item.to);
  return item.end ? pathname === base : pathname.startsWith(base);
}

function readStored(): Record<string, boolean> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
  } catch {
    return null;
  }
}

type Props = { user?: AdminUser | null };

export function AdminSidebar({ user }: Props) {
  const { pathname } = useLocation();
  const role = user?.roleSlug ?? "";
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpen(readStored() ?? {});
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
    } catch {
      /* storage disabled */
    }
  }, [open, hydrated]);

  function toggle(key: string, fallback: boolean) {
    setOpen((s) => ({ ...s, [key]: !(s[key] ?? fallback) }));
  }

  function setAll(value: boolean) {
    const next: Record<string, boolean> = {};
    for (const group of GROUPS) {
      next[group.title] = value;
      for (const item of group.items) {
        if (item.children?.length) next[`item:${item.to}`] = value;
      }
    }
    setOpen(next);
  }

  const visibleGroups = GROUPS.filter((g) => !g.roles || g.roles.includes(role));

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar__brand">
        <img
          src="/images/Sidebar_Icon_Only.png"
          alt=""
          className="admin-sidebar__brand-icon"
        />
      </div>
      <div className="admin-sidebar__tools">
        <button type="button" onClick={() => setAll(true)}>
          Expand all
        </button>
        <button type="button" onClick={() => setAll(false)}>
          Collapse all
        </button>
      </div>
      <nav>
        {visibleGroups.map((group) => {
          const items = group.items.filter(
            (item) => !item.roles || item.roles.includes(role),
          );
          if (items.length === 0) return null;
          const groupActive = items.some((i) => isActive(pathname, i));
          const groupOpen = open[group.title] ?? groupActive;

          return (
            <div key={group.title} className="admin-sidebar__group">
              <button
                type="button"
                className={
                  groupActive
                    ? "admin-sidebar__group-btn is-active"
                    : "admin-sidebar__group-btn"
                }
                aria-expanded={groupOpen}
                onClick={() => toggle(group.title, groupActive)}
              >
                <span className="admin-sidebar__icon">{group.icon}</span>
                <span>{group.title}</span>
                <span className="admin-sidebar__chev">
                  {groupOpen ? "▾" : "▸"}
                </span>
              </button>

              {groupOpen &&
                items.map((item) => {
                  const active = isActive(pathname, item);
                  const kids = (item.children ?? []).filter(
                    (c) => !c.roles || c.roles.includes(role),
                  );
                  const subKey = `item:${item.to}`;
                  const subOpen = open[subKey] ?? active;

                  return (
                    <div key={item.to} className="admin-sidebar__item">
                      <div className="admin-sidebar__row">
                        <Link to={item.to} className={active ? "active" : undefined}>
                          {item.label}
                        </Link>
                        {kids.length > 0 && (
                          <button
                            type="button"
                            className="admin-sidebar__sub-toggle"
                            aria-label={`Toggle ${item.label} submenu`}
                            aria-expanded={subOpen}
                            onClick={() => toggle(subKey, active)}
                          >
                            {subOpen ? "▾" : "▸"}
                          </button>
                        )}
                      </div>
                      {kids.length > 0 && subOpen && (
                        <div className="admin-sidebar__sub">
                          {kids.map((child) => (
                            <Link key={child.to} to={child.to}>
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
