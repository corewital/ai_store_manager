/**
 * Patch live plan_features on master DB only.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { MASTER_TURSO_DATABASE_URL, requireMasterTursoUrl } from "../app/db/master-db";

const url = requireMasterTursoUrl(
  process.env.TURSO_DATABASE_URL || MASTER_TURSO_DATABASE_URL,
);
const token = process.env.TURSO_AUTH_TOKEN || "";

if (!token) {
  console.error("Refuse: TURSO_AUTH_TOKEN required");
  process.exit(1);
}

const c = createClient({ url, authToken: token });

const q = `
  SELECT pf.id, pf.plan_id, pf.feature_key, pf.limit_value, bp.slug, bp.name
  FROM plan_features pf
  JOIN billing_plans bp ON bp.id = pf.plan_id
  WHERE pf.feature_key = 'products_limit'
  ORDER BY pf.id
`;

async function main() {
  console.log("DB:", url);
  const before = await c.execute(q);
  console.log("before:", before.rows);

  const upd = await c.execute(
    `UPDATE plan_features
     SET limit_value = 51, updated_at = unixepoch() * 1000
     WHERE feature_key = 'products_limit' AND limit_value = 50`,
  );
  console.log("rows_changed:", upd.rowsAffected);

  const after = await c.execute(q);
  console.log("after:", after.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
