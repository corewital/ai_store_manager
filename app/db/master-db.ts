/**
 * Single live Turso database for production.
 * Never create or use branch/preview DBs on Vercel.
 */
export const MASTER_TURSO_DATABASE_URL =
  "libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io";

/** Vercel deploy or NODE_ENV=production — must use master DB only. */
export function isLiveRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

/** App runtime: live → always master; local → env or file DB. */
export function resolveDatabaseUrl(): string {
  if (isLiveRuntime()) {
    const env = (process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (env && env !== MASTER_TURSO_DATABASE_URL) {
      console.warn(
        `[db] Live runtime ignores TURSO_DATABASE_URL (${env.slice(0, 48)}…); using master corepilot-ai-db`,
      );
    }
    return MASTER_TURSO_DATABASE_URL;
  }

  const url = (process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (url) return url;
  return "file:./data/local.db";
}

/** Scripts that touch live DB — refuse any URL except master. */
export function requireMasterTursoUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed !== MASTER_TURSO_DATABASE_URL) {
    throw new Error(
      `Refuse: live ops must use master DB only:\n  ${MASTER_TURSO_DATABASE_URL}\nGot: ${trimmed || "(empty)"}`,
    );
  }
  return trimmed;
}
