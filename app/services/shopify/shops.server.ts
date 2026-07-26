import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { activityLogs, appInstalls, sessions, shops } from "../../db/schema";

async function syncInstallRecord(shop: typeof shops.$inferSelect) {
  await db
    .update(sessions)
    .set({ shopId: shop.id, updatedAt: new Date() })
    .where(eq(sessions.shop, shop.shopDomain));

  const existing = await db.query.appInstalls.findFirst({
    where: eq(appInstalls.shopDomain, shop.shopDomain),
    orderBy: [desc(appInstalls.id)],
  });

  if (existing) {
    if (
      existing.status !== "active" ||
      existing.shopId !== shop.id ||
      existing.deletedAt
    ) {
      await db
        .update(appInstalls)
        .set({
          shopId: shop.id,
          status: "active",
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(appInstalls.id, existing.id));

      await db.insert(activityLogs).values({
        action: "app_reinstalled",
        entityType: "app_install",
        entityId: String(existing.id),
        metaJson: JSON.stringify({ shopDomain: shop.shopDomain }),
      });
    }
    return existing.id;
  }

  const [{ id }] = await db
    .insert(appInstalls)
    .values({
      shopId: shop.id,
      shopDomain: shop.shopDomain,
      status: "active",
    })
    .$returningId();

  await db.insert(activityLogs).values({
    action: "app_installed",
    entityType: "app_install",
    entityId: String(id),
    metaJson: JSON.stringify({ shopDomain: shop.shopDomain }),
  });
  return id;
}

function appApiUrlFromEnv() {
  const raw = process.env.SHOPIFY_APP_URL || process.env.HOST || "";
  return raw.replace(/\/$/, "") || null;
}

export async function ensureShop(
  shopDomain: string,
  accessToken?: string | null,
) {
  const appApiUrl = appApiUrlFromEnv();
  const existing = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, shopDomain),
  });
  if (existing) {
    const shouldReactivate = Boolean(existing.uninstalledAt || existing.deletedAt);
    const tokenChanged = Boolean(accessToken && accessToken !== existing.accessToken);
    const urlChanged = Boolean(appApiUrl && appApiUrl !== existing.appApiUrl);
    if (tokenChanged || shouldReactivate || urlChanged) {
      const updates = {
        ...(accessToken ? { accessToken } : {}),
        ...(appApiUrl ? { appApiUrl } : {}),
        ...(shouldReactivate
          ? {
              installedAt: new Date(),
              uninstalledAt: null,
              deletedAt: null,
            }
          : {}),
        updatedAt: new Date(),
      };
      await db
        .update(shops)
        .set(updates)
        .where(eq(shops.id, existing.id));
      const updated = { ...existing, ...updates };
      await syncInstallRecord(updated);
      return updated;
    }
    await syncInstallRecord(existing);
    return existing;
  }
  const [{ id }] = await db
    .insert(shops)
    .values({
      shopDomain,
      accessToken: accessToken ?? null,
      appApiUrl,
      installedAt: new Date(),
    })
    .$returningId();
  const row = await db.query.shops.findFirst({ where: eq(shops.id, id) });
  if (!row) throw new Error("Failed to create shop");
  await syncInstallRecord(row);
  return row;
}

export async function markShopUninstalled(shopDomain: string) {
  const now = new Date();
  await db
    .update(shops)
    .set({ accessToken: null, uninstalledAt: now, updatedAt: now })
    .where(eq(shops.shopDomain, shopDomain));

  const install = await db.query.appInstalls.findFirst({
    where: eq(appInstalls.shopDomain, shopDomain),
    orderBy: [desc(appInstalls.id)],
  });
  if (install) {
    await db
      .update(appInstalls)
      .set({ status: "uninstalled", updatedAt: now })
      .where(eq(appInstalls.id, install.id));
    await db.insert(activityLogs).values({
      action: "app_uninstalled",
      entityType: "app_install",
      entityId: String(install.id),
      metaJson: JSON.stringify({ shopDomain }),
    });
  }

  // Tokens are no longer valid after uninstall; remove stored sessions.
  await db.delete(sessions).where(eq(sessions.shop, shopDomain));
}

/** Backfill install tracking from valid stored Shopify sessions. */
export async function reconcileInstallRecords() {
  const storedSessions = await db
    .select({
      shop: sessions.shop,
      accessToken: sessions.accessToken,
    })
    .from(sessions);
  const byShop = new Map(
    storedSessions
      .filter((row) => row.accessToken)
      .map((row) => [row.shop, row.accessToken] as const),
  );

  await Promise.all(
    [...byShop].map(([shop, accessToken]) => ensureShop(shop, accessToken)),
  );
  return byShop.size;
}
