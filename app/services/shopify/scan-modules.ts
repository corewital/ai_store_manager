/** Shared (client + server) — no DB imports. */

/** Scan/UI module keys that map 1:1 to health modules. */
export const SCAN_MODULE_KEYS = [
  "products",
  "seo",
  "images",
  "inventory",
  "collections",
  "navigation",
  "theme",
  "apps",
  "performance",
] as const;

export type ScanModuleKey = (typeof SCAN_MODULE_KEYS)[number];
