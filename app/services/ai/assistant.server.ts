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
  limit = 8,
) {
  const rows = await db
    .select({
      title: table.title,
      issueCode: table.issueCode,
      resourceId: table.resourceId,
      detailsJson: table.detailsJson,
    })
    .from(table)
    .where(
      and(eq(table.shopId, shopId), eq(table.status, "open"), isNull(table.deletedAt)),
    )
    .orderBy(desc(table.id))
    .limit(limit);
  return rows.map((r) => {
    let productTitle: string | null = null;
    try {
      const d = r.detailsJson ? JSON.parse(r.detailsJson) : {};
      productTitle = String(d.productTitle || d.title || "") || null;
    } catch {
      productTitle = null;
    }
    return {
      title: r.title,
      code: r.issueCode,
      resourceId: r.resourceId,
      productTitle,
    };
  });
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
};

type CollectionSnap = {
  id: string;
  title: string;
  handle: string;
  productCount: number;
  hasImage: boolean;
  descriptionChars: number;
  hasSeoTitle: boolean;
  hasSeoDescription: boolean;
};

function mapProduct(p: {
  id: string;
  title: string;
  handle?: string;
  status?: string;
  totalInventory?: number | null;
  descriptionHtml?: string | null;
  featuredImage?: { url?: string | null } | null;
  priceRangeV2?: {
    minVariantPrice?: { amount?: string; currencyCode?: string } | null;
  } | null;
  variants?: { nodes?: { sku?: string | null; price?: string }[] };
}): ProductSnap {
  const variants = p.variants?.nodes ?? [];
  const sku = variants.map((v) => v.sku).find((s) => s?.trim()) || null;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle || "",
    status: p.status || "UNKNOWN",
    totalInventory: typeof p.totalInventory === "number" ? p.totalInventory : null,
    price: p.priceRangeV2?.minVariantPrice?.amount ?? variants[0]?.price ?? null,
    currency: p.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
    hasImage: Boolean(p.featuredImage?.url),
    descriptionChars: plainTextFromHtml(p.descriptionHtml).length,
    sku,
  };
}

async function gql<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      console.warn("[assistant] graphql:", json.errors.map((e) => e.message).join("; "));
    }
    return json.data ?? null;
  } catch (error) {
    console.error("[assistant] graphql throw:", error);
    return null;
  }
}

