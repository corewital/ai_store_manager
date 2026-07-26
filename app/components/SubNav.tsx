import { Link, useLocation } from "@remix-run/react";
import { Box, InlineStack } from "@shopify/polaris";
import type { AppModuleVisibility } from "../services/admin/module-visibility";

export type SubNavItem = { label: string; to: string; moduleKey?: keyof AppModuleVisibility };

/** Horizontal submenu used by the grouped sections (Store Health, Settings, …). */
export function SubNav({ items }: { items: SubNavItem[] }) {
  const { pathname } = useLocation();

  return (
    <Box paddingBlockEnd="400">
      <InlineStack gap="100" wrap>
        {items.map((item) => {
          const active =
            pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                textDecoration: "none",
                padding: "0.35rem 0.75rem",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 600 : 450,
                color: active
                  ? "var(--p-color-text-emphasis)"
                  : "var(--p-color-text-secondary)",
                background: active
                  ? "var(--p-color-bg-surface-selected)"
                  : "transparent",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </InlineStack>
    </Box>
  );
}

const HEALTH_NAV_ALL: SubNavItem[] = [
  { label: "Overview", to: "/app/health", moduleKey: "overview" },
  { label: "Products", to: "/app/products", moduleKey: "products" },
  { label: "SEO", to: "/app/seo", moduleKey: "seo" },
  { label: "Images", to: "/app/images", moduleKey: "images" },
  { label: "Inventory", to: "/app/inventory", moduleKey: "inventory" },
  { label: "Collections", to: "/app/collections", moduleKey: "collections" },
  { label: "Navigation", to: "/app/navigation", moduleKey: "navigation" },
  { label: "Theme", to: "/app/theme", moduleKey: "theme" },
  { label: "Apps", to: "/app/apps", moduleKey: "apps" },
  { label: "Performance", to: "/app/performance", moduleKey: "performance" },
];

/** Filter health tabs from admin master visibility. */
export function healthNavFor(vis?: Partial<AppModuleVisibility> | null): SubNavItem[] {
  return HEALTH_NAV_ALL.filter((item) => {
    if (!item.moduleKey) return true;
    if (!vis) {
      // Safe defaults while loading: hide deferred modules
      return !["navigation", "theme", "apps"].includes(item.moduleKey);
    }
    return vis[item.moduleKey] !== false;
  });
}

/** @deprecated use healthNavFor(vis) */
export const HEALTH_NAV = healthNavFor(null);

export const REPORTS_NAV: SubNavItem[] = [
  { label: "Reports", to: "/app/reports" },
  { label: "One-Click Fix", to: "/app/fixes" },
];

export const SETTINGS_NAV: SubNavItem[] = [
  { label: "General", to: "/app/settings/general" },
  { label: "Modules", to: "/app/settings/modules" },
  { label: "Billing & Plans", to: "/app/settings/billing" },
  { label: "Support", to: "/app/support" },
];
