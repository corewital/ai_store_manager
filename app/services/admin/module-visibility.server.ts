import { getSetting, setSetting } from "./settings.server";
import {
  DEFAULT_MODULE_VISIBILITY,
  type AppModuleVisibility,
} from "./module-visibility";

export type { AppModuleVisibility } from "./module-visibility";
export {
  DEFAULT_MODULE_VISIBILITY,
  MODULE_VISIBILITY_LABELS,
} from "./module-visibility";

export async function getModuleVisibility(): Promise<AppModuleVisibility> {
  const saved = await getSetting<Partial<AppModuleVisibility>>(
    "app_module_visibility",
    {},
  );
  return { ...DEFAULT_MODULE_VISIBILITY, ...saved };
}

export async function setModuleVisibility(next: AppModuleVisibility) {
  await setSetting(
    "app_module_visibility",
    next,
    "Master show/hide for merchant app modules",
  );
}

export function isModuleVisible(
  vis: AppModuleVisibility,
  key: keyof AppModuleVisibility,
) {
  return vis[key] !== false;
}
