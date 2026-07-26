import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { inventoryFlags } from "../../db/schema";

type Admin = AdminApiContext;

export async function scanInventory(
  shopId: number,
  admin: Admin,
  cursor?: string | null,
) {
  const res = await admin.graphql(
    `#graphql
    query InventoryScan($cursor: String) {
      productVariants(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id sku title
          inventoryQuantity
          product { id title }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null } },
  );
  const json = await res.json();
  const connection = json.data?.productVariants;

  for (const v of connection?.nodes ?? []) {
    const qty = v.inventoryQuantity ?? 0;
    if (qty <= 0) {
      const existing = await db.query.inventoryFlags.findFirst({
        where: and(
          eq(inventoryFlags.shopId, shopId),
          eq(inventoryFlags.resourceId, v.id),
          eq(inventoryFlags.issueCode, "out_of_stock"),
          eq(inventoryFlags.status, "open"),
          isNull(inventoryFlags.deletedAt),
        ),
      });
      if (!existing) {
        await db.insert(inventoryFlags).values({
          shopId,
          resourceId: v.id,
          resourceType: "variant",
          issueCode: "out_of_stock",
          title: `Out of stock — ${v.product?.title ?? v.title}`,
          severity: "high",
          detailsJson: JSON.stringify({ sku: v.sku, qty }),
        });
      }
    } else if (qty > 0 && qty <= 5) {
      const existing = await db.query.inventoryFlags.findFirst({
        where: and(
          eq(inventoryFlags.shopId, shopId),
          eq(inventoryFlags.resourceId, v.id),
          eq(inventoryFlags.issueCode, "low_stock"),
          eq(inventoryFlags.status, "open"),
          isNull(inventoryFlags.deletedAt),
        ),
      });
      if (!existing) {
        await db.insert(inventoryFlags).values({
          shopId,
          resourceId: v.id,
          resourceType: "variant",
          issueCode: "low_stock",
          title: `Low stock — ${v.product?.title ?? v.title}`,
          detailsJson: JSON.stringify({ sku: v.sku, qty }),
        });
      }
    }
  }

  return {
    hasNextPage: Boolean(connection?.pageInfo?.hasNextPage),
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
