import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { imageIssues } from "../../db/schema";

type Admin = AdminApiContext;

async function upsertImageIssue(
  shopId: number,
  resourceId: string,
  issueCode: string,
  title: string,
  details: Record<string, unknown>,
) {
  const existing = await db.query.imageIssues.findFirst({
    where: and(
      eq(imageIssues.shopId, shopId),
      eq(imageIssues.resourceId, resourceId),
      eq(imageIssues.issueCode, issueCode),
      eq(imageIssues.status, "open"),
      isNull(imageIssues.deletedAt),
    ),
  });
  if (existing) {
    await db
      .update(imageIssues)
      .set({
        title,
        detailsJson: JSON.stringify(details),
        updatedAt: new Date(),
      })
      .where(eq(imageIssues.id, existing.id));
    return;
  }
  await db.insert(imageIssues).values({
    shopId,
    resourceId,
    resourceType: "media_image",
    issueCode,
    title,
    detailsJson: JSON.stringify(details),
  });
}

/** Detect-only (no sharp). Pixel optimize is Phase 7. */
export async function scanImages(
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
    query ImageScan($cursor: String, $first: Int!) {
      products(first: $first, after: $cursor, sortKey: CREATED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id title
          media(first: 20) {
            nodes {
              ... on MediaImage {
                id
                alt
                image { url width height }
              }
            }
          }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null, first } },
  );
  const json = await res.json();
  const connection = json.data?.products;
  const nodes = connection?.nodes ?? [];

  for (const product of nodes) {
    for (const media of product.media?.nodes ?? []) {
      if (!media?.id) continue;
      const details = {
        productId: product.id,
        productTitle: product.title,
        title: product.title,
        url: media.image?.url ?? null,
        imageUrl: media.image?.url ?? null,
        width: media.image?.width ?? null,
        height: media.image?.height ?? null,
      };
      if (!media.alt || media.alt.trim().length === 0) {
        await upsertImageIssue(
          shopId,
          media.id,
          "missing_alt",
          `Missing alt text — ${product.title}`,
          details,
        );
      }
      const w = media.image?.width ?? 0;
      const h = media.image?.height ?? 0;
      if (w > 2048 || h > 2048) {
        await upsertImageIssue(
          shopId,
          media.id,
          "oversized",
          `Oversized image — ${product.title}`,
          { ...details, width: w, height: h },
        );
      }
    }
  }

  return {
    scanned: nodes.length,
    productIds: nodes.map((p: { id: string }) => p.id),
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage) && nodes.length === first,
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
