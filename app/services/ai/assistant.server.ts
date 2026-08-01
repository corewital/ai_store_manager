import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import {
  collectionIssues,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  themeIssues,
  appSettings,
  shops,
} from "../../db/schema";
import { computeHealthScore } from "../scoring/health-score.server";
import { AI_NOT_CONFIGURED, generateText } from "./gemini-client.server";
import { getShopAiConfig } from "./ai-config.server";
import { getShopPlan } from "../shopify/billing.server";
import { getScanCaps } from "../shopify/plan-gate.server";
import { PLANS } from "../../config/plans";
import { plainTextFromHtml } from "../../lib/html-text";

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

async function sampleOpenIssues(
  table:
    | typeof productIssues
    | typeof seoIssues
    | typeof imageIssues
    | typeof inventoryFlags
    | typeof collectionIssues,
  shopId: number,
  limit = 5,
) {
  const rows = await db
    .select({
      title: table.title,
      issueCode: table.issueCode,
      resourceId: table.resourceId,
    })
    .from(table)
    .where(
      and(eq(table.shopId, shopId), eq(table.status, "open"), isNull(table.deletedAt)),
    )
    .orderBy(desc(table.id))
    .limit(limit);
  return rows.map((r) => ({
    title: r.title,
    code: r.issueCode,
    resourceId: r.resourceId,
  }));
}

type ProductSnap = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  price: string | null;
  currency: string | null;
  hasImage: boolean;
  descriptionChars: number;
  sku: string | null;
  onlineStoreUrl: string | null;
};

