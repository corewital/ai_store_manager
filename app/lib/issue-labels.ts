/** Human-readable issue labels for merchant UI */
const LABELS: Record<string, string> = {
  no_media: "Product has no image",
  missing_description: "Missing or short description",
  missing_sku: "Missing SKU",
  missing_alt: "Missing image alt text",
  oversized: "Oversized image",
  seo_title: "Missing or short SEO title",
  seo_description: "Missing or short SEO description",
  empty_collection: "Empty collection",
  broken_link: "Broken navigation link",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  order_movement: "Stock moved by order",
};

export function issueLabel(code?: string | null, fallbackTitle?: string | null) {
  if (!code) return fallbackTitle || "Issue";
  return LABELS[code] || fallbackTitle || code.replace(/_/g, " ");
}

export function severityLabel(severity?: string | null) {
  if (severity === "high" || severity === "critical") return "High";
  if (severity === "low") return "Low";
  return "Medium";
}
