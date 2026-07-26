import { and, isNull, eq } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings, shops } from "../db/schema";
import { generateText } from "../services/ai/gemini-client.server";
import { sendReportEmail } from "../services/email/resend.server";
import { computeHealthScore } from "../services/scoring/health-score.server";

const PAID_PLANS = new Set(["starter", "professional", "business"]);

export const loader = async ({ request }: { request: Request }) => {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const activeShops = await db.query.shops.findMany({
    where: and(
      isNull(shops.uninstalledAt),
      isNull(shops.deletedAt),
      isNull(shops.frozenAt),
    ),
  });

  const results: { shop: string; ok: boolean; error?: string }[] = [];

  for (const shop of activeShops) {
    if (!PAID_PLANS.has(shop.plan)) {
      results.push({ shop: shop.shopDomain, ok: true, error: "skipped_free" });
      continue;
    }

    try {
      const settings = await db.query.appSettings.findFirst({
        where: eq(appSettings.shopId, shop.id),
      });
      if (!settings?.notifyEmail || settings.notifyFrequency === "off") {
        results.push({ shop: shop.shopDomain, ok: true, error: "skipped_no_email" });
        continue;
      }

      const score = await computeHealthScore(shop.id);
      const bullets = await generateText(
        `Write 3-5 short bullet points (plain text, one per line starting with "- ") summarizing store health for a merchant. Score ${score.overall}/100. Categories: products ${score.products}, seo ${score.seo}, images ${score.images}.`,
      );

      const html = `<h2>Weekly store report — ${shop.shopDomain}</h2>
<p>Health score: <strong>${score.overall}</strong></p>
<pre>${bullets}</pre>`;

      await sendReportEmail({
        shopId: shop.id,
        to: settings.notifyEmail,
        type: "weekly",
        subject: `Weekly report — ${shop.shopDomain}`,
        html,
        summary: { score, bullets },
      });
      results.push({ shop: shop.shopDomain, ok: true });
    } catch (error) {
      results.push({
        shop: shop.shopDomain,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Response.json({ ok: true, results });
};