async function fetchLiveStoreData(admin: AdminApiContext) {
  try {
    const res = await admin.graphql(
      `#graphql
      query AssistantStoreSnapshot {
        shop {
          name
          description
          currencyCode
          primaryDomain { url host }
          plan { displayName }
        }
        productsCount { count }
        collectionsCount { count }
        bestSellers: products(first: 10, sortKey: BEST_SELLING) {
          nodes {
            id title handle status totalInventory onlineStoreUrl
            descriptionHtml
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            variants(first: 3) { nodes { sku price } }
          }
        }
        recentProducts: products(first: 8, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id title handle status totalInventory
            descriptionHtml
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            variants(first: 1) { nodes { sku } }
          }
        }
        collections(first: 10, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id title handle
            descriptionHtml
            image { url }
            productsCount { count }
            seo { title description }
          }
        }
      }`,
    );
    const json = (await res.json()) as {
      errors?: { message?: string }[];
      data?: Record<string, unknown> & {
        shop?: {
          name?: string;
          description?: string;
          currencyCode?: string;
          primaryDomain?: { url?: string; host?: string };
          plan?: { displayName?: string };
        };
        productsCount?: { count?: number };
        collectionsCount?: { count?: number };
        bestSellers?: { nodes?: unknown[] };
        recentProducts?: { nodes?: unknown[] };
        collections?: { nodes?: unknown[] };
      };
    };
    if (json.errors?.length) {
      console.warn("[assistant] store snapshot errors:", json.errors);
    }
    const data = json.data ?? {};

    const mapProduct = (p: {
      id: string;
      title: string;
      handle?: string;
      status?: string;
      totalInventory?: number | null;
      onlineStoreUrl?: string | null;
      descriptionHtml?: string | null;
      featuredImage?: { url?: string | null } | null;
      priceRangeV2?: {
        minVariantPrice?: { amount?: string; currencyCode?: string } | null;
      } | null;
      variants?: { nodes?: { sku?: string | null; price?: string }[] };
    }): ProductSnap => {
      const variants = p.variants?.nodes ?? [];
      const sku = variants.map((v) => v.sku).find((s) => s?.trim()) || null;
      return {
        id: p.id,
        title: p.title,
        handle: p.handle || "",
        status: p.status || "UNKNOWN",
        totalInventory:
          typeof p.totalInventory === "number" ? p.totalInventory : null,
        price: p.priceRangeV2?.minVariantPrice?.amount ?? null,
        currency: p.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
        hasImage: Boolean(p.featuredImage?.url),
        descriptionChars: plainTextFromHtml(p.descriptionHtml).length,
        sku,
        onlineStoreUrl: p.onlineStoreUrl ?? null,
      };
    };

    const collections = (
      (data.collections?.nodes ?? []) as {
        id: string;
        title: string;
        handle?: string;
        descriptionHtml?: string | null;
        image?: { url?: string | null } | null;
        productsCount?: { count?: number } | null;
        seo?: { title?: string | null; description?: string | null } | null;
      }[]
    ).map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle || "",
        productCount: c.productsCount?.count ?? 0,
        hasImage: Boolean(c.image?.url?.trim()),
        descriptionChars: plainTextFromHtml(c.descriptionHtml).length,
        hasSeoTitle: Boolean(c.seo?.title?.trim()),
        hasSeoDescription: Boolean(
          c.seo?.description && String(c.seo.description).trim().length >= 50,
        ),
      }));

    return {
      shop: {
        name: data.shop?.name ?? null,
        description: plainTextFromHtml(data.shop?.description).slice(0, 400) || null,
        currencyCode: data.shop?.currencyCode ?? null,
        domain: data.shop?.primaryDomain?.host ?? data.shop?.primaryDomain?.url ?? null,
        shopifyPlan: data.shop?.plan?.displayName ?? null,
      },
      catalog: {
        products: Number(data.productsCount?.count ?? 0),
        collections: Number(data.collectionsCount?.count ?? 0),
      },
      topProductsBySales: (
        (data.bestSellers?.nodes ?? []) as Parameters<typeof mapProduct>[0][]
      ).map(mapProduct),
      newestProducts: (
        (data.recentProducts?.nodes ?? []) as Parameters<typeof mapProduct>[0][]
      ).map(mapProduct),
      collections,
    };
  } catch (error) {
    console.error("[assistant] fetchLiveStoreData:", error);
    return {
      shop: null,
      catalog: { products: 0, collections: 0 },
      topProductsBySales: [] as ProductSnap[],
      newestProducts: [] as ProductSnap[],
      collections: [] as {
        id: string;
        title: string;
        handle: string;
        productCount: number;
        hasImage: boolean;
        descriptionChars: number;
        hasSeoTitle: boolean;
        hasSeoDescription: boolean;
      }[],
      fetchError: true,
    };
  }
}

export type AssistantResult =
  | { ok: true; reply: string }
  | { ok: false; reason: string };

