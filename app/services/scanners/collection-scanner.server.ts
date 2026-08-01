import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { collectionIssues } from "../../db/schema";
import {
  isShortOrMissingDescription,
  isShortOrMissingSeoDescription,
  isShortOrMissingSeoTitle,
} from "../../lib/html-text";

const MIN_COLLECTION_DESC = 20;

async function setIssueOpen(
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
      isNull(collectionIssues.deletedAt),
    ),
    orderBy: [desc(collectionIssues.id)],
  });
  if (existing) {
    await db
      .update(collectionIssues)
      .set({
        status: "open",
        resolvedAt: null,
        title,
        detailsJson: details ? JSON.stringify(details) : existing.detailsJson,
        updatedAt: new Date(),
      })
      .where(eq(collectionIssues.id, existing.id));
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

async function resolveIssue(
  shopId: number,
  resourceId: string,
  issueCode: string,
) {
  await db
    .update(collectionIssues)
    .set({
      status: "resolved",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(collectionIssues.shopId, shopId),
        eq(collectionIssues.resourceId, resourceId),
        eq(collectionIssues.issueCode, issueCode),
        eq(collectionIssues.status, "open"),
        isNull(collectionIssues.deletedAt),
      ),
    );
}

type CollectionNode = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  image?: { url?: string | null } | null;
  productsCount?: { count?: number } | null;
  seo?: { title?: string | null; description?: string | null } | null;
};

/**
 * Scan collections ASC by ID, hard-stop at plan cap.
 * Checks: body description, empty collection, SEO meta title, SEO meta description.
 */
export async function scanCollections(
  shopId: number,
  admin: AdminApiContext,
  maxCollections?: number | null,
) {
  const cap =
    maxCollections == null || !Number.isFinite(maxCollections)
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Number(maxCollections));

  const nodes: CollectionNode[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext && nodes.length < cap) {
    const pageSize = Math.min(250, Math.max(1, Number(cap) - nodes.length));
    const res: Response = await admin.graphql(
      `#graphql
      query CollectionScan($first: Int!, $cursor: String) {
        collections(first: $first, after: $cursor, sortKey: ID, reverse: false) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id title descriptionHtml
            image { url }
            productsCount { count }
            seo { title description }
          }
        }
      }`,
      { variables: { first: pageSize, cursor } },
    );
    const json: {
      data?: {
        collections?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: CollectionNode[];
        };
      };
    } = await res.json();
    const connection = json.data?.collections;
    const pageNodes: CollectionNode[] = connection?.nodes ?? [];
    for (const c of pageNodes) {
      if (nodes.length >= cap) break;
      nodes.push(c);
    }
    hasNext = Boolean(connection?.pageInfo?.hasNextPage) && nodes.length < cap;
    cursor = connection?.pageInfo?.endCursor ?? null;
    if (!pageNodes.length) break;
  }

  const allowedIds = nodes.map((c) => c.id);

  for (const c of nodes) {
    const count = c.productsCount?.count ?? 0;
    const details = {
      productTitle: c.title,
      title: c.title,
      imageUrl: c.image?.url ?? null,
      productsCount: count,
      seoTitle: c.seo?.title ?? null,
      seoDescription: c.seo?.description ?? null,
    };

    if (count === 0) {
      await setIssueOpen(
        shopId,
        c.id,
        "empty_collection",
        `Empty collection — ${c.title}`,
        details,
      );
    } else {
      await resolveIssue(shopId, c.id, "empty_collection");
    }

    if (isShortOrMissingDescription(c.descriptionHtml, MIN_COLLECTION_DESC)) {
      await setIssueOpen(
        shopId,
        c.id,
        "missing_description",
        "Missing or short description",
        details,
      );
    } else {
      await resolveIssue(shopId, c.id, "missing_description");
    }

    if (isShortOrMissingSeoTitle(c.seo?.title)) {
      await setIssueOpen(
        shopId,
        c.id,
        "seo_title",
        "Missing or short SEO title",
        details,
      );
    } else {
      await resolveIssue(shopId, c.id, "seo_title");
    }

    if (isShortOrMissingSeoDescription(c.seo?.description)) {
      await setIssueOpen(
        shopId,
        c.id,
        "seo_description",
        "Missing or short SEO description",
        details,
      );
    } else {
      await resolveIssue(shopId, c.id, "seo_description");
    }

    if (!c.image?.url) {
      await setIssueOpen(shopId, c.id, "no_media", "Missing image", {
        ...details,
        imageUrl: null,
      });
    } else {
      await resolveIssue(shopId, c.id, "no_media");
    }
  }

  if (Number.isFinite(cap) && allowedIds.length > 0) {
    await db
      .update(collectionIssues)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(collectionIssues.shopId, shopId),
          eq(collectionIssues.status, "open"),
          isNull(collectionIssues.deletedAt),
          notInArray(collectionIssues.resourceId, allowedIds),
        ),
      );
  }

  return { scanned: nodes.length, collectionIds: allowedIds };
}
