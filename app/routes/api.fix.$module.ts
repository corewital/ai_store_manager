import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { shops } from "../db/schema";
import {
  applyManualFix,
  runModuleFix,
} from "../services/shopify/module-fix.server";
import { rateLimit } from "../services/shopify/rate-limit.server";
import { logApiCall } from "../services/shopify/api-log.server";
import {
  enqueueShopFixes,
  getShopJobState,
} from "../services/shopify/shop-jobs.server";
import {
  formatCaughtErrorAsync,
  shouldRethrowResponse,
} from "../lib/errors.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  try {
    const { session, admin } = await authenticate.admin(request);
    const limited = rateLimit(`fix:${session.shop}`, 60, 60_000);
    if (!limited.ok) {
      return json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const shop = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, session.shop),
    });
    if (!shop) return json({ ok: false, error: "no_shop" }, { status: 404 });

    const module = params.module;
    if (!module) return json({ ok: false, error: "no_module" }, { status: 400 });

    const form = await request.formData();
    const manualValue = form.get("manualValue");
    const field = String(form.get("field") ?? "");

    const ids = String(form.get("issueIds") ?? form.get("issueId") ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v > 0);

    if (ids.length === 0) {
      return json({ ok: false, error: "no_issue_id" }, { status: 400 });
    }

    const started = Date.now();
    const job = await getShopJobState(shop.id);

    if (manualValue !== null && ids.length === 1) {
      if (job.busy && job.type === "scan") {
        return json({ ok: false, error: "scan_running" }, { status: 409 });
      }
      const result = await applyManualFix(
        admin,
        shop.id,
        module,
        ids[0],
        field,
        String(manualValue),
      );
      await logApiCall({
        shopDomain: session.shop,
        operation: `fix.${module}.manual`,
        status: result.ok ? "ok" : "error",
        durationMs: Date.now() - started,
        errorMessage: result.ok ? null : (result.error ?? "fix_failed"),
      });
      return json(result, { status: result.ok ? 200 : 422 });
    }

    // Single Fix = realtime; bulk (2+) = background cron
    if (ids.length === 1) {
      if (job.busy && job.type === "scan") {
        return json({ ok: false, error: "scan_running" }, { status: 409 });
      }
      const result = await runModuleFix(admin, shop.id, module, ids[0]);
      await logApiCall({
        shopDomain: session.shop,
        operation: `fix.${module}`,
        status: result.ok ? "ok" : "error",
        durationMs: Date.now() - started,
        errorMessage: result.ok ? null : (result.error ?? "fix_failed"),
      });
      return json(
        {
          ok: result.ok,
          succeeded: result.ok ? 1 : 0,
          failed: result.ok ? 0 : 1,
          error: result.error || result.skipMessage,
          skipMessage: result.skipMessage,
        },
        { status: result.ok ? 200 : 422 },
      );
    }

    const result = await enqueueShopFixes(shop.id, module, ids);
    await logApiCall({
      shopDomain: session.shop,
      operation: `fix.${module}.bulk_queued`,
      status: result.ok ? "ok" : "error",
      durationMs: Date.now() - started,
      errorMessage: result.ok ? null : result.error,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error }, { status: 409 });
    }

    return json({
      ok: true,
      queued: true,
      succeeded: result.queued,
      failed: 0,
    });
  } catch (error) {
    if (shouldRethrowResponse(error)) throw error;
    const msg = await formatCaughtErrorAsync(error);
    return json({ ok: false, error: msg }, { status: 422 });
  }
};
