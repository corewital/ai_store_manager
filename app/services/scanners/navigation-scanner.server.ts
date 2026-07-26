import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { navigationIssues } from "../../db/schema";

export async function scanNavigation(shopId: number, admin: AdminApiContext) {
  const res = await admin.graphql(`#graphql
    query NavigationScan {
      menus(first: 10) {
        nodes {
          id title handle
          items {
            id title url type
            items { id title url }
          }
        }
      }
    }`);
  const json = await res.json();
  for (const menu of json.data?.menus?.nodes ?? []) {
    if (!menu.items?.length) {
      const existing = await db.query.navigationIssues.findFirst({
        where: and(
          eq(navigationIssues.shopId, shopId),
          eq(navigationIssues.resourceId, menu.id),
          eq(navigationIssues.issueCode, "empty_menu"),
          eq(navigationIssues.status, "open"),
          isNull(navigationIssues.deletedAt),
        ),
      });
      if (!existing) {
        await db.insert(navigationIssues).values({
          shopId,
          resourceId: menu.id,
          resourceType: "menu",
          issueCode: "empty_menu",
          title: `Empty menu — ${menu.title}`,
        });
      }
    }
    for (const item of menu.items ?? []) {
      if (!item.url) {
        const existing = await db.query.navigationIssues.findFirst({
          where: and(
            eq(navigationIssues.shopId, shopId),
            eq(navigationIssues.resourceId, item.id),
            eq(navigationIssues.issueCode, "missing_url"),
            eq(navigationIssues.status, "open"),
            isNull(navigationIssues.deletedAt),
          ),
        });
        if (!existing) {
          await db.insert(navigationIssues).values({
            shopId,
            resourceId: item.id,
            resourceType: "menu_item",
            issueCode: "missing_url",
            title: `Menu item missing URL — ${item.title}`,
            detailsJson: JSON.stringify({ menuId: menu.id }),
          });
        }
      }
    }
  }
}
