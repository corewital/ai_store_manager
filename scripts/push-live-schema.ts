/**
 * Safe schema sync to LIVE Turso `corepilot-ai-db` only.
 * Uses ALTER / drizzle-kit push — never drops or recreates the database.
 *
 * Usage:
 *   set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to the cloud DB, then:
 *   npm run db:push-live
 *
 * Or pass inline (PowerShell):
 *   $env:TURSO_DATABASE_URL="libsql://corepilot-ai-db-….turso.io"
 *   $env:TURSO_AUTH_TOKEN="…"
 *   npm run db:push-live
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.TURSO_DATABASE_URL || "";
const token = process.env.TURSO_AUTH_TOKEN || "";

if (!url.startsWith("libsql://") || !url.includes("corepilot-ai-db")) {
  console.error(
    "Refuse: TURSO_DATABASE_URL must be the live corepilot-ai-db libsql:// URL.\n" +
      `Got: ${url || "(empty)"}\n` +
      "Do not point this at file:./data/local.db.",
  );
  process.exit(1);
}
if (!token) {
  console.error("Refuse: TURSO_AUTH_TOKEN is required for live push.");
  process.exit(1);
}

console.log("Pushing schema (ALTER only) →", url);
const result = spawnSync(
  "npx",
  ["drizzle-kit", "push", "--force"],
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      TURSO_DATABASE_URL: url,
      TURSO_AUTH_TOKEN: token,
    },
  },
);

process.exit(result.status ?? 1);
