import { eq } from "drizzle-orm";
import { db, insertReturningId } from "../../db/client";
import { appSettings } from "../../db/schema";

export async function getOrCreateSettings(shopId: number) {
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (existing) return existing;

  try {
    const id = await insertReturningId(appSettings, { shopId });
    const created = await db.query.appSettings.findFirst({
      where: eq(appSettings.id, id),
    });
    if (!created) throw new Error("Failed to create app settings");
    return created;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/UNIQUE|unique|constraint/i.test(msg)) {
      const again = await db.query.appSettings.findFirst({
        where: eq(appSettings.shopId, shopId),
      });
      if (again) return again;
    }
    throw error;
  }
}
