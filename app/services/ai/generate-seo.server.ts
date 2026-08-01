import { generateJson, generateText } from "./gemini-client.server";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import {
  contextPromptBlock,
  type ProductAiContext,
} from "./product-context.server";

const GENERIC_BAD =
  /introducing our|premium quality product|must-have item|elevate your experience|missing or short description|template|lorem ipsum|designed to meet your needs|perfect addition to your collection|seamless(?:ly)? integrates into your lifestyle/i;

function clamp(s: string, max: number) {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/** Allow only safe product HTML tags. */
export function sanitizeProductHtml(raw: string): string {
  let html = raw.trim();
  html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "");
  html = html.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/\son\w+="[^"]*"/gi, "");
  // Prefer <p> blocks; wrap plain text
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    const parts = html.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    html = parts.map((p) => `<p>${p}</p>`).join("");
  }
  // Strip disallowed tags (keep p, br, ul, ol, li, strong, b, em, i)
  html = html.replace(/<\/?(?!p|br|ul|ol|li|strong|b|em|i)([a-z0-9]+)[^>]*>/gi, "");
  return html.trim();
}

export function assertUsefulCopy(text: string, productTitle: string, minLen = 40) {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length < minLen) throw new Error("AI copy too short");
  if (GENERIC_BAD.test(plain)) throw new Error("AI returned generic/template copy");
  void productTitle;
  return plain;
}

export async function generateProductDescriptionHtml(
  ctx: ProductAiContext,
): Promise<string> {
  const prompt = `You are an expert ecommerce copywriter for a Shopify store.
Write a product DESCRIPTION in HTML using ONLY the product facts below.
Return ONLY HTML — two <p> paragraphs. Optional one <ul><li>…</li></ul> for 3 concrete benefits if facts support it.

HARD RULES:
- Use the real product title and facts. Never invent materials, warranties, or features not implied by the facts.
- NEVER write generic filler ("Introducing our premium…", "elevate your experience", "perfect addition to your collection").
- NEVER mention "missing description", templates, SEO issues, or that you are an AI.
- Do not include <html>, <body>, markdown fences, or headings.
- Keep total plain text roughly 80–180 words.
- Tone: clear, factual, conversion-focused.

PRODUCT FACTS:
${contextPromptBlock(ctx)}`;

  const raw = await generateText(prompt);
  const html = sanitizeProductHtml(raw);
  assertUsefulCopy(html, ctx.title);
  if (!html.includes("<p")) {
    return `<p>${assertUsefulCopy(html, ctx.title)}</p>`;
  }
  return html;
}

export async function generateSeo(
  input: {
    title: string;
    description?: string | null;
    tone?: string;
    ctx?: ProductAiContext | null;
  },
  _apiKey?: string | null,
) {
  const facts = input.ctx
    ? contextPromptBlock(input.ctx)
    : `Product title: ${input.title}\nCurrent description: ${input.description ?? ""}`;

  const raw = await generateJson<{ seoTitle: string; seoDescription: string }>(
    `You write Shopify product SEO. Return JSON only:
{"seoTitle":"...","seoDescription":"..."}

HARD LIMITS:
- seoTitle: 30–60 characters (hard max 60). Include the product name. No keyword stuffing.
- seoDescription: 120–155 characters (hard max 155). One clear benefit + product name. No hype spam.
- Never use generic phrases like "premium quality product" or "shop now!!".
- Never mention missing SEO / templates / AI.

PRODUCT FACTS:
${facts}`,
  );

  const seoTitle = clamp(String(raw.seoTitle || input.title), 60);
  const seoDescription = clamp(
    String(raw.seoDescription || input.description || input.title),
    155,
  );
  assertUsefulCopy(seoTitle, input.title, 12);
  assertUsefulCopy(seoDescription, input.title, 50);
  return { seoTitle, seoDescription };
}

