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
) {
  const res = await admin.graphql(
    `#graphql
    query InventoryScan($cursor: String) {
      productVariants(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id sku title
          inventoryQuantity
          product {
            id
            title
            featuredImage { url }
          }
        }
      }
    }`,
    { variables: { cursor: cursor ?? null } },
  );
  const json = await res.json();
  const connection = json.data?.productVariants;

  for (const v of connection?.nodes ?? []) {
    const qty = v.inventoryQuantity ?? 0;
    const details = {
      sku: v.sku,
      qty,
      productTitle: v.product?.title ?? v.title,
      title: v.product?.title ?? v.title,
      imageUrl: v.product?.featuredImage?.url ?? null,
      productId: v.product?.id ?? null,
    };
    if (qty <= 0) {
      await upsertFlag(
        shopId,
        v.id,
        "out_of_stock",
        `Out of stock — ${v.product?.title ?? v.title}`,
        "high",
        details,
      );
    } else if (qty > 0 && qty <= 5) {
      await upsertFlag(
        shopId,
        v.id,
        "low_stock",
        `Low stock — ${v.product?.title ?? v.title}`,
        "medium",
        details,
      );
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
