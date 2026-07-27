import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings, fixQueue, shops, cronRunLogs } from "../../db/schema";
import { getOrCreateSettings } from "./app-settings.server";
import { enqueueFix, markFixDone } from "./fix-queue.server";
import { runModuleFix } from "./module-fix.server";
import { runFullScan } from "../scanners/run-full-scan.server";
import { unauthenticated } from "../../shopify.server";

const BUSY = new Set(["queued", "running"]);
const STALE_MS = 15 * 60 * 1000;

export function isJobBusy(status?: string | null) {
  return BUSY.has(status || "");
}

export async function getShopJobState(shopId: number) {
  const settings = await getOrCreateSettings(shopId);
  return {
    status: settings.jobStatus || "idle",
    type: settings.jobType,
    message: settings.jobMessage,
    startedAt: settings.jobStartedAt,
    finishedAt: settings.jobFinishedAt,
    busy: isJobBusy(settings.jobStatus),
  };
}

async function setJob(
  shopId: number,
  patch: Partial<{
    jobStatus: string;
    jobType: string | null;
    jobMessage: string | null;
    jobStartedAt: Date | null;
    jobFinishedAt: Date | null;
  }>,
) {
  await getOrCreateSettings(shopId);
  await db
    .update(appSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appSettings.shopId, shopId));
}

/**
 * Queue a full scan. On Hobby Vercel cron is only daily, so we process
 * this shop immediately in the same request (still async from the UI).
 */
export async function enqueueShopScan(shopId: number) {
  const state = await getShopJobState(shopId);
  if (state.busy) {
    return { ok: false as const, error: `Job already ${state.status}: ${state.type}` };
  }
  await setJob(shopId, {
    jobStatus: "queued",
    jobType: "scan",
    jobMessage: "Scan starting…",
    jobStartedAt: new Date(),
    jobFinishedAt: null,
  });

  const result = await processOneShop(shopId, "scan");
  return {
    ok: true as const,
    processed: result.ok,
    message: result.message,
  };
}

/** Queue bulk fixes, then process this shop immediately. */
export async function enqueueShopFixes(
  shopId: number,
  module: string,
  issueIds: number[],
) {
  const state = await getShopJobState(shopId);
  if (state.busy && state.type === "scan") {
    return { ok: false as const, error: "Scan is running — wait until it finishes." };
  }

  const ids = [...new Set(issueIds)].slice(0, 50);
  for (const issueId of ids) {
    await enqueueFix({
      shopId,
      module,
      issueId,
      action: `queued:${module}`,
    });
  }

  if (!state.busy) {
    await setJob(shopId, {
      jobStatus: "queued",
      jobType: "fix",
      jobMessage: `Bulk fix: ${ids.length} item(s) starting…`,
      jobStartedAt: new Date(),
      jobFinishedAt: null,
    });
  } else {
    await setJob(shopId, {
      jobMessage: `Bulk fix: added ${ids.length} more item(s) to the queue.`,
    });
  }

  const result = await processOneShop(shopId, "fix");
  return { ok: true as const, queued: ids.length, processed: result.ok };
}

