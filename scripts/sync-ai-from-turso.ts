/**
 * Copy ai_providers + ai_api_keys from Turso cloud → local file DB.
 * Usage: npx tsx scripts/sync-ai-from-turso.ts
 */
import "dotenv/config";
import { createClient } from "@libsql/client";

const CLOUD_URL =
  process.env.TURSO_CLOUD_URL ||
  "libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io";
const CLOUD_TOKEN =
  process.env.TURSO_CLOUD_TOKEN ||
  process.env.TURSO_AUTH_TOKEN_CLOUD ||
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODUwNjA5OTMsImlkIjoiMDE5ZjlkZWQtMjcwMS03MGJhLTk1YjMtMzA1ODc0YmMyMzI5Iiwia2lkIjoiZXUtbWhnbHpBMkpwSmF1MUtESW9uZldmQ2puMEphaE1peWY4aXpBeW4zUSIsInJpZCI6IjRjZDMxNzI2LWU3MDctNDdmMC1iMjlhLWQ1NmFlZmJiZDVjYSJ9.c9zK2uFWMTv86KUPqORZtXAZGw1ECO1c8qpGDUV0bS-g9GNeL9xismpcrEEQ75dQ1abfh26mnDC7swOicm1hBA";

const LOCAL_URL = "file:./data/local.db";

async function main() {
  const cloud = createClient({ url: CLOUD_URL, authToken: CLOUD_TOKEN });
  const local = createClient({ url: LOCAL_URL });

  const providers = await cloud.execute(
    "SELECT id, slug, name, base_url, default_model, enabled, priority, created_at, updated_at, deleted_at FROM ai_providers",
  );
  const keys = await cloud.execute(
    "SELECT id, provider_id, label, api_key, status, cooldown_until, last_error, last_used_at, success_count, fail_count, created_at, updated_at, deleted_at FROM ai_api_keys",
  );

  console.log(
    `Cloud → ${providers.rows.length} providers, ${keys.rows.length} keys`,
  );

  await local.execute("DELETE FROM ai_api_keys");
  await local.execute("DELETE FROM ai_providers");

  for (const r of providers.rows) {
    await local.execute({
      sql: `INSERT INTO ai_providers (id, slug, name, base_url, default_model, enabled, priority, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.id as number,
        r.slug as string,
        r.name as string,
        (r.base_url as string) ?? null,
        r.default_model as string,
        r.enabled as number,
        r.priority as number,
        (r.created_at as number) ?? Date.now(),
        (r.updated_at as number) ?? Date.now(),
        (r.deleted_at as number) ?? null,
      ],
    });
  }

  for (const r of keys.rows) {
    await local.execute({
      sql: `INSERT INTO ai_api_keys (id, provider_id, label, api_key, status, cooldown_until, last_error, last_used_at, success_count, fail_count, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        r.id as number,
        r.provider_id as number,
        (r.label as string) ?? null,
        r.api_key as string,
        // Revive cooldowns locally so assistant works immediately
        r.status === "cooldown" ? "active" : (r.status as string),
        null,
        null,
        (r.last_used_at as number) ?? null,
        (r.success_count as number) ?? 0,
        (r.fail_count as number) ?? 0,
        (r.created_at as number) ?? Date.now(),
        (r.updated_at as number) ?? Date.now(),
        (r.deleted_at as number) ?? null,
      ],
    });
  }

  const check = await local.execute(
    "SELECT COUNT(*) AS n FROM ai_api_keys WHERE status = 'active' AND deleted_at IS NULL",
  );
  console.log("Local active keys:", check.rows[0]?.n);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
