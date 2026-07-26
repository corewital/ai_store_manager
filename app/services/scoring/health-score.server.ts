import { and, count, eq, isNull } from "drizzle-orm";
import { db, insertReturningId } from "../../db/client";
import {
  collectionIssues,
  healthScores,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  themeIssues,
} from "../../db/schema";

/** Weights — move to systemSettings (Sec 28) later. */
export const HEALTH_WEIGHTS = {
  products: 0.18,
  seo: 0.16,
  images: 0.14,
  inventory: 0.12,
  collections: 0.1,
  navigation: 0.08,
  theme: 0.1,
  apps: 0.06,
  performance: 0.06,
} as const;

export type HealthCategory = keyof typeof HEALTH_WEIGHTS;

export type HealthBreakdown = Record<HealthCategory, number> & {
  overall: number;
};

function scoreFromOpenIssues(openCount: number, softCap = 20): number {
  const ratio = Math.min(openCount / softCap, 1);
  return Math.round((1 - ratio) * 1000) / 10;
}

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
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(
      and(
        eq(table.shopId, shopId),
        eq(table.status, "open"),
        isNull(table.deletedAt),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function computeHealthScore(
  shopId: number,
): Promise<HealthBreakdown> {
  const [
    productsOpen,
    seoOpen,
    imagesOpen,
    inventoryOpen,
    collectionsOpen,
    navigationOpen,
    themeOpen,
  ] = await Promise.all([
    openCount(productIssues, shopId),
    openCount(seoIssues, shopId),
    openCount(imageIssues, shopId),
    openCount(inventoryFlags, shopId),
    openCount(collectionIssues, shopId),
    openCount(navigationIssues, shopId),
    openCount(themeIssues, shopId),
  ]);

  const categories: Record<HealthCategory, number> = {
    products: scoreFromOpenIssues(productsOpen),
    seo: scoreFromOpenIssues(seoOpen),
    images: scoreFromOpenIssues(imagesOpen),
    inventory: scoreFromOpenIssues(inventoryOpen),
    collections: scoreFromOpenIssues(collectionsOpen),
    navigation: scoreFromOpenIssues(navigationOpen),
    theme: scoreFromOpenIssues(themeOpen),
    apps: 100,
    performance: 100,
  };

  let overall = 0;
  for (const key of Object.keys(HEALTH_WEIGHTS) as HealthCategory[]) {
    overall += categories[key] * HEALTH_WEIGHTS[key];
  }
  overall = Math.round(overall * 10) / 10;

  return { ...categories, overall };
}

export async function upsertTodayHealthScore(shopId: number) {
  const breakdown = await computeHealthScore(shopId);
  const date = new Date().toISOString().slice(0, 10);

  const existing = await db.query.healthScores.findFirst({
    where: and(eq(healthScores.shopId, shopId), eq(healthScores.date, date)),
  });

  const values = {
    overall: breakdown.overall,
    products: breakdown.products,
    seo: breakdown.seo,
    images: breakdown.images,
    inventory: breakdown.inventory,
    collections: breakdown.collections,
    navigation: breakdown.navigation,
    theme: breakdown.theme,
    apps: breakdown.apps,
    performance: breakdown.performance,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(healthScores)
      .set(values)
      .where(eq(healthScores.id, existing.id));
    return { ...breakdown, id: existing.id, date };
  }

  const id = await insertReturningId(healthScores, { shopId, date, ...values });

  return { ...breakdown, id, date };
}
