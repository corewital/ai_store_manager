import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  billingPlans,
  planFeatures,
  fixQueue,
  appSettings,
} from "../../db/schema";
import { PLAN_RANK, PLANS, type PlanSlug } from "../../config/plans";

export class PlanGateError extends Error {
  upgrade = true;
  constructor(message = "Plan upgrade required") {
    super(message);
    this.name = "PlanGateError";
  }
}

export function requirePlan(shop: { plan: string }, minPlan: string) {
  const current = PLAN_RANK[shop.plan as PlanSlug] ?? 0;
  const required = PLAN_RANK[minPlan as PlanSlug] ?? 0;
  if (current < required) {
    throw new PlanGateError(`Requires ${minPlan} plan or higher`);
  }
}

export function planRank(plan: string) {
  return PLAN_RANK[plan as PlanSlug] ?? 0;
}

type FeatureRow = {
  featureKey: string;
  limitValue: number | null;
  enabled: boolean;
};

async function loadPlanFeatures(planSlug: string): Promise<FeatureRow[]> {
  const plan = await db.query.billingPlans.findFirst({
    where: and(eq(billingPlans.slug, planSlug), isNull(billingPlans.deletedAt)),
  });
  if (!plan) {
    // Fallback to static PLANS defaults
    return staticFeatures(planSlug);
  }
  const rows = await db.query.planFeatures.findMany({
    where: eq(planFeatures.planId, plan.id),
  });
  if (rows.length === 0) return staticFeatures(planSlug);
  return rows.map((r) => ({
    featureKey: r.featureKey,
    limitValue: r.limitValue,
    enabled: r.enabled,
  }));
}

function staticFeatures(planSlug: string): FeatureRow[] {
  const p = PLANS[planSlug as PlanSlug] || PLANS.free;
  const cadence =
    p.scanCadence === "daily"
      ? 3
      : p.scanCadence === "weekly"
        ? 2
        : p.scanCadence === "monthly"
          ? 1
          : 0;
  return [
    { featureKey: "products_limit", limitValue: p.productLimit, enabled: true },
    {
      featureKey: "collections_limit",
      limitValue: p.collectionLimit,
      enabled: true,
    },
    { featureKey: "ai_fixes_limit", limitValue: p.aiFixLimit, enabled: true },
    {
      featureKey: "manual_scans_limit",
      limitValue: p.manualScanLimit,
      enabled: true,
    },
    { featureKey: "scan_cadence", limitValue: cadence, enabled: true },
    {
      featureKey: "module_assistant",
      limitValue: null,
      enabled: (p.modules as readonly string[]).includes("assistant") ||
        (p.modules as readonly string[]).includes("*"),
    },
    {
      featureKey: "module_inventory",
      limitValue: null,
      enabled: (p.modules as readonly string[]).includes("inventory") ||
        (p.modules as readonly string[]).includes("*"),
    },
    {
      featureKey: "module_performance",
      limitValue: null,
      enabled: (p.modules as readonly string[]).includes("performance") ||
        (p.modules as readonly string[]).includes("*"),
    },
    {
      featureKey: "email_reports",
      limitValue: null,
      enabled: false, // Coming later — hidden from merchants for now
    },
    {
      featureKey: "scheduled_reports",
      limitValue: null,
      enabled: false,
    },
  ];
}

export async function getPlanFeatureMap(planSlug: string) {
  const rows = await loadPlanFeatures(planSlug);
  const map = new Map<string, FeatureRow>();
  for (const r of rows) map.set(r.featureKey, r);
  return map;
}

export async function getPlanLimit(
  planSlug: string,
  key: string,
): Promise<number | null> {
  const map = await getPlanFeatureMap(planSlug);
  const row = map.get(key);
  const fallback = staticFeatures(planSlug).find((r) => r.featureKey === key);
  if (!row) {
    if (!fallback) return key.startsWith("module_") ? null : 0;
    return fallback.enabled ? fallback.limitValue : 0;
  }
  if (!row.enabled) return 0;
  // DB null → use static PLANS (so seed "unlimited" can pick up new paid scan caps)
  if (row.limitValue != null) return row.limitValue;
  return fallback?.limitValue ?? null;
}

export async function isPlanFeatureEnabled(
  planSlug: string,
  key: string,
): Promise<boolean> {
  const map = await getPlanFeatureMap(planSlug);
  const row = map.get(key);
  if (!row) {
    // Modules not listed → allow basic ones on all plans
    if (
      key.startsWith("module_") &&
      ["module_products", "module_seo", "module_images", "module_collections", "module_reports"].includes(
        key,
      )
    ) {
      return true;
    }
    return planRank(planSlug) >= 4; // enterprise
  }
  return row.enabled;
}

export async function getPlanUsage(shopId: number) {
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  const [{ aiUsed }] = await db
    .select({
      aiUsed: sql<number>`count(*)`,
    })
    .from(fixQueue)
    .where(
      and(
        eq(fixQueue.shopId, shopId),
        eq(fixQueue.status, "done"),
        isNull(fixQueue.deletedAt),
      ),
    );

  return {
    manualScansUsed: Number(settings?.manualScanCount ?? 0),
    aiFixesUsed: Number(aiUsed ?? 0),
  };
}

/** Assert shop can start a manual scan (lifetime counter; Free = total only). */
export async function assertCanScan(shopId: number, planSlug: string) {
  const limit = await getPlanLimit(planSlug, "manual_scans_limit");
  if (limit == null) return; // enterprise / unlimited
  const usage = await getPlanUsage(shopId);
  if (usage.manualScansUsed >= limit) {
    const name = PLANS[planSlug as PlanSlug]?.name ?? "Your";
    throw new PlanGateError(
      `${name} plan includes ${limit} manual scan${limit === 1 ? "" : "s"}. Upgrade to scan again.`,
    );
  }
}

export async function recordManualScan(shopId: number) {
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (!settings) return;
  await db
    .update(appSettings)
    .set({
      manualScanCount: Number(settings.manualScanCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.shopId, shopId));
}

export async function assertCanAiFix(shopId: number, planSlug: string) {
  const limit = await getPlanLimit(planSlug, "ai_fixes_limit");
  if (limit == null) return;
  const usage = await getPlanUsage(shopId);
  if (usage.aiFixesUsed >= limit) {
    throw new PlanGateError(
      `You've used all ${limit} fixes on your plan (AI and manual). Upgrade to continue.`,
    );
  }
}

export async function assertModuleAccess(planSlug: string, moduleKey: string) {
  const featureKey = `module_${moduleKey}`;
  const ok = await isPlanFeatureEnabled(planSlug, featureKey);
  if (!ok) {
    throw new PlanGateError(
      `${moduleKey} requires a higher plan. Upgrade to unlock.`,
    );
  }
}
