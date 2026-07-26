import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings } from "../../db/schema";
import { getModuleVisibility } from "../admin/module-visibility.server";
import type { AppModuleVisibility } from "../admin/module-visibility";
import { getOrCreateSettings } from "../shopify/app-settings.server";

import { SCAN_MODULE_KEYS, type ScanModuleKey } from "./scan-modules";

export { SCAN_MODULE_KEYS };
export type { ScanModuleKey };

/**
 * Effective modules for a shop:
 * admin master visibility AND shop modulesEnabledJson (merchant toggle).
 * Admin-off always wins (cannot scan/show).
 */
export async function getEffectiveScanModules(
  shopId: number,
): Promise<Record<ScanModuleKey, boolean>> {
  const [master, settings] = await Promise.all([
    getModuleVisibility(),
    getOrCreateSettings(shopId),
  ]);

  let shopEnabled: Record<string, boolean> = {};
  try {
    shopEnabled = settings.modulesEnabledJson
      ? JSON.parse(settings.modulesEnabledJson)
      : {};
  } catch {
    shopEnabled = {};
  }

  return Object.fromEntries(
    SCAN_MODULE_KEYS.map((key) => {
      const adminOn = master[key as keyof AppModuleVisibility] !== false;
      const shopOn = shopEnabled[key] !== false;
      return [key, adminOn && shopOn];
    }),
  ) as Record<ScanModuleKey, boolean>;
}

export async function getShopModulesEnabledRaw(
  shopId: number,
): Promise<Record<ScanModuleKey, boolean>> {
  const settings = await getOrCreateSettings(shopId);
  let enabled: Record<string, boolean> = {};
  try {
    enabled = settings.modulesEnabledJson
      ? JSON.parse(settings.modulesEnabledJson)
      : {};
  } catch {
    enabled = {};
  }
  return Object.fromEntries(
    SCAN_MODULE_KEYS.map((k) => [k, enabled[k] !== false]),
  ) as Record<ScanModuleKey, boolean>;
}

export async function saveShopModulesEnabled(
  shopId: number,
  enabled: Record<string, boolean>,
) {
  const settings = await getOrCreateSettings(shopId);
  // Force off anything admin has hidden
  const master = await getModuleVisibility();
  const cleaned = Object.fromEntries(
    SCAN_MODULE_KEYS.map((k) => {
      const adminOn = master[k as keyof AppModuleVisibility] !== false;
      return [k, adminOn && enabled[k] !== false];
    }),
  );
  await db
    .update(appSettings)
    .set({
      modulesEnabledJson: JSON.stringify(cleaned),
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, settings.id));
  return cleaned;
}
