import { isLiveRuntime } from "./master-db";

/** Resolve Turso auth token from common Vercel / local env names. */
export function resolveTursoAuthToken(): string | undefined {
  const candidates = [
    process.env.TURSO_AUTH_TOKEN,
    process.env.TURSO_AUTH_TOKEN_CLOUD,
    process.env.LIBSQL_AUTH_TOKEN,
    process.env.TURSO_TOKEN,
  ];
  for (const v of candidates) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

export function getDbConfigError(): string | null {
  if (!isLiveRuntime()) return null;
  if (!resolveTursoAuthToken()) {
    return (
      "TURSO_AUTH_TOKEN is missing on Vercel. " +
      "Set it for Production to the corepilot-ai-db token (Project Settings → Environment Variables)."
    );
  }
  return null;
}
