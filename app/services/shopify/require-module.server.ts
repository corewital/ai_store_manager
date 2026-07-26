import { redirect } from "@remix-run/node";
import {
  getModuleVisibility,
  type AppModuleVisibility,
} from "../admin/module-visibility.server";

export async function requireAppModule(key: keyof AppModuleVisibility) {
  const modules = await getModuleVisibility();
  if (modules[key] === false) throw redirect("/app");
  return modules;
}