export async function askAssistant(
  shopId: number,
  message: string,
  admin?: AdminApiContext,
): Promise<AssistantResult> {
  const ai = await getShopAiConfig(shopId);
  if (!ai.enabled) return { ok: false, reason: "AI_DISABLED" };
  if (!ai.configured) return { ok: false, reason: AI_NOT_CONFIGURED };

  const shopRow = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });

  const [
    score,
    products,
    seo,
    images,
    inventory,
    collections,
    navigation,
    theme,
    plan,
    caps,
    live,
    productIssueSamples,
    seoIssueSamples,
    imageIssueSamples,
    inventorySamples,
    collectionIssueSamples,
  ] = await Promise.all([
    computeHealthScore(shopId),
    openCount(productIssues, shopId),
    openCount(seoIssues, shopId),
    openCount(imageIssues, shopId),
    openCount(inventoryFlags, shopId),
    openCount(collectionIssues, shopId),
    openCount(navigationIssues, shopId),
    openCount(themeIssues, shopId),
    getShopPlan(shopId),
    getScanCaps(shopId),
    admin
      ? fetchLiveStoreData(admin)
      : Promise.resolve({
          shop: null,
          catalog: { products: 0, collections: 0 },
          topProductsBySales: [] as ProductSnap[],
          newestProducts: [] as ProductSnap[],
          collections: [],
          fetchError: true as const,
        }),
    sampleOpenIssues(productIssues, shopId),
    sampleOpenIssues(seoIssues, shopId),
    sampleOpenIssues(imageIssues, shopId),
    sampleOpenIssues(inventoryFlags, shopId),
    sampleOpenIssues(collectionIssues, shopId),
  ]);

  const planDef = PLANS[plan] || PLANS.free;
  const totalOpen =
    products + seo + images + inventory + collections + navigation + theme;

  const storeContext = {
    store: {
      shopDomain: shopRow?.shopDomain ?? null,
      appPlan: plan,
      appPlanName: planDef.name,
      scanCaps: {
        products: caps.productLimit,
        collections: caps.collectionLimit,
      },
      lastScannedAt: settings?.lastScannedAt
        ? new Date(settings.lastScannedAt).toISOString()
        : null,
      shopify: live.shop,
      catalogCounts: live.catalog,
    },
    healthScore: score,
    openIssueCounts: {
      products,
      seo,
      images,
      inventory,
      collections,
      navigation,
      theme,
      total: totalOpen,
    },
    openIssueSamples: {
      products: productIssueSamples,
      seo: seoIssueSamples,
      images: imageIssueSamples,
      inventory: inventorySamples,
      collections: collectionIssueSamples,
    },
    top10ProductsBySales: live.topProductsBySales,
    newestProducts: live.newestProducts,
    collections: live.collections,
    tipsFromData: {
      productsMissingImage: ([
        ...live.topProductsBySales,
        ...live.newestProducts,
      ] as ProductSnap[])
        .filter((p: ProductSnap) => !p.hasImage)
        .map((p: ProductSnap) => p.title)
        .slice(0, 8),
      productsShortDescription: ([
        ...live.topProductsBySales,
        ...live.newestProducts,
      ] as ProductSnap[])
        .filter((p: ProductSnap) => p.descriptionChars < 20)
        .map((p: ProductSnap) => p.title)
        .slice(0, 8),
      collectionsMissingImage: live.collections
        .filter(
          (c: { hasImage: boolean }) => !c.hasImage,
        )
        .map((c: { title: string }) => c.title),
      collectionsWeakSeo: live.collections
        .filter(
          (c: { hasSeoTitle: boolean; hasSeoDescription: boolean }) =>
            !c.hasSeoTitle || !c.hasSeoDescription,
        )
        .map((c: { title: string }) => c.title),
      lowOrZeroInventory: live.topProductsBySales
        .filter(
          (p: ProductSnap) => p.totalInventory != null && p.totalInventory <= 5,
        )
        .map((p: ProductSnap) => ({
          title: p.title,
          inventory: p.totalInventory,
        })),
    },
  };

  const system = [
    "You are the AI Store Assistant inside CorePilot AI for ONE Shopify merchant.",
    "Answer ONLY from the storeContext JSON (live Shopify catalog + health/issues from this app).",
    "You MUST help with store-related questions such as:",
    "- top products / best sellers / newest products",
    "- how to boost sales, grow the store, improve conversion",
    "- product/collection quality (images, descriptions, SEO, inventory)",
    "- what to fix next based on open issues and health scores",
    "- plan scan limits and priorities",
    "Rules:",
    "1) Use real titles, prices, inventory, and issue counts from storeContext. Never invent products that are not listed.",
    "2) When advising growth/boost strategies, tie advice to THIS store's gaps (missing images, short descriptions, SEO issues, low stock, low health modules).",
    "3) Prefer clear bullet lists and short actionable next steps.",
    "4) If live catalog is empty and fetchError is set, say they should reopen the app / run a scan, and still use health/issue numbers.",
    "5) If a question is unrelated to this Shopify store (e.g. weather, politics, coding homework), briefly say you only help with this store.",
    "6) Do not claim sales revenue or traffic analytics unless present in storeContext (you have BEST_SELLING ranking and inventory, not revenue).",
    "7) Keep answers practical for a Shopify merchant (2–8 bullets when listing recommendations).",
  ].join("\n");

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
