import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { seoIssues } from "../../db/schema";

type Admin = AdminApiContext;

async function upsert(
  shopId: number,
  resourceId: string,
  issueCode: string,
  title: string,
  details?: Record<string, unknown>,
) {
  const existing = await db.query.seoIssues.findFirst({
    where: and(
      eq(seoIssues.shopId, shopId),
      eq(seoIssues.resourceId, resourceId),
      eq(seoIssues.issueCode, issueCode),
      eq(seoIssues.status, "open"),
      isNull(seoIssues.deletedAt),
    ),
  });
  if (existing) {
    if (details) {
      await db
        .update(seoIssues)
        .set({ detailsJson: JSON.stringify(details), updatedAt: new Date() })
        .where(eq(seoIssues.id, existing.id));
    }
    return;
  }
  await db.insert(seoIssues).values({
    shopId,
    resourceId,
    resourceType: "product",
    issueCode,
    title,
    detailsJson: details ? JSON.stringify(details) : null,
  });
}

export async function scanSeo(
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
    query SeoScan($cursor: String, $first: Int!) {
      products(first: $first, after: $cursor, sortKey: CREATED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title
          featuredImage { url }
          seo { title description }
          variants(first: 5) { nodes { sku } }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null, first } },
  );
  const json = await res.json();
  const connection = json.data?.products;
  const nodes = connection?.nodes ?? [];
  for (const p of nodes) {
    const skus = (p.variants?.nodes ?? [])
      .map((v: { sku?: string | null }) => v.sku)
      .filter(Boolean);
    const details = {
      productTitle: p.title,
      title: p.title,
      imageUrl: p.featuredImage?.url ?? null,
      sku: skus[0] || null,
    };
    if (!p.seo?.title || p.seo.title.length < 10) {
      await upsert(shopId, p.id, "seo_title", `Weak SEO title: ${p.title}`, details);
    }
    if (!p.seo?.description || p.seo.description.length < 50) {
      await upsert(
        shopId,
        p.id,
        "seo_description",
        `Weak SEO description: ${p.title}`,
        details,
      );
    }
  }
  return {
    scanned: nodes.length,
    productIds: nodes.map((p: { id: string }) => p.id),
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage) && nodes.length === first,
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
