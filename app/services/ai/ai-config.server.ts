import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings } from "../../db/schema";
import { isAiConfigured } from "./gemini-client.server";
import { getSetting } from "../admin/settings.server";

export type ShopAiConfig = {
  apiKey: string | null;
  tone: string;
  enabled: boolean;
  configured: boolean;
};

export async function getShopAiConfig(shopId: number): Promise<ShopAiConfig> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  const globalKey = await getSetting<string>("gemini_api_key", "");
  const apiKey = row?.geminiApiKey?.trim() || globalKey?.trim() || null;
  return {
    apiKey,
    tone: row?.aiTone ?? "concise",
    enabled: row?.aiEnabled ?? true,
    configured: await isAiConfigured(apiKey),
  };
}