async function processOneShop(
  shopId: number,
  jobType: string | null | undefined,
  batch = 0,
): Promise<{ shopId: number; ok: boolean; message: string }> {
  const shop = await db.query.shops.findFirst({
    where: and(
      eq(shops.id, shopId),
      isNull(shops.deletedAt),
      isNull(shops.frozenAt),
    ),
  });
  if (!shop) {
    await setJob(shopId, {
      jobStatus: "failed",
      jobMessage: "Shop missing or frozen",
      jobFinishedAt: new Date(),
    });
    return { shopId, ok: false, message: "shop_missing" };
  }

  try {
    await setJob(shop.id, {
      jobStatus: "running",
      jobMessage: `Running ${jobType || "job"}…`,
    });

    const { admin } = await unauthenticated.admin(shop.shopDomain);

    if (jobType === "scan") {
      await runFullScan(shop.id, admin, { maxPages: 4 });
      await setJob(shop.id, {
        jobStatus: "completed",
        jobType: "scan",
        jobMessage: "Scan completed successfully.",
        jobFinishedAt: new Date(),
      });
      return { shopId: shop.id, ok: true, message: "scan_done" };
    }

    const pending = await db.query.fixQueue.findMany({
      where: and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "pending"),
        isNull(fixQueue.deletedAt),
      ),
      limit: 40,
    });

    let ok = 0;
    let fail = 0;
    for (const job of pending) {
      if (!job.issueId) {
        await markFixDone(job.id, "missing issueId");
        fail += 1;
        continue;
      }
      const result = await runModuleFix(
        admin,
        shop.id,
        job.module,
        job.issueId,
        { existingJobId: job.id },
      );
      if (result.ok) ok += 1;
      else fail += 1;
    }

    const stillPending = await db.query.fixQueue.findFirst({
      where: and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "pending"),
        isNull(fixQueue.deletedAt),
      ),
    });

    await setJob(shop.id, {
      jobStatus: stillPending ? "queued" : "completed",
      jobType: "fix",
      jobMessage: stillPending
        ? `Processed batch (${ok} ok / ${fail} failed). More pending.`
        : `Fixes completed (${ok} ok / ${fail} failed).`,
      jobFinishedAt: stillPending ? null : new Date(),
    });

    // Drain more batches in-request (Hobby cron is daily-only)
    if (stillPending && batch < 4) {
      return processOneShop(shopId, "fix", batch + 1);
    }

    return {
      shopId: shop.id,
      ok: fail === 0,
      message: `fix ok=${ok} fail=${fail}`,
    };
  } catch (error) {
    const { formatCaughtErrorAsync, shouldRethrowResponse } = await import(
      "../../lib/errors.server"
    );
    if (shouldRethrowResponse(error)) throw error;
    const msg = await formatCaughtErrorAsync(error);
    await setJob(shop.id, {
      jobStatus: "failed",
      jobMessage: msg.slice(0, 500),
      jobFinishedAt: new Date(),
    });
    return { shopId: shop.id, ok: false, message: msg };
  }
}

/**
 * Cron worker: processes queued jobs for many stores.
 * Status in cron_run_logs: ok | partial | failed
 */
export async function processQueuedShopJobs(limitShops = 25) {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const startedAt = new Date();

  await db
    .update(appSettings)
    .set({
      jobStatus: "queued",
      jobMessage: "Requeued after stale running state.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appSettings.jobStatus, "running"),
        or(
          lt(appSettings.jobStartedAt, staleBefore),
          isNull(appSettings.jobStartedAt),
        ),
      ),
    );

  const pendingRows = await db.query.fixQueue.findMany({
    where: and(eq(fixQueue.status, "pending"), isNull(fixQueue.deletedAt)),
    limit: 200,
  });
  for (const shopId of [...new Set(pendingRows.map((r) => r.shopId))]) {
    const state = await getShopJobState(shopId);
    if (!state.busy) {
      await setJob(shopId, {
        jobStatus: "queued",
        jobType: "fix",
        jobMessage: "Pending fixes detected — queued.",
        jobStartedAt: new Date(),
        jobFinishedAt: null,
      });
    }
  }

  const settingsRows = await db.query.appSettings.findMany({
    where: inArray(appSettings.jobStatus, ["queued", "running"]),
    limit: limitShops,
  });

  const results: { shopId: number; ok: boolean; message: string }[] = [];
  for (const settings of settingsRows) {
    results.push(await processOneShop(settings.shopId, settings.jobType));
  }

  const failed = results.filter((r) => !r.ok);
  const status =
    results.length === 0
      ? "ok"
      : failed.length === 0
        ? "ok"
        : failed.length === results.length
          ? "failed"
          : "partial";

  await db.insert(cronRunLogs).values({
    jobName: "process-jobs",
    startedAt,
    finishedAt: new Date(),
    status,
    shopsProcessed: results.length,
    errorMessage: failed.length
      ? failed
          .map((r) => `shop ${r.shopId}: ${r.message}`)
          .join("; ")
          .slice(0, 500)
      : null,
  });

  return results;
}

/** Reset a stuck shop job back to idle (admin). */
export async function resetShopJob(shopId: number) {
  await setJob(shopId, {
    jobStatus: "idle",
    jobType: null,
    jobMessage: "Reset by admin",
    jobFinishedAt: new Date(),
  });
}
