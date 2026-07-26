import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { performanceSnapshots, shops } from "../../db/schema";

export type AssetRow = {
  url: string;
  type: "image" | "js" | "css" | "font";
  sizeKb: number;
};

export type PageMetrics = {
  pageType: string;
  url: string;
  htmlKb: number;
  imageKb: number;
  jsKb: number;
  cssKb: number;
  fontKb: number;
  totalKb: number;
  requestCount: number;
  thirdPartyCount: number;
  speedScore: number;
};

export type PerformanceMetrics = {
  speedScore: number;
  pages: PageMetrics[];
  largestAssets: AssetRow[];
};

const ASSET_RE = /(?:src|href)=["']([^"']+\.(?:js|css|png|jpe?g|webp|gif|svg|woff2?|ttf))(?:\?[^"']*)?["']/gi;

function classify(url: string): AssetRow["type"] | null {
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|svg)$/.test(clean)) return "image";
  if (clean.endsWith(".js")) return "js";
  if (clean.endsWith(".css")) return "css";
  if (/\.(woff2?|ttf)$/.test(clean)) return "font";
  return null;
}

async function headSizeKb(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    const len = res.headers.get("content-length");
    return len ? Math.round(Number(len) / 1024) : 0;
  } catch {
    return 0;
  }
}

/** Payload-weight based score: 100 at <=500KB, 0 at >=6MB, plus request penalty. */
function scoreFor(totalKb: number, requestCount: number) {
  const weight = Math.max(0, 100 - ((totalKb - 500) / 5500) * 100);
  const penalty = Math.min(20, Math.max(0, (requestCount - 40) / 4));
  return Math.max(0, Math.min(100, Math.round(weight - penalty)));
}

async function scanPage(
  base: string,
  path: string,
  pageType: string,
): Promise<{ metrics: PageMetrics; assets: AssetRow[] } | null> {
  const url = `${base}${path}`;
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "AIStoreManager/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const htmlKb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  ASSET_RE.lastIndex = 0;
  while ((match = ASSET_RE.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith("//")) href = `https:${href}`;
    else if (href.startsWith("/")) href = `${base}${href}`;
    else if (!href.startsWith("http")) continue;
    found.add(href);
  }

  const urls = [...found].slice(0, 40);
  const assets: AssetRow[] = [];
  const sizes = await Promise.all(urls.map((u) => headSizeKb(u)));
  urls.forEach((u, i) => {
    const type = classify(u);
    if (type) assets.push({ url: u, type, sizeKb: sizes[i] });
  });

  const sum = (t: AssetRow["type"]) =>
    assets.filter((a) => a.type === t).reduce((n, a) => n + a.sizeKb, 0);

  const host = new URL(base).host;
  const thirdPartyCount = assets.filter((a) => {
    try {
      return new URL(a.url).host !== host;
    } catch {
      return false;
    }
  }).length;

  const imageKb = sum("image");
  const jsKb = sum("js");
  const cssKb = sum("css");
  const fontKb = sum("font");
  const totalKb = htmlKb + imageKb + jsKb + cssKb + fontKb;
  const requestCount = assets.length + 1;

  return {
    metrics: {
      pageType,
      url,
      htmlKb,
      imageKb,
      jsKb,
      cssKb,
      fontKb,
      totalKb,
      requestCount,
      thirdPartyCount,
      speedScore: scoreFor(totalKb, requestCount),
    },
    assets,
  };
}

function buildSuggestions(m: PerformanceMetrics): string[] {
  const out: string[] = [];
  const heavyImages = m.largestAssets.filter(
    (a) => a.type === "image" && a.sizeKb > 200,
  );
  if (heavyImages.length) {
    out.push(
      `Compress ${heavyImages.length} image${heavyImages.length > 1 ? "s" : ""} over 200 KB — run the Image Auditor fix.`,
    );
  }
  const nonWebp = m.largestAssets.filter(
    (a) => a.type === "image" && /\.(png|jpe?g)(\?|$)/i.test(a.url),
  );
  if (nonWebp.length) {
    out.push(`Convert ${nonWebp.length} PNG/JPEG images to WebP.`);
  }
  const jsTotal = m.pages.reduce((n, p) => n + p.jsKb, 0);
  if (jsTotal > 500) {
    out.push(`JavaScript payload is ${jsTotal} KB — review unused app scripts.`);
  }
  const cssTotal = m.pages.reduce((n, p) => n + p.cssKb, 0);
  if (cssTotal > 200) out.push(`CSS payload is ${cssTotal} KB — remove unused rules.`);
  const thirdParty = m.pages.reduce((n, p) => n + p.thirdPartyCount, 0);
  if (thirdParty > 10) {
    out.push(`${thirdParty} third-party requests detected — audit installed apps.`);
  }
  if (!out.length) out.push("No major performance issues detected.");
  return out;
}

/** Module 10 — synthetic page-weight scan of the live storefront. */
export async function scanPerformance(shopId: number, admin: AdminApiContext) {
  const shop = await db.query.shops.findFirst({ where: eq(shops.id, shopId) });
  if (!shop) return null;
  const base = `https://${shop.shopDomain}`;

  let productHandle: string | null = null;
  let collectionHandle: string | null = null;
  try {
    const res = await admin.graphql(`#graphql
      query PerfTargets {
        products(first: 1, sortKey: UPDATED_AT, reverse: true) { nodes { handle } }
        collections(first: 1) { nodes { handle } }
      }`);
    const json = await res.json();
    productHandle = json.data?.products?.nodes?.[0]?.handle ?? null;
    collectionHandle = json.data?.collections?.nodes?.[0]?.handle ?? null;
  } catch {
    /* fall back to home page only */
  }

  const targets: [string, string][] = [["/", "homepage"]];
  if (collectionHandle) {
    targets.push([`/collections/${collectionHandle}`, "collection"]);
  }
  if (productHandle) targets.push([`/products/${productHandle}`, "product"]);

  const results = await Promise.all(
    targets.map(([path, type]) => scanPage(base, path, type)),
  );
  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);

  const pages = ok.map((r) => r.metrics);
  const allAssets = ok.flatMap((r) => r.assets);
  const largestAssets = [...allAssets]
    .sort((a, b) => b.sizeKb - a.sizeKb)
    .slice(0, 10);

  const speedScore = pages.length
    ? Math.round(pages.reduce((n, p) => n + p.speedScore, 0) / pages.length)
    : 0;

  const metrics: PerformanceMetrics = { speedScore, pages, largestAssets };
  const suggestions = buildSuggestions(metrics);

  try {
    await db.insert(performanceSnapshots).values({
      shopId,
      metricsJson: JSON.stringify(metrics),
      suggestionsJson: JSON.stringify(suggestions),
      scannedAt: new Date(),
    });
  } catch {
    /* best-effort */
  }

  return metrics;
}
