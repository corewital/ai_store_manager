import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings } from "../../db/schema";

export async function getOrCreateSettings(shopId: number) {
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shopId),
  });
  if (existing) return existing;

  const [{ id }] = await db
    .insert(appSettings)
    .values({ shopId })
    .$returningId();
  const created = await db.query.appSettings.findFirst({
    where: eq(appSettings.id, id),
  });
  if (!created) throw new Error("Failed to create app settings");
  return created;
}
