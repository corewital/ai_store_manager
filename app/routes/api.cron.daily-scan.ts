import { and, isNull, eq } from "drizzle-orm";
import { db, insertReturningId } from "../db/client";
import { appSettings, cronRunLogs, shops } from "../db/schema";
import { unauthenticated } from "../shopify.server";
import { runFullScan } from "../services/scanners/run-full-scan.server";
import { computeHealthScore } from "../services/scoring/health-score.server";
import { sendReportEmail } from "../services/email/resend.server";
import { getShopPlan } from "../services/shopify/billing.server";
import { getPlanLimit } from "../services/shopify/plan-gate.server";
import { type PlanSlug } from "../config/plans";

function assertCronAuth(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

/** scan_cadence: 0=manual 1=monthly 2=weekly 3=daily */
function dueForCadence(
  cadence: number | null,
  lastScannedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (cadence == null || cadence <= 0) return false; // manual only
  if (!lastScannedAt) return true;
  const ageMs = now.getTime() - new Date(lastScannedAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (cadence >= 3) return ageMs >= day * 0.9; // daily
  if (cadence === 2) return ageMs >= day * 6; // weekly
  if (cadence === 1) return ageMs >= day * 27; // monthly
  return false;
}

async function maybeSendReport(
  shopId: number,
  shopDomain: string,
  plan: PlanSlug,
) {
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (!settings?.notifyEmail) return;

  const { isPlanFeatureEnabled } = await import(
    "../services/shopify/plan-gate.server"
  );
  if (!(await isPlanFeatureEnabled(plan, "email_reports"))) return;

  const score = await computeHealthScore(shopId);
  const type = plan === "business" || plan === "enterprise" ? "daily" : "weekly";
  const html = `<h2>${type === "daily" ? "Daily" : "Weekly"} store report — ${shopDomain}</h2>
<p>Health score: <strong>${score.overall}</strong></p>
<ul>
<li>Products: ${score.products}</li>
<li>SEO: ${score.seo}</li>
<li>Images: ${score.images}</li>
<li>Inventory: ${score.inventory}</li>
<li>Collections: ${score.collections}</li>
</ul>`;

  await sendReportEmail({
    shopId,
    to: settings.notifyEmail,
    type,
    subject: `${type === "daily" ? "Daily" : "Weekly"} report — ${shopDomain} (${score.overall}/100)`,
    html,
    summary: score,
  });
}

export const loader = async ({ request }: { request: Request }) => {
  assertCronAuth(request);

  const runId = await insertReturningId(cronRunLogs, {
    jobName: "daily-scan",
    startedAt: new Date(),
    status: "running",
  });

  const activeShops = await db.query.shops.findMany({
    where: and(
      isNull(shops.uninstalledAt),
      isNull(shops.deletedAt),
      isNull(shops.frozenAt),
    ),
  });

  const results: { shop: string; ok: boolean; error?: string }[] = [];
  let processed = 0;

  try {
    for (const shop of activeShops) {
      try {
        const plan = await getShopPlan(shop.id);
        const cadence = await getPlanLimit(plan, "scan_cadence");
        const settings = await db.query.appSettings.findFirst({
          where: eq(appSettings.shopId, shop.id),
        });

        if (!dueForCadence(cadence, settings?.lastScannedAt)) {
          results.push({
            shop: shop.shopDomain,
            ok: true,
            error: `skipped_cadence_${cadence ?? 0}`,
          });
          continue;
        }

        // Align settings.scanFrequency label with plan
        const freqLabel =
          cadence != null && cadence >= 3
            ? "daily"
            : cadence === 2
              ? "weekly"
              : cadence === 1
                ? "monthly"
                : "manual";
        if (settings && settings.scanFrequency !== freqLabel) {
          await db
            .update(appSettings)
            .set({ scanFrequency: freqLabel, updatedAt: new Date() })
            .where(eq(appSettings.id, settings.id));
        }

        const { admin } = await unauthenticated.admin(shop.shopDomain);
        // Full catalog pass (products, SEO, images, collections, … per enabled modules)
        await runFullScan(shop.id, admin, { maxPages: 8 });
        try {
          await maybeSendReport(shop.id, shop.shopDomain, plan);
        } catch {
          /* email failure must not fail scan */
        }
        processed++;
        results.push({ shop: shop.shopDomain, ok: true });
      } catch (error) {
        results.push({
          shop: shop.shopDomain,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await db
      .update(cronRunLogs)
      .set({
        status: results.some((r) => !r.ok) ? "partial" : "ok",
        finishedAt: new Date(),
        shopsProcessed: processed,
        errorMessage: results
          .filter((r) => !r.ok)
          .map((r) => `${r.shop}: ${r.error}`)
          .join("; ")
          .slice(0, 500) || null,
        updatedAt: new Date(),
      })
      .where(eq(cronRunLogs.id, runId));

    return Response.json({ ok: true, processed, results });
  } catch (error) {
    await db
      .update(cronRunLogs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        shopsProcessed: processed,
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(cronRunLogs.id, runId));
    throw error;
  }
};
