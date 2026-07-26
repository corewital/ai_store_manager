/** Shared (client + server) — no DB imports. */

export type AppModuleVisibility = {
  health: boolean;
  overview: boolean;
  products: boolean;
  seo: boolean;
  images: boolean;
  inventory: boolean;
  collections: boolean;
  navigation: boolean;
  theme: boolean;
  apps: boolean;
  performance: boolean;
  reports: boolean;
  fixes: boolean;
  assistant: boolean;
};

export const DEFAULT_MODULE_VISIBILITY: AppModuleVisibility = {
  health: true,
  overview: true,
  products: true,
  seo: true,
  images: true,
  inventory: true,
  collections: true,
  navigation: false,
  theme: false,
  apps: false,
  performance: true,
  reports: true,
  fixes: true,
  assistant: true,
};

export const MODULE_VISIBILITY_LABELS: Record<
  keyof AppModuleVisibility,
  string
> = {
  health: "Store Health (top nav)",
  overview: "Health → Overview",
  products: "Health → Products",
  seo: "Health → SEO",
  images: "Health → Images",
  inventory: "Health → Inventory",
  collections: "Health → Collections",
  navigation: "Health → Navigation (hidden until ready)",
  theme: "Health → Theme (hidden until ready)",
  apps: "Health → Apps (hidden until ready)",
  performance: "Health → Performance",
  reports: "Reports",
  fixes: "One-Click Fix",
  assistant: "AI Assistant",
};
