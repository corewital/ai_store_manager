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

export async function scanSeo(shopId: number, admin: Admin, cursor?: string | null) {
  const res = await admin.graphql(
    `#graphql
    query SeoScan($cursor: String) {
      products(first: 25, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title
          featuredImage { url }
          seo { title description }
          variants(first: 5) { nodes { sku } }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null } },
  );
  const json = await res.json();
  const connection = json.data?.products;
  for (const p of connection?.nodes ?? []) {
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
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
