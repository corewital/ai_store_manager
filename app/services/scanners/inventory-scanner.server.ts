import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { inventoryFlags } from "../../db/schema";

type Admin = AdminApiContext;

async function upsertFlag(
  shopId: number,
  resourceId: string,
  issueCode: string,
  title: string,
  severity: string,
  details: Record<string, unknown>,
) {
  const existing = await db.query.inventoryFlags.findFirst({
    where: and(
      eq(inventoryFlags.shopId, shopId),
      eq(inventoryFlags.resourceId, resourceId),
      eq(inventoryFlags.issueCode, issueCode),
      eq(inventoryFlags.status, "open"),
      isNull(inventoryFlags.deletedAt),
    ),
  });
  if (existing) {
    await db
      .update(inventoryFlags)
      .set({
        detailsJson: JSON.stringify(details),
        title,
        severity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryFlags.id, existing.id));
    return;
  }
  await db.insert(inventoryFlags).values({
    shopId,
    resourceId,
    resourceType: "variant",
    issueCode,
    title,
    severity,
    detailsJson: JSON.stringify(details),
  });
}

export async function scanInventory(
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

  // Same product window as Products/SEO/Images (DESC) — not unbounded variants
  const res = await admin.graphql(
    `#graphql
    query InventoryScan($cursor: String, $first: Int!) {
      products(first: $first, after: $cursor, sortKey: CREATED_AT, reverse: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          featuredImage { url }
          variants(first: 50) {
            nodes {
              id sku title inventoryQuantity
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
    for (const v of product.variants?.nodes ?? []) {
      const qty = v.inventoryQuantity ?? 0;
      const details = {
        sku: v.sku,
        qty,
        productTitle: product.title,
        title: product.title,
        imageUrl: product.featuredImage?.url ?? null,
        productId: product.id,
      };
      if (qty <= 0) {
        await upsertFlag(
          shopId,
          v.id,
          "out_of_stock",
          `Out of stock — ${product.title}`,
          "high",
          details,
        );
      } else if (qty > 0 && qty <= 5) {
        await upsertFlag(
          shopId,
          v.id,
          "low_stock",
          `Low stock — ${product.title}`,
          "medium",
          details,
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

export async function flagOrderInventory(shopId: number, payload: unknown) {
  const lineItems =
    (payload as { line_items?: { variant_id?: number; name?: string; quantity?: number }[] })
      ?.line_items ?? [];
  for (const line of lineItems) {
    if (!line.variant_id) continue;
    const resourceId = `gid://shopify/ProductVariant/${line.variant_id}`;
    await db.insert(inventoryFlags).values({
      shopId,
      resourceId,
      resourceType: "variant",
      issueCode: "order_movement",
      title: `Order moved stock — ${line.name ?? resourceId}`,
      detailsJson: JSON.stringify({ quantity: line.quantity }),
      severity: "low",
    });
  }
}
