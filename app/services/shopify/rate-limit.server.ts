const buckets = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory rate limit (per instance). */
export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000,
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const row = buckets.get(key);
  if (!row || row.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (row.count >= limit) {
    return { ok: false, remaining: 0 };
  }
  row.count += 1;
  return { ok: true, remaining: limit - row.count };
}
