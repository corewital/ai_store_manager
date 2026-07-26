export const PLANS = {
  free: {
    name: "Free",
    priceCents: 0,
    productLimit: 50,
    collectionLimit: 10,
    aiFixLimit: 50,
    manualScanLimit: 3,
    scanCadence: "manual" as const,
    features: [
      "Up to 50 products",
      "Up to 10 collections",
      "50 AI fixes",
      "Manual scan (3 times)",
      "Basic health dashboard",
    ],
    modules: ["products", "seo", "images", "collections", "fixes", "reports"] as const,
  },
  starter: {
    name: "Starter",
    priceCents: 499,
    productLimit: 300,
    collectionLimit: 50,
    aiFixLimit: 200,
    manualScanLimit: null,
    scanCadence: "monthly" as const,
    features: [
      "Up to 300 products",
      "Up to 50 collections",
      "200 AI fixes",
      "Monthly scan",
      "SEO + product audit",
    ],
    modules: ["products", "seo", "images", "collections", "fixes", "reports"] as const,
  },
  professional: {
    name: "Professional",
    priceCents: 999,
    productLimit: 1000,
    collectionLimit: 500,
    aiFixLimit: 500,
    manualScanLimit: null,
    scanCadence: "weekly" as const,
    features: [
      "Up to 1,000 products",
      "Up to 500 collections",
      "500 AI fixes",
      "Weekly scan",
      "Email reports",
      "Performance + inventory",
    ],
    modules: [
      "products",
      "seo",
      "images",
      "collections",
      "inventory",
      "performance",
      "fixes",
      "reports",
    ] as const,
  },
  business: {
    name: "Business",
    priceCents: 1999,
    productLimit: 5000,
    collectionLimit: 1000,
    aiFixLimit: 5000,
    manualScanLimit: null,
    scanCadence: "daily" as const,
    features: [
      "Up to 5,000 products",
      "Up to 1,000 collections",
      "5,000 AI fixes",
      "Daily scan",
      "AI assistant",
      "Scheduled reports",
      "Priority processing",
    ],
    modules: [
      "products",
      "seo",
      "images",
      "collections",
      "inventory",
      "performance",
      "assistant",
      "fixes",
      "reports",
      "stores",
    ] as const,
  },
  enterprise: {
    name: "Enterprise",
    priceCents: -1,
    productLimit: null,
    collectionLimit: null,
    aiFixLimit: null,
    manualScanLimit: null,
    scanCadence: "daily" as const,
    features: [
      "Unlimited products & collections",
      "Unlimited AI fixes",
      "Priority support",
      "Custom limits — contact support",
    ],
    modules: ["*"] as const,
  },
} as const;

export type PlanSlug = keyof typeof PLANS;

export const PLAN_RANK: Record<PlanSlug, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
  enterprise: 4,
};

/** Feature keys stored in plan_features (admin-editable). */
export const PLAN_FEATURE_KEYS = [
  { key: "products_limit", label: "Product limit" },
  { key: "collections_limit", label: "Collection limit" },
  { key: "ai_fixes_limit", label: "AI fix limit" },
  { key: "manual_scans_limit", label: "Manual scan limit (Free)" },
  { key: "scan_cadence", label: "Scan cadence (0=manual 1=monthly 2=weekly 3=daily)" },
  { key: "module_seo", label: "SEO module" },
  { key: "module_products", label: "Products module" },
  { key: "module_images", label: "Images module" },
  { key: "module_collections", label: "Collections module" },
  { key: "module_inventory", label: "Inventory module" },
  { key: "module_performance", label: "Performance module" },
  { key: "module_assistant", label: "AI assistant" },
  { key: "module_reports", label: "Reports" },
  { key: "email_reports", label: "Email reports" },
  { key: "scheduled_reports", label: "Scheduled reports" },
] as const;

export function formatPrice(cents: number) {
  if (cents < 0) return "Contact us";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}/mo`;
}
