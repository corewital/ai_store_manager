import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { collectionIssues } from "../../db/schema";

async function upsert(
  shopId: number,
  resourceId: string,
  issueCode: string,
  title: string,
  details?: Record<string, unknown>,
) {
  const existing = await db.query.collectionIssues.findFirst({
    where: and(
      eq(collectionIssues.shopId, shopId),
      eq(collectionIssues.resourceId, resourceId),
      eq(collectionIssues.issueCode, issueCode),
      eq(collectionIssues.status, "open"),
      isNull(collectionIssues.deletedAt),
    ),
  });
  if (existing) {
    if (details) {
      await db
        .update(collectionIssues)
        .set({ detailsJson: JSON.stringify(details), updatedAt: new Date() })
        .where(eq(collectionIssues.id, existing.id));
    }
    return;
  }
  await db.insert(collectionIssues).values({
    shopId,
    resourceId,
    resourceType: "collection",
    issueCode,
    title,
    detailsJson: details ? JSON.stringify(details) : null,
  });
}

export async function scanCollections(
  shopId: number,
  admin: AdminApiContext,
  maxCollections?: number | null,
) {
  const first =
    maxCollections == null
      ? 50
      : Math.min(50, Math.max(1, maxCollections));
  const res = await admin.graphql(
    `#graphql
    query CollectionScan($first: Int!) {
      collections(first: $first) {
        nodes {
          id title descriptionHtml
          image { url }
          productsCount { count }
        }
      }
    }`,
    { variables: { first } },
  );
  const json = await res.json();
  let nodes = json.data?.collections?.nodes ?? [];
  if (maxCollections != null) nodes = nodes.slice(0, maxCollections);
  for (const c of nodes) {
    const count = c.productsCount?.count ?? 0;
    const details = {
      productTitle: c.title,
      title: c.title,
      imageUrl: c.image?.url ?? null,
      productsCount: count,
    };
    if (count === 0) {
      await upsert(
        shopId,
        c.id,
        "empty_collection",
        `Empty collection — ${c.title}`,
        details,
      );
    }
    if (!c.descriptionHtml || c.descriptionHtml.trim().length < 10) {
      await upsert(
        shopId,
        c.id,
        "missing_description",
        `Collection missing description — ${c.title}`,
        details,
      );
    }
  }
}
