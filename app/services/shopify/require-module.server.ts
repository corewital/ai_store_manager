import { redirect } from "@remix-run/node";
import {
  getModuleVisibility,
  type AppModuleVisibility,
} from "../admin/module-visibility.server";
import { isPlanFeatureEnabled } from "./plan-gate.server";
import { getShopPlan } from "./billing.server";

const PLAN_MODULE_KEYS: Partial<Record<keyof AppModuleVisibility, string>> = {
  inventory: "module_inventory",
  performance: "module_performance",
  assistant: "module_assistant",
  reports: "module_reports",
  products: "module_products",
  seo: "module_seo",
  images: "module_images",
  collections: "module_collections",
};

export async function requireAppModule(
  key: keyof AppModuleVisibility,
  shopId?: number,
) {
  const modules = await getModuleVisibility();
  if (modules[key] === false) throw redirect("/app");

  if (shopId != null && PLAN_MODULE_KEYS[key]) {
    const plan = await getShopPlan(shopId);
    const ok = await isPlanFeatureEnabled(plan, PLAN_MODULE_KEYS[key]!);
    if (!ok) throw redirect(`/app/settings/billing?need=${key}`);
  }
  return modules;
}
