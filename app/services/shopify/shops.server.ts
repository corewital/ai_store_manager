import { and, desc, eq, isNull } from "drizzle-orm";
import { db, insertReturningId } from "../../db/client";
import { activityLogs, appInstalls, sessions, shops } from "../../db/schema";

/**
 * Keep a single app_installs row per shop domain.
 * Concurrent ensureShop (storeSession + afterAuth) used to insert twice.
 */
async function collapseDuplicateInstalls(shopDomain: string) {
  const rows = await db.query.appInstalls.findMany({
    where: eq(appInstalls.shopDomain, shopDomain),
    orderBy: [desc(appInstalls.id)],
  });
  if (rows.length === 0) return null;

  const keep =
    rows.find((r) => !r.deletedAt && r.status === "active") ??
    rows.find((r) => !r.deletedAt) ??
    rows[0];

  for (const row of rows) {
    if (row.id === keep.id) continue;
    // Hard-delete extras — unique(shop_domain) cannot keep soft-deleted twins.
    await db.delete(appInstalls).where(eq(appInstalls.id, row.id));
  }

  return keep;
}

async function syncInstallRecord(shop: typeof shops.$inferSelect) {
  await db
    .update(sessions)
    .set({ shopId: shop.id, updatedAt: new Date() })
    .where(eq(sessions.shop, shop.shopDomain));

  let existing = await collapseDuplicateInstalls(shop.shopDomain);

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

  try {
    const id = await insertReturningId(appInstalls, {
      shopId: shop.id,
      shopDomain: shop.shopDomain,
      status: "active",
    });

    // Another concurrent install may have inserted too — keep one row.
    const keep = await collapseDuplicateInstalls(shop.shopDomain);
    if (keep && keep.id === id) {
      await db.insert(activityLogs).values({
        action: "app_installed",
        entityType: "app_install",
        entityId: String(id),
        metaJson: JSON.stringify({ shopDomain: shop.shopDomain }),
      });
    } else if (keep && keep.id !== id) {
      await db
        .update(appInstalls)
        .set({
          shopId: shop.id,
          status: "active",
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(appInstalls.id, keep.id));
    }
    return keep?.id ?? id;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/UNIQUE|unique|constraint/i.test(msg)) throw error;
    existing = await collapseDuplicateInstalls(shop.shopDomain);
    if (!existing) throw error;
    await db
      .update(appInstalls)
      .set({
        shopId: shop.id,
        status: "active",
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(appInstalls.id, existing.id));
    return existing.id;
  }
}

function appApiUrlFromEnv() {
  const raw = (process.env.SHOPIFY_APP_URL || process.env.HOST || "").trim();
  const onVercel = Boolean(process.env.VERCEL);
  const production = "https://corepilotai.corewital.com";
  if (onVercel) {
    if (!raw || raw.includes("trycloudflare.com") || raw.includes("localhost")) {
      return production;
    }
    return raw.replace(/\/$/, "");
  }
  if (!raw || raw.includes("trycloudflare.com")) {
    // Prefer live URL when storing appApiUrl unless a real tunnel is active via shopify app dev
    return production;
  }
  return raw.replace(/\/$/, "") || production;
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
  const id = await insertReturningId(shops, {
    shopDomain,
    accessToken: accessToken ?? null,
    appApiUrl,
    installedAt: new Date(),
  }).catch(async (error: unknown) => {
    // Concurrent install: afterAuth + storeSession may both insert
    const msg = error instanceof Error ? error.message : String(error);
    if (!/UNIQUE|unique|constraint/i.test(msg)) throw error;
    const raced = await db.query.shops.findFirst({
      where: eq(shops.shopDomain, shopDomain),
    });
    if (!raced) throw error;
    return raced.id;
  });
  const row = await db.query.shops.findFirst({ where: eq(shops.id, id) });
  if (!row) throw new Error("Failed to create shop");
  await syncInstallRecord(row).catch((error) => {
    console.error("[ensureShop] syncInstallRecord:", error);
  });
  return row;
}

export async function markShopUninstalled(shopDomain: string) {
  const now = new Date();
  await db
    .update(shops)
    .set({ accessToken: null, uninstalledAt: now, updatedAt: now })
    .where(eq(shops.shopDomain, shopDomain));

  await collapseDuplicateInstalls(shopDomain);
  const install = await db.query.appInstalls.findFirst({
    where: and(eq(appInstalls.shopDomain, shopDomain), isNull(appInstalls.deletedAt)),
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
