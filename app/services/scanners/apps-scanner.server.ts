import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import { installedAppsSnapshot } from "../../db/schema";

export type AppBlockRow = {
  id: string;
  title: string;
  handle: string;
  type: string;
  used: boolean;
};

/**
 * Theme app blocks / embeds only — Shopify exposes no full installed-apps API
 * to third-party apps, so this reflects what is visible in the theme.
 */
export async function scanApps(shopId: number, admin: AdminApiContext) {
  let apps: AppBlockRow[] = [];
  let themeId: string | null = null;
  let themeName: string | null = null;

  try {
    const res = await admin.graphql(`#graphql
      query AppsScan {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id name
            files(filenames: ["config/settings_data.json"], first: 1) {
              nodes {
                body {
                  ... on OnlineStoreThemeFileBodyText { content }
                }
              }
            }
          }
        }
      }`);
    const json = await res.json();
    const theme = json.data?.themes?.nodes?.[0];
    themeId = theme?.id ?? null;
    themeName = theme?.name ?? null;

    const content = theme?.files?.nodes?.[0]?.body?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const blocks = parsed?.current?.blocks ?? parsed?.blocks ?? {};
      apps = Object.entries(blocks as Record<string, Record<string, unknown>>)
        .map(([id, block]) => {
          const type = String(block?.type ?? "");
          const handle = type.split("/")[1] ?? type;
          return {
            id,
            title: handle || "Unknown block",
            handle,
            type,
            used: block?.disabled !== true,
          };
        })
        .filter((b) => b.type.includes("blocks") || b.type.includes("/"));
    }
  } catch {
    apps = [];
  }

  try {
    await db.insert(installedAppsSnapshot).values({
      shopId,
      snapshotJson: JSON.stringify({ themeId, themeName, apps }),
      scannedAt: new Date(),
    });
  } catch {
    /* snapshot is best-effort */
  }

  return apps;
}
