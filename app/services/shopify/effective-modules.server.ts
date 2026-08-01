import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { appSettings, shops } from "../../db/schema";
import { getModuleVisibility } from "../admin/module-visibility.server";
import type { AppModuleVisibility } from "../admin/module-visibility";
import { getOrCreateSettings } from "../shopify/app-settings.server";
import { PLANS, type PlanSlug } from "../../config/plans";
import { SCAN_MODULE_KEYS, type ScanModuleKey } from "./scan-modules";

export { SCAN_MODULE_KEYS };
export type { ScanModuleKey };

function planAllowsModule(planSlug: string, key: ScanModuleKey): boolean {
  const p = PLANS[planSlug as PlanSlug] || PLANS.free;
  const mods = p.modules as readonly string[];
  if (mods.includes("*")) return true;
  return mods.includes(key);
}

/**
 * Effective modules for a shop:
 * plan entitlements AND admin master visibility AND shop toggle.
 * Free never runs inventory / performance / theme / apps / etc.
 */
export async function getEffectiveScanModules(
  shopId: number,
): Promise<Record<ScanModuleKey, boolean>> {
  const [master, settings, shop] = await Promise.all([
    getModuleVisibility(),
    getOrCreateSettings(shopId),
    db.query.shops.findFirst({ where: eq(shops.id, shopId) }),
  ]);
  const planSlug = shop?.plan || "free";

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
      const planOn = planAllowsModule(planSlug, key);
      const adminOn = master[key as keyof AppModuleVisibility] !== false;
      const shopOn = shopEnabled[key] !== false;
      return [key, planOn && adminOn && shopOn];
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
