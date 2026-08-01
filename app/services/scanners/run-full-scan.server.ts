import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  appSettings,
  imageIssues,
  inventoryFlags,
  productIssues,
  seoIssues,
  shops,
} from "../../db/schema";
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

/** Close open issues outside the plan product window (listings stay within limit). */
async function pruneOutOfCapProductIssues(
  shopId: number,
  allowedProductIds: string[],
) {
  if (allowedProductIds.length === 0) return;

  const allowed = new Set(allowedProductIds);

  await db
    .update(productIssues)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(productIssues.shopId, shopId),
        eq(productIssues.status, "open"),
        isNull(productIssues.deletedAt),
        notInArray(productIssues.resourceId, allowedProductIds),
      ),
    );

  await db
    .update(seoIssues)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(seoIssues.shopId, shopId),
        eq(seoIssues.status, "open"),
        isNull(seoIssues.deletedAt),
        notInArray(seoIssues.resourceId, allowedProductIds),
      ),
    );

  // Images / inventory store product id in detailsJson
  const openImages = await db.query.imageIssues.findMany({
    where: and(
      eq(imageIssues.shopId, shopId),
      eq(imageIssues.status, "open"),
      isNull(imageIssues.deletedAt),
    ),
    columns: { id: true, detailsJson: true },
  });
  for (const row of openImages) {
    let productId = "";
    try {
      productId = String(JSON.parse(row.detailsJson || "{}")?.productId || "");
    } catch {
      productId = "";
    }
    if (productId && !allowed.has(productId)) {
      await db
        .update(imageIssues)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(imageIssues.id, row.id));
    }
  }

  const openInv = await db.query.inventoryFlags.findMany({
    where: and(
      eq(inventoryFlags.shopId, shopId),
      eq(inventoryFlags.status, "open"),
      isNull(inventoryFlags.deletedAt),
    ),
    columns: { id: true, detailsJson: true },
  });
  for (const row of openInv) {
    let productId = "";
    try {
      productId = String(JSON.parse(row.detailsJson || "{}")?.productId || "");
    } catch {
      productId = "";
    }
    if (productId && !allowed.has(productId)) {
      await db
        .update(inventoryFlags)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inventoryFlags.id, row.id));
    }
  }
}

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

  // Hard plan cap — manual + auto both stop here (no overscan)
  const maxProducts =
    productCap == null || productCap <= 0
      ? Number.POSITIVE_INFINITY
      : productCap;
  const planPages = Number.isFinite(maxProducts)
    ? Math.max(1, Math.ceil(Number(maxProducts) / PAGE_SIZE))
    : Math.max(1, options?.maxPages ?? 40);
  // Never exceed plan pages (ignore higher cron maxPages)
  const maxPages = planPages;

  let cursor = options?.cursor ?? null;
  let scannedProducts = 0;
  const scannedProductIds: string[] = [];
  const enabled = await getEffectiveScanModules(shopId);
  const report = options?.onProgress;
  const needProductPass =
    enabled.products || enabled.seo || enabled.images || enabled.inventory;

  await report?.(
    5,
    Number.isFinite(maxProducts)
      ? `Starting scan (plan cap ${maxProducts} products)…`
      : "Starting scan…",
  );

  if (needProductPass) {
    for (let page = 0; page < maxPages; page++) {
      if (scannedProducts >= maxProducts) break;

      const remaining = Number.isFinite(maxProducts)
        ? Math.max(0, Number(maxProducts) - scannedProducts)
        : PAGE_SIZE;
      if (remaining <= 0) break;

      const pagePct = 10 + Math.round(((page + 1) / maxPages) * 55);
      let hasNext = false;
      let endCursor: string | null = null;
      let pageIds: string[] = [];

      if (enabled.products) {
        await report?.(
          pagePct - 5,
          `Scanning products ${scannedProducts + 1}–${Math.min(scannedProducts + remaining, Number(maxProducts))}…`,
        );
        const products = await scanProducts(shopId, admin, cursor, remaining);
        scannedProducts += products.scanned;
        pageIds = products.productIds;
        hasNext = products.hasNextPage && scannedProducts < maxProducts;
        endCursor = products.endCursor;
      }

      if (enabled.seo) {
        await report?.(pagePct, "Scanning SEO…");
        const seo = await scanSeo(shopId, admin, cursor, remaining);
        if (!enabled.products) {
          scannedProducts += seo.scanned;
          pageIds = seo.productIds;
          hasNext = seo.hasNextPage && scannedProducts < maxProducts;
          endCursor = seo.endCursor;
        }
      }

      if (enabled.images) {
        await report?.(pagePct + 2, "Scanning images…");
        const images = await scanImages(shopId, admin, cursor, remaining);
        if (!enabled.products && !enabled.seo) {
          scannedProducts += images.scanned;
          pageIds = images.productIds;
          hasNext = images.hasNextPage && scannedProducts < maxProducts;
          endCursor = images.endCursor;
        }
      }

      if (enabled.inventory) {
        await report?.(pagePct + 4, "Scanning inventory…");
        const inv = await scanInventory(shopId, admin, cursor, remaining);
        if (!enabled.products && !enabled.seo && !enabled.images) {
          scannedProducts += inv.scanned;
          pageIds = inv.productIds;
          hasNext = inv.hasNextPage && scannedProducts < maxProducts;
          endCursor = inv.endCursor;
        }
      }

      for (const id of pageIds) {
        if (!scannedProductIds.includes(id)) scannedProductIds.push(id);
      }

      if (!hasNext) {
        cursor = null;
        break;
      }
      cursor = endCursor;
    }

    await report?.(70, "Applying plan product limit to issue lists…");
    if (Number.isFinite(maxProducts) && scannedProductIds.length > 0) {
      await pruneOutOfCapProductIssues(shopId, scannedProductIds);
    }
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

  await report?.(
    98,
    Number.isFinite(maxProducts)
      ? `Finishing… scanned ${Math.min(scannedProducts, Number(maxProducts))}/${maxProducts} products`
      : "Finishing…",
  );
  return upsertTodayHealthScore(shopId);
}
