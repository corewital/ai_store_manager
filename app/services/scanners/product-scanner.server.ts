import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { productIssues } from "../../db/schema";

type Admin = AdminApiContext;

type ProductNode = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  status?: string;
  featuredImage?: { url?: string | null } | null;
  variants?: { nodes: { id: string; sku?: string | null; price?: string }[] };
  media?: { nodes: { id: string; preview?: { image?: { url?: string } } }[] };
};

function productDetails(product: ProductNode) {
  const variants = product.variants?.nodes ?? [];
  const skus = variants.map((v) => v.sku).filter((s): s is string => Boolean(s?.trim()));
  const imageUrl =
    product.featuredImage?.url ||
    product.media?.nodes?.[0]?.preview?.image?.url ||
    null;
  return {
    title: product.title,
    productTitle: product.title,
    sku: skus[0] || null,
    skus,
    imageUrl,
  };
}

async function upsertIssue(
  shopId: number,
  resourceId: string,
  issueCode: string,
  title: string,
  details?: Record<string, unknown>,
) {
  const existing = await db.query.productIssues.findFirst({
    where: and(
      eq(productIssues.shopId, shopId),
      eq(productIssues.resourceId, resourceId),
      eq(productIssues.issueCode, issueCode),
      eq(productIssues.status, "open"),
      isNull(productIssues.deletedAt),
    ),
  });
  if (existing) {
    if (details) {
      await db
        .update(productIssues)
        .set({ detailsJson: JSON.stringify(details), updatedAt: new Date() })
        .where(eq(productIssues.id, existing.id));
    }
    return;
  }
  await db.insert(productIssues).values({
    shopId,
    resourceId,
    resourceType: "product",
    issueCode,
    title,
    detailsJson: details ? JSON.stringify(details) : null,
  });
}

function detectProductIssues(shopId: number, product: ProductNode) {
  const jobs: Promise<void>[] = [];
  const details = productDetails(product);
  if (!product.descriptionHtml || product.descriptionHtml.trim().length < 20) {
    jobs.push(
      upsertIssue(shopId, product.id, "missing_description", "Missing or short description", details),
    );
  }
  const variants = product.variants?.nodes ?? [];
  if (variants.some((v) => !v.sku)) {
    jobs.push(
      upsertIssue(shopId, product.id, "missing_sku", "Variant missing SKU", details),
    );
  }
  if ((product.media?.nodes?.length ?? 0) === 0) {
    jobs.push(
      upsertIssue(shopId, product.id, "no_media", "Product has no media", {
        ...details,
        imageUrl: null,
      }),
    );
  }
  return Promise.all(jobs);
}

export async function scanSingleProduct(
  shopId: number,
  admin: Admin,
  productGid: string,
) {
  const res = await admin.graphql(
    `#graphql
    query ProductScan($id: ID!) {
      product(id: $id) {
        id title descriptionHtml status
        featuredImage { url }
        variants(first: 50) { nodes { id sku price } }
        media(first: 5) { nodes { id preview { image { url } } } }
      }
    }`,
    { variables: { id: productGid } },
  );
  const json = await res.json();
  const product = json.data?.product as ProductNode | null;
  if (!product) return;
  await detectProductIssues(shopId, product);
}

export async function clearProductIssues(shopId: number, productGid: string) {
  await db
    .update(productIssues)
    .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(productIssues.shopId, shopId),
        eq(productIssues.resourceId, productGid),
        eq(productIssues.status, "open"),
      ),
    );
}

export async function scanProducts(
  shopId: number,
  admin: Admin,
  cursor?: string | null,
  maxTake?: number,
) {
  const first =
    maxTake != null && Number.isFinite(maxTake)
      ? Math.min(25, Math.max(0, Math.floor(maxTake)))
      : 25;
  if (first <= 0) {
    return {
      scanned: 0,
      productIds: [] as string[],
      hasNextPage: false,
      endCursor: null as string | null,
    };
  }

  const res = await admin.graphql(
    `#graphql
    query ProductsScan($cursor: String, $first: Int!) {
      products(first: $first, after: $cursor, sortKey: CREATED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title descriptionHtml status
          featuredImage { url }
          variants(first: 50) { nodes { id sku price } }
          media(first: 5) { nodes { id preview { image { url } } } }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null, first } },
  );
  const json = await res.json();
  const connection = json.data?.products;
  const nodes = (connection?.nodes ?? []) as ProductNode[];
  for (const product of nodes) {
    await detectProductIssues(shopId, product);
  }
  return {
    scanned: nodes.length,
    productIds: nodes.map((n) => n.id),
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage) && nodes.length === first,
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
