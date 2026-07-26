export const PLANS = {
  free: {
    name: "Free",
    priceCents: 0,
    productLimit: 100,
    features: [
      "100 products",
      "Manual scan",
      "Basic health dashboard",
    ],
  },
  starter: {
    name: "Starter",
    priceCents: 499,
    productLimit: 500,
    features: [
      "500 products",
      "Daily scan",
      "SEO audit",
      "Product audit",
    ],
  },
  professional: {
    name: "Professional",
    priceCents: 999,
    productLimit: null,
    features: [
      "Unlimited products",
      "AI fixes",
      "Email reports",
      "Performance audit",
      "Inventory monitor",
    ],
  },
  business: {
    name: "Business",
    priceCents: 1999,
    productLimit: null,
    features: [
      "Multi-store support",
      "Team members",
      "AI assistant",
      "Scheduled reports",
      "Priority processing",
    ],
  },
} as const;

export type PlanSlug = keyof typeof PLANS;

export const PLAN_RANK: Record<PlanSlug, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
};

export function formatPrice(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}/mo`;
}
