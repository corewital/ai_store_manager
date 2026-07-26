import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";
import { ensureShop } from "./shops.server";

function rowToSession(row: typeof sessions.$inferSelect): Session {
  return new Session({
    id: row.id,
    shop: row.shop,
    state: row.state ?? "",
    isOnline: Boolean(row.isOnline),
    scope: row.scope ?? undefined,
    expires: row.expires ?? undefined,
    accessToken: row.accessToken ?? undefined,
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
  });
}

function sessionToValues(session: Session) {
  const user = session.onlineAccessInfo?.associated_user;
  return {
    id: session.id,
    shop: session.shop,
    state: session.state ?? null,
    isOnline: session.isOnline,
    scope: session.scope ?? null,
    expires: session.expires ?? null,
    accessToken: session.accessToken ?? null,
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
    return row ? rowToSession(row) : undefined;
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
    return rows.map(rowToSession);
  }
}
