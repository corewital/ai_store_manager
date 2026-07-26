/**
 * One-shot: copy rows from local MySQL (legacy) into Turso.
 * Requires MYSQL_* (or DB_HOST/DB_USER/…) still pointing at MySQL,
 * and TURSO_DATABASE_URL + TURSO_AUTH_TOKEN for the destination.
 *
 * Usage: npx tsx scripts/migrate-mysql-to-turso.ts
 */
import "dotenv/config";
import { createPool } from "mysql2/promise";
import { createClient } from "@libsql/client";

const TABLES = [
  "roles",
  "permissions",
  "role_permissions",
  "admin_users",
  "system_settings",
  "billing_plans",
  "plan_features",
  "shops",
  "sessions",
  "app_installs",
  "app_settings",
  "billing_subscriptions",
  "team_members",
  "product_issues",
  "seo_issues",
  "image_issues",
  "inventory_flags",
  "collection_issues",
  "navigation_issues",
  "theme_issues",
  "installed_apps_snapshot",
  "performance_snapshots",
  "assistant_conversations",
  "reports_sent",
  "fix_queue",
  "agency_accounts",
  "agency_stores",
  "webhook_logs",
  "activity_logs",
  "file_uploads",
  "api_call_logs",
  "support_tickets",
  "support_messages",
  "cron_run_logs",
  "health_scores",
  "ai_providers",
  "ai_api_keys",
];

const SKIP_IF_OVER = Number(process.env.MIGRATE_MAX_ROWS || 5000);

function toMs(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : t;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return v;
}

async function main() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (!tursoUrl || tursoUrl.startsWith("file:") || !tursoToken) {
    throw new Error("Set cloud TURSO_DATABASE_URL + TURSO_AUTH_TOKEN first");
  }

  const mysql = createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_USER || process.env.DB_USER || "root",
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || "corepilot_ai",
  });

  const turso = createClient({ url: tursoUrl, authToken: tursoToken });

  for (const table of TABLES) {
    try {
      const [countRows] = await mysql.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      const total = Number((countRows as { n: number }[])[0]?.n ?? 0);
      if (total === 0) {
        console.log(`${table}: 0 rows`);
        continue;
      }
      if (total > SKIP_IF_OVER) {
        console.log(`${table}: skip ${total} rows (> ${SKIP_IF_OVER})`);
        continue;
      }
      const [rows] = await mysql.query(`SELECT * FROM \`${table}\``);
      const list = rows as Record<string, unknown>[];
      let ok = 0;
      // Batch of 25 for Turso free tier rate limits
      for (let i = 0; i < list.length; i += 25) {
        const chunk = list.slice(i, i + 25);
        await Promise.all(
          chunk.map(async (row) => {
            const cols = Object.keys(row);
            const vals = cols.map((c) => toMs(row[c]));
            const placeholders = cols.map(() => "?").join(",");
            const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
            try {
              await turso.execute({ sql, args: vals as never[] });
              ok += 1;
            } catch (e) {
              console.warn(
                `  skip ${table} id=${String(row.id)}:`,
                e instanceof Error ? e.message.slice(0, 120) : e,
              );
            }
          }),
        );
      }
      console.log(`${table}: ${ok}/${list.length} copied`);
    } catch (e) {
      console.warn(
        `${table}: skipped (${e instanceof Error ? e.message.slice(0, 80) : e})`,
      );
    }
  }

  await mysql.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
