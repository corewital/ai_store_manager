import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings } from "../../db/schema";
import { hasAnyAiKey } from "./ai-router.server";

export type ShopAiConfig = {
  /** @deprecated Prefer multi-provider pool via ai-router; kept for tone/enabled only */
  apiKey: string | null;
  tone: string;
  enabled: boolean;
  configured: boolean;
};

/**
 * Shop-level AI prefs + whether ANY admin AI provider key is ready.
 * Configured = Admin → AI (providers/keys), not System Settings Gemini.
 */
export async function getShopAiConfig(shopId: number): Promise<ShopAiConfig> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  return {
    apiKey: null,
    tone: row?.aiTone ?? "concise",
    enabled: row?.aiEnabled ?? true,
    configured: await hasAnyAiKey(),
  };
}
