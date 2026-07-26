import {
  setModuleVisibility,
  DEFAULT_MODULE_VISIBILITY,
} from "../app/services/admin/module-visibility.server";

async function main() {
  await setModuleVisibility(DEFAULT_MODULE_VISIBILITY);
  console.log("module visibility seeded (nav/theme/apps hidden)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
