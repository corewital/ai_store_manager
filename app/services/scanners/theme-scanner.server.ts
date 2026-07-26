import { and, eq, isNull } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { themeIssues } from "../../db/schema";

/** Flag/suggest only — never auto-edit theme files. */
export async function scanTheme(shopId: number, admin: AdminApiContext) {
  const res = await admin.graphql(`#graphql
    query ThemeScan {
      themes(first: 20) {
        nodes { id name role updatedAt }
      }
    }`);
  const json = await res.json();
  const themes = json.data?.themes?.nodes ?? [];
  const main = themes.find((t: { role: string }) => t.role === "MAIN");
  if (!main) {
    const existing = await db.query.themeIssues.findFirst({
      where: and(
        eq(themeIssues.shopId, shopId),
        eq(themeIssues.issueCode, "no_main_theme"),
        eq(themeIssues.status, "open"),
        isNull(themeIssues.deletedAt),
      ),
    });
    if (!existing) {
      await db.insert(themeIssues).values({
        shopId,
        issueCode: "no_main_theme",
        title: "No published MAIN theme found",
        severity: "high",
      });
    }
    return;
  }

  const unpublished = themes.filter(
    (t: { role: string }) => t.role !== "MAIN" && t.role !== "DEVELOPMENT",
  );
  if (unpublished.length > 5) {
    const existing = await db.query.themeIssues.findFirst({
      where: and(
        eq(themeIssues.shopId, shopId),
        eq(themeIssues.issueCode, "many_unpublished"),
        eq(themeIssues.status, "open"),
        isNull(themeIssues.deletedAt),
      ),
    });
    if (!existing) {
      await db.insert(themeIssues).values({
        shopId,
        resourceId: main.id,
        resourceType: "theme",
        issueCode: "many_unpublished",
        title: `${unpublished.length} unpublished themes — consider cleanup`,
        detailsJson: JSON.stringify({ count: unpublished.length }),
      });
    }
  }
}
