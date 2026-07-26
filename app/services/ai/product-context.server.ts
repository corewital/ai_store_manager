import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export type ProductAiContext = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  descriptionHtml: string;
  descriptionText: string;
  seoTitle: string;
  seoDescription: string;
  skus: string[];
  prices: string[];
  variantTitles: string[];
};

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Live Shopify product facts for AI prompts (never use issue-title fluff). */
export async function fetchProductAiContext(
  admin: AdminApiContext,
  productGid: string,
): Promise<ProductAiContext | null> {
  const res = await admin.graphql(
    `#graphql
    query ProductAiContext($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        vendor
        productType
        tags
        status
        descriptionHtml
        seo { title description }
        variants(first: 50) {
          nodes { title sku price }
        }
      }
    }`,
    { variables: { id: productGid } },
  );
  const json = await res.json();
  const p = json.data?.product;
  if (!p) return null;

  const variants = (p.variants?.nodes ?? []) as {
    title?: string;
    sku?: string | null;
    price?: string;
  }[];

  const descriptionHtml = String(p.descriptionHtml || "");
  return {
    id: p.id,
    title: String(p.title || "").trim(),
    handle: String(p.handle || ""),
    vendor: String(p.vendor || "").trim(),
    productType: String(p.productType || "").trim(),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    status: String(p.status || ""),
    descriptionHtml,
    descriptionText: stripHtml(descriptionHtml),
    seoTitle: String(p.seo?.title || "").trim(),
    seoDescription: String(p.seo?.description || "").trim(),
    skus: variants.map((v) => v.sku).filter((s): s is string => Boolean(s?.trim())),
    prices: variants.map((v) => v.price).filter(Boolean) as string[],
    variantTitles: variants
      .map((v) => v.title)
      .filter((t): t is string => Boolean(t && t !== "Default Title")),
  };
}

export function contextPromptBlock(ctx: ProductAiContext) {
  return [
    `Product title: ${ctx.title}`,
    ctx.vendor ? `Vendor/brand: ${ctx.vendor}` : null,
    ctx.productType ? `Product type: ${ctx.productType}` : null,
    ctx.tags.length ? `Tags: ${ctx.tags.slice(0, 12).join(", ")}` : null,
    ctx.skus.length ? `SKUs: ${ctx.skus.slice(0, 10).join(", ")}` : null,
    ctx.prices.length ? `Prices: ${ctx.prices.slice(0, 5).join(", ")}` : null,
    ctx.variantTitles.length
      ? `Variants: ${ctx.variantTitles.slice(0, 12).join(", ")}`
      : null,
    ctx.descriptionText
      ? `Existing description text: ${ctx.descriptionText.slice(0, 600)}`
      : "Existing description: (empty)",
    ctx.seoTitle ? `Current SEO title: ${ctx.seoTitle}` : null,
    ctx.seoDescription ? `Current SEO description: ${ctx.seoDescription}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
