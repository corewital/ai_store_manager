import "dotenv/config";
import { createClient } from "@libsql/client";

/** Verify/repair the LOCAL file DB columns that recent schema changes added. */
async function main() {
  const url = process.env.TURSO_DATABASE_URL || "file:./data/local.db";
  console.log("DB:", url);
  if (!url.startsWith("file:")) {
    console.error("Refusing to run: not a local file DB.");
    process.exit(1);
  }
  const c = createClient({ url });

  const needed: { table: string; column: string; ddl: string }[] = [
    {
      table: "shops",
      column: "plan_source",
      ddl: "ALTER TABLE shops ADD COLUMN plan_source text NOT NULL DEFAULT 'shopify'",
    },
    {
      table: "app_settings",
      column: "manual_scan_count",
      ddl: "ALTER TABLE app_settings ADD COLUMN manual_scan_count integer NOT NULL DEFAULT 0",
    },
    {
      table: "app_settings",
      column: "manual_scan_period_key",
      ddl: "ALTER TABLE app_settings ADD COLUMN manual_scan_period_key text",
    },
    {
      table: "sessions",
      column: "refresh_token",
      ddl: "ALTER TABLE sessions ADD COLUMN refresh_token text",
    },
    {
      table: "sessions",
      column: "refresh_token_expires",
      ddl: "ALTER TABLE sessions ADD COLUMN refresh_token_expires integer",
    },
  ];

  for (const n of needed) {
    const info = await c.execute(
      `SELECT name FROM pragma_table_info('${n.table}') WHERE name = '${n.column}'`,
    );
    if (info.rows.length > 0) {
      console.log(`ok      ${n.table}.${n.column}`);
      continue;
    }
    await c.execute(n.ddl);
    console.log(`added   ${n.table}.${n.column}`);
  }

  const shops = await c.execute(
    "SELECT id, shop_domain, plan, plan_source FROM shops LIMIT 5",
  );
  console.log("shops:", shops.rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
