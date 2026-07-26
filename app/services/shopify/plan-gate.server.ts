const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  business: 3,
};

export class PlanGateError extends Error {
  constructor(message = "Plan upgrade required") {
    super(message);
    this.name = "PlanGateError";
  }
}

export function requirePlan(shop: { plan: string }, minPlan: string) {
  const current = PLAN_RANK[shop.plan] ?? 0;
  const required = PLAN_RANK[minPlan] ?? 0;
  if (current < required) {
    throw new PlanGateError(`Requires ${minPlan} plan or higher`);
  }
}

/** Stub — real usage counters wired in Phase 10 billing. */
export async function getPlanUsage(_shopId: number) {
  return {
    dailyScans: 0,
    aiGenerations: 0,
    productsScanned: 0,
  };
}

export function planRank(plan: string) {
  return PLAN_RANK[plan] ?? 0;
}
