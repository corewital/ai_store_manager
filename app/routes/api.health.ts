import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { pingDatabase } from "../db/client";
import { getDbConfigError } from "../db/turso-env";
import { MASTER_TURSO_DATABASE_URL } from "../db/master-db";

/** Public health check — no secrets returned. */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    // Allow unauthenticated minimal check; detailed only with cron secret
    const configError = getDbConfigError();
    if (configError) {
      return json({ ok: false, db: "misconfigured" }, { status: 503 });
    }
    const ping = await pingDatabase();
    return json({ ok: ping.ok, db: ping.ok ? "up" : "down" }, { status: ping.ok ? 200 : 503 });
  }

  const ping = await pingDatabase();
  return json({
    ok: ping.ok,
    db: ping.ok ? "up" : "down",
    error: ping.error,
    databaseUrl: MASTER_TURSO_DATABASE_URL,
    vercel: Boolean(process.env.VERCEL),
  }, { status: ping.ok ? 200 : 503 });
}
