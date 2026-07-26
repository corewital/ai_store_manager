import { and, isNull, eq } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings, cronRunLogs, shops } from "../db/schema";
import { unauthenticated } from "../shopify.server";
import { runFullScan } from "../services/scanners/run-full-scan.server";
import { computeHealthScore } from "../services/scoring/health-score.server";
import { sendReportEmail } from "../services/email/resend.server";

function assertCronAuth(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

const PAID_PLANS = new Set(["starter", "professional", "business"]);

async function maybeSendDailyReport(shopId: number, shopDomain: string) {
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (!settings?.notifyEmail || settings.notifyFrequency === "off") return;

  const score = await computeHealthScore(shopId);
  const html = `<h2>Daily store report — ${shopDomain}</h2>
<p>Health score: <strong>${score.overall}</strong></p>
<ul>
<li>Products: ${score.products}</li>
<li>SEO: ${score.seo}</li>
<li>Images: ${score.images}</li>
<li>Inventory: ${score.inventory}</li>
</ul>`;

  await sendReportEmail({
    shopId,
    to: settings.notifyEmail,
    type: "daily",
    subject: `Daily report — ${shopDomain} (${score.overall}/100)`,
    html,
    summary: score,
  });
}

export const loader = async ({ request }: { request: Request }) => {
  assertCronAuth(request);

  const [{ id: runId }] = await db
    .insert(cronRunLogs)
    .values({
      jobName: "daily-scan",
      startedAt: new Date(),
      status: "running",
    })
    .$returningId();

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
      if (!PAID_PLANS.has(shop.plan)) {
        results.push({ shop: shop.shopDomain, ok: true, error: "skipped_free" });
        continue;
      }

      try {
        const { admin } = await unauthenticated.admin(shop.shopDomain);
        await runFullScan(shop.id, admin, { maxPages: 4 });
        try {
          await maybeSendDailyReport(shop.id, shop.shopDomain);
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
        status: "success",
        finishedAt: new Date(),
        shopsProcessed: processed,
        updatedAt: new Date(),
      })
      .where(eq(cronRunLogs.id, runId));

    return Response.json({ ok: true, results });
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
