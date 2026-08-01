/** Strip tags/entities for description length checks (not HTML byte length). */
export function plainTextFromHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when HTML has no usable merchant-facing text (or too short). */
export function isShortOrMissingDescription(
  html?: string | null,
  minPlainChars = 20,
): boolean {
  const text = plainTextFromHtml(html);
  return text.length < minPlainChars;
}

/** SEO meta title — Shopify search listing title (plain text). */
export function isShortOrMissingSeoTitle(
  title?: string | null,
  minChars = 10,
): boolean {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  return text.length < minChars;
}

/** SEO meta description — Shopify search listing description (plain text). */
export function isShortOrMissingSeoDescription(
  description?: string | null,
  minChars = 50,
): boolean {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  return text.length < minChars;
}
