import { and, desc, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { seoIssues } from "../../db/schema";
import {
  isShortOrMissingSeoDescription,
  isShortOrMissingSeoTitle,
} from "../../lib/html-text";

type Admin = AdminApiContext;

async function setIssueOpen(
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
      isNull(seoIssues.deletedAt),
    ),
    orderBy: [desc(seoIssues.id)],
  });
  if (existing) {
    await db
      .update(seoIssues)
      .set({
        status: "open",
        resolvedAt: null,
        title,
        detailsJson: details ? JSON.stringify(details) : existing.detailsJson,
        updatedAt: new Date(),
      })
      .where(eq(seoIssues.id, existing.id));
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

async function resolveIssue(
  shopId: number,
  resourceId: string,
  issueCode: string,
) {
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
        eq(seoIssues.resourceId, resourceId),
        eq(seoIssues.issueCode, issueCode),
        eq(seoIssues.status, "open"),
        isNull(seoIssues.deletedAt),
      ),
    );
}

/**
 * Product SEO: meta title + meta description (search engine listing fields).
 */
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
      seoTitle: p.seo?.title ?? null,
      seoDescription: p.seo?.description ?? null,
    };

    if (isShortOrMissingSeoTitle(p.seo?.title)) {
      await setIssueOpen(
        shopId,
        p.id,
        "seo_title",
        "Missing or short SEO title",
        details,
      );
    } else {
      await resolveIssue(shopId, p.id, "seo_title");
    }

    if (isShortOrMissingSeoDescription(p.seo?.description)) {
      await setIssueOpen(
        shopId,
        p.id,
        "seo_description",
        "Missing or short SEO description",
        details,
      );
    } else {
      await resolveIssue(shopId, p.id, "seo_description");
    }
  }
  return {
    scanned: nodes.length,
    productIds: nodes.map((p: { id: string }) => p.id),
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage) && nodes.length === first,
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
