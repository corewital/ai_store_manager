/**
 * One-shot: add refresh_token columns on LIVE Turso + clear stale offline sessions.
 * Usage: npx tsx scripts/migrate-expiring-tokens-live.ts
 */
import "dotenv/config";
import { createClient } from "@libsql/client";

const url =
  process.env.TURSO_CLOUD_URL ||
  process.env.TURSO_DATABASE_URL ||
  "libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io";

const token =
  process.env.TURSO_CLOUD_TOKEN ||
  process.env.TURSO_AUTH_TOKEN_CLOUD ||
  process.env.TURSO_AUTH_TOKEN ||
  "";

if (!url.includes("corepilot-ai-db") || !url.startsWith("libsql://")) {
  console.error("Refuse: not live corepilot-ai-db");
  process.exit(1);
}
if (!token) {
  console.error("Need TURSO_AUTH_TOKEN / TURSO_CLOUD_TOKEN");
  process.exit(1);
}

const c = createClient({ url, authToken: token });

async function ensureColumn(column: string, ddl: string) {
  const info = await c.execute(
    `SELECT name FROM pragma_table_info('sessions') WHERE name = '${column}'`,
  );
  if (info.rows.length > 0) {
    console.log("ok     sessions." + column);
    return;
  }
  await c.execute(ddl);
  console.log("added  sessions." + column);
}

async function main() {
  console.log("Live DB:", url);
  await ensureColumn("refresh_token", "ALTER TABLE sessions ADD COLUMN refresh_token text");
  await ensureColumn(
    "refresh_token_expires",
    "ALTER TABLE sessions ADD COLUMN refresh_token_expires integer",
  );

  const stale = await c.execute(
    `SELECT COUNT(*) AS n FROM sessions
     WHERE is_online = 0
       AND access_token IS NOT NULL
       AND (refresh_token IS NULL OR refresh_token = '')`,
  );
  console.log("stale offline sessions:", stale.rows[0]?.n ?? stale.rows[0]);

  await c.execute(
    `DELETE FROM sessions
     WHERE is_online = 0
       AND access_token IS NOT NULL
       AND (refresh_token IS NULL OR refresh_token = '')`,
  );
  console.log("cleared stale offline sessions (reopen app to get expiring tokens)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