export async function generateAltText(
  input: {
    productTitle: string;
    context?: string;
    ctx?: ProductAiContext | null;
  },
  _apiKey?: string | null,
) {
  const facts = input.ctx
    ? contextPromptBlock(input.ctx)
    : `Product: ${input.productTitle}\nContext: ${input.context ?? ""}`;

  const raw = await generateJson<{ alt: string }>(
    `Write image alt text for accessibility/SEO. Return JSON only: {"alt":"..."}
Rules: <= 125 chars, factual, include product name, no "image of"/"picture of", no spam.

PRODUCT FACTS:
${facts}
Extra context: ${input.context ?? ""}`,
  );
  const alt = clamp(String(raw.alt || input.productTitle), 125);
  return { alt };
}

/** Simple deterministic SKU when missing — not random AI junk. */
export function suggestSku(ctx: ProductAiContext, variantTitle?: string): string {
  const base = (ctx.handle || ctx.title)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 16);
  const v = (variantTitle || "MAIN")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return `${base || "SKU"}-${v || "1"}`;
}

export async function generateCollectionDescriptionHtml(
  admin: AdminApiContext,
  collectionGid: string,
): Promise<string> {
  const res = await admin.graphql(
    `#graphql
    query ($id: ID!) {
      collection(id: $id) {
        id title handle descriptionHtml
        products(first: 8) { nodes { title } }
      }
    }`,
    { variables: { id: collectionGid } },
  );
  const json = await res.json();
  const c = json.data?.collection;
  if (!c) throw new Error("collection_not_found");
  const titles = (c.products?.nodes ?? [])
    .map((n: { title?: string }) => n.title)
    .filter(Boolean)
    .slice(0, 8);
  const prompt = `Write a Shopify collection description in HTML (1–2 <p> tags only).
Use ONLY these facts. No generic filler. No "Introducing our…". No AI/template language.
Collection title: ${c.title}
Handle: ${c.handle || ""}
Sample products: ${titles.join(", ") || "(none listed)"}
Existing text: ${(String(c.descriptionHtml || "").replace(/<[^>]+>/g, " ").trim() || "(empty)").slice(0, 400)}
Return HTML only.`;
  const raw = await generateText(prompt);
  const html = sanitizeProductHtml(raw);
  assertUsefulCopy(html, String(c.title), 40);
  return html.includes("<p") ? html : `<p>${html}</p>`;
}

/** Collection page meta title + meta description for search listings. */
export async function generateCollectionSeo(
  admin: AdminApiContext,
  collectionGid: string,
): Promise<{ seoTitle: string; seoDescription: string }> {
  const res = await admin.graphql(
    `#graphql
    query ($id: ID!) {
      collection(id: $id) {
        id title handle descriptionHtml
        seo { title description }
        products(first: 8) { nodes { title } }
      }
    }`,
    { variables: { id: collectionGid } },
  );
  const json = await res.json();
  const c = json.data?.collection;
  if (!c) throw new Error("collection_not_found");
  const titles = (c.products?.nodes ?? [])
    .map((n: { title?: string }) => n.title)
    .filter(Boolean)
    .slice(0, 8);
  const body = String(c.descriptionHtml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
  const raw = await generateJson<{ seoTitle: string; seoDescription: string }>(
    `Return ONLY valid JSON:
{"seoTitle":"...","seoDescription":"..."}
Rules:
- seoTitle: 30–60 characters (hard max 60). Include the collection name. No keyword stuffing.
- seoDescription: 120–155 characters (hard max 160). Clear benefit for shoppers. No hype.
Facts only:
Collection: ${c.title}
Handle: ${c.handle || ""}
Sample products: ${titles.join(", ") || "(none)"}
Body excerpt: ${body || "(empty)"}
Current SEO title: ${c.seo?.title || "(empty)"}
Current SEO description: ${c.seo?.description || "(empty)"}`,
  );
  const seoTitle = clamp(String(raw.seoTitle || c.title), 60);
  const seoDescription = clamp(
    String(raw.seoDescription || `${c.title} collection`),
    160,
  );
  assertUsefulCopy(seoTitle, String(c.title), 8);
  return { seoTitle, seoDescription };
}
