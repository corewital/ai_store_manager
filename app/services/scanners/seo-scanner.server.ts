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
  if (existing) return;
  await db.insert(seoIssues).values({
    shopId,
    resourceId,
    resourceType: "product",
    issueCode,
    title,
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
          seo { title description }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null } },
  );
  const json = await res.json();
  const connection = json.data?.products;
  for (const p of connection?.nodes ?? []) {
    if (!p.seo?.title || p.seo.title.length < 10) {
      await upsert(shopId, p.id, "seo_title", `Weak SEO title: ${p.title}`);
    }
    if (!p.seo?.description || p.seo.description.length < 50) {
      await upsert(shopId, p.id, "seo_description", `Weak SEO description: ${p.title}`);
    }
  }
  return {
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
