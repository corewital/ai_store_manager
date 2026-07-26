import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import {
  collectionIssues,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  themeIssues,
} from "../../db/schema";
import { computeHealthScore } from "../scoring/health-score.server";
import { AI_NOT_CONFIGURED, generateText } from "./gemini-client.server";
import { getShopAiConfig } from "./ai-config.server";

async function openCount(
  table:
    | typeof productIssues
    | typeof seoIssues
    | typeof imageIssues
    | typeof inventoryFlags
    | typeof collectionIssues
    | typeof navigationIssues
    | typeof themeIssues,
  shopId: number,
) {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(
      and(eq(table.shopId, shopId), eq(table.status, "open"), isNull(table.deletedAt)),
    );
  return Number(row?.n ?? 0);
}

export type AssistantResult =
  | { ok: true; reply: string }
  | { ok: false; reason: string };

export async function askAssistant(
  shopId: number,
  message: string,
): Promise<AssistantResult> {
  const ai = await getShopAiConfig(shopId);
  if (!ai.enabled) return { ok: false, reason: "AI_DISABLED" };
  if (!ai.configured) return { ok: false, reason: AI_NOT_CONFIGURED };

  const [score, products, seo, images, inventory, collections, navigation, theme] =
    await Promise.all([
      computeHealthScore(shopId),
      openCount(productIssues, shopId),
      openCount(seoIssues, shopId),
      openCount(imageIssues, shopId),
      openCount(inventoryFlags, shopId),
      openCount(collectionIssues, shopId),
      openCount(navigationIssues, shopId),
      openCount(themeIssues, shopId),
    ]);

  const storeContext = {
    healthScore: score,
    openIssues: {
      products,
      seo,
      images,
      inventory,
      collections,
      navigation,
      theme,
    },
  };

  const system = [
    "You are the AI Store Assistant for ONE Shopify merchant.",
    "You may ONLY use the storeContext JSON provided below.",
    "Do not invent numbers, browse the web, or answer general knowledge questions.",
    "If the question cannot be answered from storeContext, reply exactly:",
    '"I can only answer using this store\'s health and issue data. Try asking about open issues, module scores, or what to fix next."',
    "Keep answers concise with bullet reasons tied to the numbers in storeContext.",
  ].join(" ");

  try {
    const reply = await generateText(
      `${system}\n\nstoreContext:\n${JSON.stringify(storeContext)}\n\nMerchant question: ${message}`,
      ai.apiKey,
    );
    return { ok: true, reply };
  } catch (error) {
    const reason =
      error instanceof Error && "reason" in error
        ? String((error as { reason: string }).reason)
        : "AI_ERROR";
    return { ok: false, reason };
  }
}
