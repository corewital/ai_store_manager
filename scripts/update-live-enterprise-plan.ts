/**
 * One-shot: align live enterprise plan with App Store self-serve pricing.
 * Run: npx tsx scripts/update-live-enterprise-plan.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || url.startsWith("file:")) {
  console.error("Set live TURSO_DATABASE_URL + TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url, authToken });

async function main() {
  await db.execute({
    sql: `UPDATE billing_plans
      SET name = ?, price_cents = ?, trial_days = ?, shopify_plan_handle = ?, updated_at = datetime('now')
      WHERE slug = ?`,
    args: ["Enterprise", 9999, 0, "enterprise", "enterprise"],
  });

  const plan = await db.execute({
    sql: `SELECT id FROM billing_plans WHERE slug = ? LIMIT 1`,
    args: ["enterprise"],
  });
  const planId = plan.rows[0]?.id as number | undefined;
  if (!planId) {
    console.error("enterprise plan row missing — run seed first");
    process.exit(1);
  }

  const features: [string, number | null][] = [
    ["products_limit", null],
    ["collections_limit", null],
    ["ai_fixes_limit", 10000],
    ["manual_scans_limit", 5],
    ["scan_cadence", 3],
    ["module_assistant", null],
  ];

  for (const [key, limit] of features) {
    const existing = await db.execute({
      sql: `SELECT id FROM plan_features WHERE plan_id = ? AND feature_key = ? LIMIT 1`,
      args: [planId, key],
    });
    if (existing.rows[0]?.id) {
      await db.execute({
        sql: `UPDATE plan_features SET limit_value = ?, enabled = 1, updated_at = datetime('now') WHERE id = ?`,
        args: [limit, existing.rows[0].id as number],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO plan_features (plan_id, feature_key, limit_value, enabled) VALUES (?, ?, ?, 1)`,
        args: [planId, key, limit],
      });
    }
  }

  // Ensure assistant module enabled for enterprise
  await db.execute({
    sql: `UPDATE plan_features SET enabled = 1, updated_at = datetime('now')
      WHERE plan_id = ? AND feature_key = 'module_assistant'`,
    args: [planId],
  });

  console.log("Enterprise plan updated: $99.99, unlimited products/collections, 10000 AI fixes, 5 manual scans/day");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
