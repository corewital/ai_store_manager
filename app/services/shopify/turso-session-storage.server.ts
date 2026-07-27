import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";
import { ensureShop } from "./shops.server";

/** shopify-api Session fields for expiring offline tokens (API 13+). */
type SessionWithRefresh = Session & {
  refreshToken?: string | null;
  refreshTokenExpires?: Date | null;
};

/**
 * Public apps (App Store distribution) must use expiring offline tokens.
 * Non-expiring tokens get GraphQL 403 "Forbidden" from Shopify.
 */
function isStaleNonExpiringOffline(
  row: typeof sessions.$inferSelect,
): boolean {
  return !row.isOnline && Boolean(row.accessToken) && !row.refreshToken;
}

function rowToSession(row: typeof sessions.$inferSelect): Session {
  return new Session({
    id: row.id,
    shop: row.shop,
    state: row.state ?? "",
    isOnline: Boolean(row.isOnline),
    scope: row.scope ?? undefined,
    expires: row.expires ?? undefined,
    accessToken: row.accessToken ?? undefined,
    refreshToken: row.refreshToken ?? undefined,
    refreshTokenExpires: row.refreshTokenExpires ?? undefined,
    onlineAccessInfo: row.userId
      ? ({
          expires_in: 0,
          associated_user_scope: row.scope ?? "",
          associated_user: {
            id: Number(row.userId),
            first_name: row.firstName ?? "",
            last_name: row.lastName ?? "",
            email: row.email ?? "",
            account_owner: Boolean(row.accountOwner),
            locale: row.locale ?? "en",
            collaborator: Boolean(row.collaborator),
            email_verified: Boolean(row.emailVerified),
          },
        } as Session["onlineAccessInfo"])
      : undefined,
  } as ConstructorParameters<typeof Session>[0]);
}

function sessionToValues(session: Session) {
  const s = session as SessionWithRefresh;
  const user = session.onlineAccessInfo?.associated_user;
  return {
    id: session.id,
    shop: session.shop,
    state: session.state ?? null,
    isOnline: session.isOnline,
    scope: session.scope ?? null,
    expires: session.expires ?? null,
    accessToken: session.accessToken ?? null,
    refreshToken: s.refreshToken ?? null,
    refreshTokenExpires: s.refreshTokenExpires ?? null,
    userId: user?.id != null ? String(user.id) : null,
    firstName: user?.first_name ?? null,
    lastName: user?.last_name ?? null,
    email: user?.email ?? null,
    accountOwner: user?.account_owner ?? null,
    locale: user?.locale ?? null,
    collaborator: user?.collaborator ?? null,
    emailVerified: user?.email_verified ?? null,
    updatedAt: new Date(),
  };
}

/** Turso / libSQL Shopify session storage. */
export class TursoSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const shop = session.accessToken
      ? await ensureShop(session.shop, session.accessToken)
      : null;
    const values = {
      ...sessionToValues(session),
      shopId: shop?.id ?? null,
    };
    await db
      .insert(sessions)
      .values({ ...values, createdAt: new Date() })
      .onConflictDoUpdate({
        target: sessions.id,
        set: values,
      });
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await db.query.sessions.findFirst({
      where: eq(sessions.id, id),
    });
    if (!row) return undefined;
    if (isStaleNonExpiringOffline(row)) {
      // Force token exchange with expiring=1 on next authenticate.admin
      await db.delete(sessions).where(eq(sessions.id, id));
      return undefined;
    }
    return rowToSession(row);
  }

  async deleteSession(id: string): Promise<boolean> {
    await db.delete(sessions).where(eq(sessions.id, id));
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    await db.delete(sessions).where(inArray(sessions.id, ids));
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const rows = await db.query.sessions.findMany({
      where: eq(sessions.shop, shop),
    });
    const staleIds = rows.filter(isStaleNonExpiringOffline).map((r) => r.id);
    if (staleIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.id, staleIds));
    }
    return rows.filter((r) => !isStaleNonExpiringOffline(r)).map(rowToSession);
  }
}

/** Drop all Shopify sessions for a shop so the next app open re-auths. */
export async function invalidateShopSessions(shopDomain: string) {
  await db.delete(sessions).where(eq(sessions.shop, shopDomain));
}
