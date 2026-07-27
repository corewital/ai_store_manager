/**
 * Safe schema sync to LIVE master Turso `corepilot-ai-db` only (ALTER, no recreate).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { MASTER_TURSO_DATABASE_URL, requireMasterTursoUrl } from "../app/db/master-db";

const url = requireMasterTursoUrl(process.env.TURSO_DATABASE_URL || MASTER_TURSO_DATABASE_URL);
const token = process.env.TURSO_AUTH_TOKEN || "";

if (!token) {
  console.error("Refuse: TURSO_AUTH_TOKEN is required for live push.");
  process.exit(1);
}

console.log("Pushing schema (ALTER only) →", url);
const result = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    TURSO_DATABASE_URL: url,
    TURSO_AUTH_TOKEN: token,
  },
});

process.exit(result.status ?? 1);
