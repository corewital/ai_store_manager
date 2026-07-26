import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { imageIssues } from "../../db/schema";

type Admin = AdminApiContext;

/** Detect-only (no sharp). Pixel optimize is Phase 7. */
export async function scanImages(
  shopId: number,
  admin: Admin,
  cursor?: string | null,
) {
  const res = await admin.graphql(
    `#graphql
    query ImageScan($cursor: String) {
      products(first: 20, after: $cursor) {
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
    { variables: { cursor: cursor ?? null } },
  );
  const json = await res.json();
  const connection = json.data?.products;

  for (const product of connection?.nodes ?? []) {
    for (const media of product.media?.nodes ?? []) {
      if (!media?.id) continue;
      if (!media.alt || media.alt.trim().length === 0) {
        const existing = await db.query.imageIssues.findFirst({
          where: and(
            eq(imageIssues.shopId, shopId),
            eq(imageIssues.resourceId, media.id),
            eq(imageIssues.issueCode, "missing_alt"),
            eq(imageIssues.status, "open"),
            isNull(imageIssues.deletedAt),
          ),
        });
        if (!existing) {
          await db.insert(imageIssues).values({
            shopId,
            resourceId: media.id,
            resourceType: "media_image",
            issueCode: "missing_alt",
            title: `Missing alt text — ${product.title}`,
            detailsJson: JSON.stringify({
              productId: product.id,
              url: media.image?.url ?? null,
              width: media.image?.width ?? null,
              height: media.image?.height ?? null,
            }),
          });
        }
      }
      const w = media.image?.width ?? 0;
      const h = media.image?.height ?? 0;
      if (w > 2048 || h > 2048) {
        const existing = await db.query.imageIssues.findFirst({
          where: and(
            eq(imageIssues.shopId, shopId),
            eq(imageIssues.resourceId, media.id),
            eq(imageIssues.issueCode, "oversized"),
            eq(imageIssues.status, "open"),
            isNull(imageIssues.deletedAt),
          ),
        });
        if (!existing) {
          await db.insert(imageIssues).values({
            shopId,
            resourceId: media.id,
            resourceType: "media_image",
            issueCode: "oversized",
            title: `Oversized image — ${product.title}`,
            detailsJson: JSON.stringify({
              productId: product.id,
              url: media.image?.url ?? null,
              width: w,
              height: h,
            }),
          });
        }
      }
    }
  }

  return {
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
    endCursor: (connection?.pageInfo?.endCursor as string | null) ?? null,
  };
}
