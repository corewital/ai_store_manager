import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { collectionIssues } from "../../db/schema";

export async function scanCollections(shopId: number, admin: AdminApiContext) {
  const res = await admin.graphql(`#graphql
    query CollectionScan {
      collections(first: 50) {
        nodes {
          id title descriptionHtml
          productsCount { count }
        }
      }
    }`);
  const json = await res.json();
  for (const c of json.data?.collections?.nodes ?? []) {
    const count = c.productsCount?.count ?? 0;
    if (count === 0) {
      const existing = await db.query.collectionIssues.findFirst({
        where: and(
          eq(collectionIssues.shopId, shopId),
          eq(collectionIssues.resourceId, c.id),
          eq(collectionIssues.issueCode, "empty_collection"),
          eq(collectionIssues.status, "open"),
          isNull(collectionIssues.deletedAt),
        ),
      });
      if (!existing) {
        await db.insert(collectionIssues).values({
          shopId,
          resourceId: c.id,
          resourceType: "collection",
          issueCode: "empty_collection",
          title: `Empty collection — ${c.title}`,
        });
      }
    }
    if (!c.descriptionHtml || c.descriptionHtml.trim().length < 10) {
      const existing = await db.query.collectionIssues.findFirst({
        where: and(
          eq(collectionIssues.shopId, shopId),
          eq(collectionIssues.resourceId, c.id),
          eq(collectionIssues.issueCode, "missing_description"),
          eq(collectionIssues.status, "open"),
          isNull(collectionIssues.deletedAt),
        ),
      });
      if (!existing) {
        await db.insert(collectionIssues).values({
          shopId,
          resourceId: c.id,
          resourceType: "collection",
          issueCode: "missing_description",
          title: `Collection missing description — ${c.title}`,
        });
      }
    }
  }
}
