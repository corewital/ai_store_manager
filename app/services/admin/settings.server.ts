import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { systemSettings } from "../../db/schema";

export async function getSetting<T = unknown>(
  key: string,
  fallback?: T,
): Promise<T> {
  const rows = await db
    .select({ valueJson: systemSettings.valueJson })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) return fallback as T;
  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return fallback as T;
  }
}

export async function setSetting(
  key: string,
  value: unknown,
  description?: string,
) {
  const valueJson = JSON.stringify(value);
  const existingRows = await db
    .select({ id: systemSettings.id })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    await db
      .update(systemSettings)
      .set({
        valueJson,
        updatedAt: new Date(),
        ...(description ? { description } : {}),
      })
      .where(eq(systemSettings.id, existing.id));
    return;
  }
  await db.insert(systemSettings).values({
    key,
    valueJson,
    description: description ?? null,
  });
}
