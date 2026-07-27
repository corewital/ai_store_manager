import { db } from "../../db/client";
import { apiCallLogs } from "../../db/schema";

export async function logApiCall(input: {
  shopDomain?: string | null;
  operation: string;
  status: string;
  durationMs?: number;
  errorMessage?: string | null;
}) {
  await db.insert(apiCallLogs).values({
    shopDomain: input.shopDomain ?? null,
    operation: input.operation,
    status: input.status,
    durationMs: input.durationMs ?? null,
    errorMessage: input.errorMessage ?? null,
  });
}

/** Wrap Admin GraphQL and write apiCallLogs. */
export async function loggedAdminGraphql(
  shopDomain: string,
  operation: string,
  run: () => Promise<Response>,
) {
  const started = Date.now();
  try {
    const res = await run();
    await logApiCall({
      shopDomain,
      operation,
      status: res.ok ? "ok" : "error",
      durationMs: Date.now() - started,
      errorMessage: res.ok ? null : `HTTP ${res.status}`,
    });
    return res;
  } catch (error) {
    await logApiCall({
      shopDomain,
      operation,
      status: "error",
      durationMs: Date.now() - started,
      errorMessage: (await import("../../lib/errors.server")).formatCaughtError(
        error,
      ),
    });
    throw error;
  }
}