/** Resilient live snapshot — never fail the whole assistant if one field errors. */
async function fetchLiveStoreData(admin: AdminApiContext) {
  const empty = {
    shop: null as null | {
      name: string | null;
      description: string | null;
      currencyCode: string | null;
      domain: string | null;
      shopifyPlan: string | null;
    },
    catalog: { products: 0, collections: 0 },
    topProductsBySales: [] as ProductSnap[],
    newestProducts: [] as ProductSnap[],
    collections: [] as CollectionSnap[],
    fetchError: false,
  };

  const shopData = await gql<{
    shop?: {
      name?: string;
      description?: string;
      currencyCode?: string;
      primaryDomain?: { url?: string; host?: string };
      plan?: { displayName?: string };
    };
  }>(
    admin,
    `#graphql
    query AssistantShop {
      shop {
        name
        description
        currencyCode
        primaryDomain { url host }
        plan { displayName }
      }
    }`,
  );

  if (shopData?.shop) {
    empty.shop = {
      name: shopData.shop.name ?? null,
      description: plainTextFromHtml(shopData.shop.description).slice(0, 400) || null,
      currencyCode: shopData.shop.currencyCode ?? null,
      domain:
        shopData.shop.primaryDomain?.host ??
        shopData.shop.primaryDomain?.url ??
        null,
      shopifyPlan: shopData.shop.plan?.displayName ?? null,
    };
  }

  // Prefer TITLE / CREATED_AT — BEST_SELLING often needs analytics scopes and can blank the query
  const productsData = await gql<{
    products?: { nodes?: Parameters<typeof mapProduct>[0][] };
  }>(
    admin,
    `#graphql
    query AssistantProducts {
      products(first: 15, sortKey: TITLE) {
        nodes {
          id title handle status totalInventory
          descriptionHtml
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          variants(first: 3) { nodes { sku price } }
        }
      }
    }`,
  );

  const newestData = await gql<{
    products?: { nodes?: Parameters<typeof mapProduct>[0][] };
  }>(
    admin,
    `#graphql
    query AssistantNewest {
      products(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id title handle status totalInventory
          descriptionHtml
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          variants(first: 2) { nodes { sku price } }
        }
      }
    }`,
  );

  // Optional best sellers — ignore failures
  const bestData = await gql<{
    products?: { nodes?: Parameters<typeof mapProduct>[0][] };
  }>(
    admin,
    `#graphql
    query AssistantBest {
      products(first: 10, sortKey: BEST_SELLING) {
        nodes {
          id title handle status totalInventory
          descriptionHtml
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          variants(first: 2) { nodes { sku price } }
        }
      }
    }`,
  );

  const collectionsData = await gql<{
    collections?: {
      nodes?: {
        id: string;
        title: string;
        handle?: string;
        descriptionHtml?: string | null;
        image?: { url?: string | null } | null;
        productsCount?: { count?: number } | null;
        seo?: { title?: string | null; description?: string | null } | null;
      }[];
    };
  }>(
    admin,
    `#graphql
    query AssistantCollections {
      collections(first: 12, sortKey: TITLE) {
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

  const byTitle = (productsData?.products?.nodes ?? []).map(mapProduct);
  const newest = (newestData?.products?.nodes ?? []).map(mapProduct);
  const best = (bestData?.products?.nodes ?? []).map(mapProduct);

  empty.topProductsBySales = best.length ? best : byTitle.slice(0, 10);
  empty.newestProducts = newest.length ? newest : byTitle.slice(0, 10);
  empty.catalog.products = Math.max(
    byTitle.length,
    newest.length,
    best.length,
    empty.topProductsBySales.length,
  );
  empty.collections = (collectionsData?.collections?.nodes ?? []).map((c) => ({
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
  empty.catalog.collections = empty.collections.length;
  empty.fetchError =
    empty.topProductsBySales.length === 0 && empty.newestProducts.length === 0;

  // Enrich catalog counts when possible
  const counts = await gql<{
    productsCount?: { count?: number };
    collectionsCount?: { count?: number };
  }>(
    admin,
    `#graphql
    query AssistantCounts {
      productsCount { count }
      collectionsCount { count }
    }`,
  );
  if (counts?.productsCount?.count != null) {
    empty.catalog.products = Number(counts.productsCount.count);
  }
  if (counts?.collectionsCount?.count != null) {
    empty.catalog.collections = Number(counts.collectionsCount.count);
  }

  return empty;
}

export type AssistantResult =
  | { ok: true; reply: string }
  | { ok: false; reason: string };

const BANNED_REFUSAL =
  /I can only answer using this store'?s health and issue data/i;

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
          collections: [] as CollectionSnap[],
          fetchError: true,
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

  const namedFromIssues = [
    ...productIssueSamples,
    ...seoIssueSamples,
    ...imageIssueSamples,
    ...collectionIssueSamples,
  ]
    .map((i) => i.productTitle)
    .filter((t): t is string => Boolean(t))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 15);

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
      catalogLoaded: !live.fetchError,
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
    topProducts: live.topProductsBySales,
    newestProducts: live.newestProducts,
    productNamesFromIssues: namedFromIssues,
    collections: live.collections,
    tipsFromData: {
      productsMissingImage: [...live.topProductsBySales, ...live.newestProducts]
        .filter((p) => !p.hasImage)
        .map((p) => p.title)
        .slice(0, 8),
      productsShortDescription: [...live.topProductsBySales, ...live.newestProducts]
        .filter((p) => p.descriptionChars < 20)
        .map((p) => p.title)
        .slice(0, 8),
      collectionsMissingImage: live.collections
        .filter((c) => !c.hasImage)
        .map((c) => c.title),
      collectionsWeakSeo: live.collections
        .filter((c) => !c.hasSeoTitle || !c.hasSeoDescription)
        .map((c) => c.title),
      lowOrZeroInventory: live.topProductsBySales
        .filter((p) => p.totalInventory != null && p.totalInventory <= 5)
        .map((p) => ({ title: p.title, inventory: p.totalInventory })),
    },
  };

  const system = `You are CorePilot AI Store Assistant for this merchant's Shopify store.

ALWAYS answer store-related questions using storeContext (products, collections, health, issues, plan).
Never refuse with "I can only answer using this store's health and issue data" — that phrase is banned.

You can answer:
- Top / featured / newest products (use topProducts / newestProducts; if empty use productNamesFromIssues)
- How to boost sales, grow the store, improve listings
- SEO, images, inventory, collections, what to fix next
- Module health scores and open issue counts
- Plan scan caps

Format every reply as clean Markdown:
- Use ## headings for sections
- Use bullet or numbered lists
- Use **bold** for key numbers and product names
- Use fenced code blocks only for JSON/code samples
- Keep a short intro sentence, then structured content
- End with 2–4 concrete next steps when giving advice

Rules:
1) Never invent product titles/prices not in storeContext.
2) If topProducts is empty but productNamesFromIssues has names, list those and explain they come from open issues until catalog refresh succeeds.
3) Tie growth advice to THIS store's gaps in tipsFromData and openIssueCounts.
4) Only decline clearly off-topic questions (weather, politics, unrelated homework) in one short sentence.
5) Do not invent revenue/traffic numbers.`;

  try {
    let reply = await generateText(
      `${system}\n\nstoreContext:\n${JSON.stringify(storeContext)}\n\nMerchant question: ${message}`,
      ai.apiKey,
    );

    if (BANNED_REFUSAL.test(reply)) {
      // Model sometimes echoes old refusal — regenerate once with hard override
      reply = await generateText(
        `${system}\n\nIMPORTANT: Do NOT refuse. Answer helpfully with Markdown using storeContext.\n\nstoreContext:\n${JSON.stringify(storeContext)}\n\nMerchant question: ${message}`,
        ai.apiKey,
      );
      if (BANNED_REFUSAL.test(reply)) {
        const top = storeContext.topProducts.slice(0, 5);
        if (top.length) {
          reply = [
            "## Top products",
            ...top.map(
              (p, i) =>
                `${i + 1}. **${p.title}** — ${p.price ? `${p.currency || ""} ${p.price}` : "price n/a"} · stock ${p.totalInventory ?? "n/a"}`,
            ),
            "",
            "## Health snapshot",
            `- Overall **${score.overall}/100** · open issues **${totalOpen}**`,
            "",
            "## Next steps",
            "1. Fix missing images and short descriptions on top products",
            "2. Clear SEO title/description gaps",
            "3. Re-scan after edits to refresh scores",
          ].join("\n");
        } else {
          reply = [
            "## Store health",
            `- Overall **${score.overall}/100**`,
            `- Open issues: products **${products}**, SEO **${seo}**, images **${images}**, collections **${collections}**`,
            "",
            namedFromIssues.length
              ? `## Products seen in open issues\n${namedFromIssues
                  .slice(0, 8)
                  .map((t, i) => `${i + 1}. **${t}**`)
                  .join("\n")}`
              : "## Note\nLive catalog could not be loaded in this request. Try again in a moment.",
            "",
            "## Next steps",
            "1. Open Products / SEO / Images modules and clear open issues",
            "2. Run **Scan Now** on the dashboard",
            "3. Ask again for top products after the catalog loads",
          ].join("\n");
        }
      }
    }

    return { ok: true, reply };
  } catch (error) {
    const reason =
      error instanceof Error && "reason" in error
        ? String((error as { reason: string }).reason)
        : "AI_ERROR";
    return { ok: false, reason };
  }
}
