import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings, shops } from "../../db/schema";
import { scanProducts } from "./product-scanner.server";
import { scanSeo } from "./seo-scanner.server";
import { scanImages } from "./image-scanner.server";
import { scanInventory } from "./inventory-scanner.server";
import { scanCollections } from "./collection-scanner.server";
import { scanNavigation } from "./navigation-scanner.server";
import { scanTheme } from "./theme-scanner.server";
import { scanApps } from "./apps-scanner.server";
import { scanPerformance } from "./performance-scanner.server";
import { upsertTodayHealthScore } from "../scoring/health-score.server";
import { getEffectiveScanModules } from "../shopify/effective-modules.server";
import { getPlanLimit } from "../shopify/plan-gate.server";

const PAGE_SIZE = 25;

export async function runFullScan(
  shopId: number,
  admin: AdminApiContext,
  options?: {
    cursor?: string | null;
    maxPages?: number;
    onProgress?: (pct: number, message: string) => Promise<void> | void;
  },
) {
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  const plan = shop?.plan || "free";
  const [productCap, collectionCap] = await Promise.all([
    getPlanLimit(plan, "products_limit"),
    getPlanLimit(plan, "collections_limit"),
  ]);

  const maxProducts = productCap == null ? Number.POSITIVE_INFINITY : productCap;
  const maxPages =
    options?.maxPages ??
    (Number.isFinite(maxProducts)
      ? Math.max(1, Math.ceil(maxProducts / PAGE_SIZE))
      : 40);

  let cursor = options?.cursor ?? null;
  let scannedProducts = 0;
  const enabled = await getEffectiveScanModules(shopId);
  const report = options?.onProgress;

  await report?.(5, "Starting scan…");

  for (let page = 0; page < maxPages; page++) {
    if (scannedProducts >= maxProducts) break;

    let hasNext = false;
    let endCursor: string | null = null;
    const remaining = maxProducts - scannedProducts;
    const pagePct = 10 + Math.round(((page + 1) / maxPages) * 55);

    if (enabled.products) {
      await report?.(
        pagePct - 5,
        `Scanning products (${Math.min(scannedProducts + PAGE_SIZE, maxProducts === Number.POSITIVE_INFINITY ? scannedProducts + PAGE_SIZE : maxProducts)} cap)…`,
      );
      const products = await scanProducts(shopId, admin, cursor, remaining);
      scannedProducts += products.scanned;
      hasNext = products.hasNextPage && scannedProducts < maxProducts;
      endCursor = products.endCursor;
    }
    if (enabled.seo) {
      await report?.(pagePct, "Scanning SEO…");
      await scanSeo(shopId, admin, cursor);
    }
    if (enabled.images) {
      await report?.(pagePct + 2, "Scanning images…");
      await scanImages(shopId, admin, cursor);
    }
    if (enabled.inventory) {
      await report?.(pagePct + 4, "Scanning inventory…");
      await scanInventory(shopId, admin, cursor);
    }

    if (!enabled.products) break;
    if (!hasNext) {
      cursor = null;
      break;
    }
    cursor = endCursor;
  }

  await report?.(75, "Scanning collections & navigation…");
  if (enabled.collections) {
    await scanCollections(shopId, admin, collectionCap);
  }
  if (enabled.navigation) await scanNavigation(shopId, admin);
  await report?.(85, "Scanning theme, apps & performance…");
  if (enabled.theme) await scanTheme(shopId, admin);
  if (enabled.apps) await scanApps(shopId, admin);
  if (enabled.performance) await scanPerformance(shopId, admin);

  await report?.(92, "Updating health score…");
  const existingSettings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (existingSettings) {
    await db
      .update(appSettings)
      .set({
        lastScannedCursor: cursor,
        lastScannedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(appSettings.shopId, shopId));
  } else {
    await db.insert(appSettings).values({
      shopId,
      lastScannedCursor: cursor,
      lastScannedAt: new Date(),
    });
  }

  await report?.(98, "Finishing…");
  return upsertTodayHealthScore(shopId);
}
