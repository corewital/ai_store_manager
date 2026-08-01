import { eq } from "drizzle-orm";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { db } from "../../db/client";
import {
  collectionIssues,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  shops,
  themeIssues,
} from "../../db/schema";
import {
  generateAltText,
  generateCollectionDescriptionHtml,
  generateProductDescriptionHtml,
  generateSeo,
  suggestSku,
} from "../ai/generate-seo.server";
import { fetchProductAiContext } from "../ai/product-context.server";
import { uploadOptimizedProductImage } from "../images/upload-optimized.server";
import { enqueueFix, markFixDone } from "./fix-queue.server";
import {
  formatCaughtErrorAsync,
  isShopifyForbiddenError,
  shouldRethrowResponse,
} from "../../lib/errors.server";
import { assertCanAiFix } from "./plan-gate.server";
import { getShopPlan } from "./billing.server";
import { hasAnyAiKey } from "../ai/ai-router.server";
import { invalidateShopSessions } from "./turso-session-storage.server";

type IssueTable =
  | typeof productIssues
  | typeof seoIssues
  | typeof imageIssues
  | typeof inventoryFlags
  | typeof collectionIssues
  | typeof navigationIssues
  | typeof themeIssues;

const MODULE_TABLES: Record<string, IssueTable> = {
  products: productIssues,
  seo: seoIssues,
  images: imageIssues,
  inventory: inventoryFlags,
  collections: collectionIssues,
  navigation: navigationIssues,
  theme: themeIssues,
};

const SUGGEST_ONLY = new Set(["inventory", "navigation", "theme"]);

async function resolveIssue(table: IssueTable, id: number) {
  await db
    .update(table)
    .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(table.id, id));
}

export async function resolveIssueByModule(module: string, issueId: number) {
  const table = MODULE_TABLES[module];
  if (!table) return;
  await resolveIssue(table, issueId);
}

export type FixResult = {
  ok: boolean;
  error?: string;
  skipMessage?: string;
  preview?: string;
  field?: string;
};

async function assertNoUserErrors(
  json: {
    errors?: { message: string }[];
    data?: Record<
      string,
      {
        userErrors?: { message: string }[];
        mediaUserErrors?: { message: string }[];
      }
    >;
  },
  field: string,
) {
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  const block = json.data?.[field];
  const errs = block?.userErrors || block?.mediaUserErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join("; "));
}

async function wipeSessionsIfForbidden(shopId: number, error: unknown) {
  const forbidden =
    isShopifyForbiddenError(error) ||
    (error instanceof Response && error.status === 403);
  if (!forbidden) return;
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
  });
  if (shop?.shopDomain) {
    await invalidateShopSessions(shop.shopDomain).catch(() => undefined);
  }
}

/** Merchant-supplied value instead of an AI-generated one. */
export async function applyManualFix(
  admin: AdminApiContext,
  shopId: number,
  module: string,
  issueId: number,
  field: string,
  value: string,
): Promise<FixResult> {
  const table = MODULE_TABLES[module];
  if (!table) return { ok: false, error: "unknown_module" };

  const [row] = await db.select().from(table).where(eq(table.id, issueId)).limit(1);
  if (!row) return { ok: false, error: "no_issue" };
  if (!row.resourceId) return { ok: false, error: "no_resource" };

  const job = await enqueueFix({
    shopId,
    module,
    issueId: row.id,
    action: `manual:${field || row.issueCode}`,
  });

  try {
    if (module === "products") {
      if (field === "imageUrl" || field === "image_url") {
        const { attachProductImageFromUrl } = await import("./catalog.server");
        const uploaded = await attachProductImageFromUrl(
          admin,
          row.resourceId,
          value,
          "Product image",
        );
        if (!uploaded.ok) throw new Error(uploaded.error);
      } else if (field === "sku") {
        const variantsRes = await admin.graphql(
          `#graphql
          query ($id: ID!) {
            product(id: $id) {
              variants(first: 50) { nodes { id sku } }
            }
          }`,
          { variables: { id: row.resourceId } },
        );
        const vJson = await variantsRes.json();
        const variants = (vJson.data?.product?.variants?.nodes ?? []) as {
          id: string;
          sku?: string | null;
        }[];
        const toUpdate = variants
          .filter((v) => !v.sku?.trim())
          .map((v, i) => ({
            id: v.id,
            inventoryItem: {
              sku: i === 0 ? value : `${value}-${i + 1}`,
            },
          }));
        if (toUpdate.length) {
          const res = await admin.graphql(
            `#graphql
            mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                userErrors { message field }
              }
            }`,
            {
              variables: {
                productId: row.resourceId,
                variants: toUpdate,
              },
            },
          );
          await assertNoUserErrors(await res.json(), "productVariantsBulkUpdate");
        }
      } else {
        const input =
          field === "title"
            ? { id: row.resourceId, title: value }
            : { id: row.resourceId, descriptionHtml: value };
        const res = await admin.graphql(
          `#graphql
          mutation ($input: ProductInput!) {
            productUpdate(input: $input) { userErrors { message } }
          }`,
          { variables: { input } },
        );
        await assertNoUserErrors(await res.json(), "productUpdate");
      }
    } else if (module === "seo") {
      const seo =
        field === "seoDescription" ? { description: value } : { title: value };
      const res = await admin.graphql(
        `#graphql
        mutation ($input: ProductInput!) {
          productUpdate(input: $input) { userErrors { message } }
        }`,
        { variables: { input: { id: row.resourceId, seo } } },
      );
      await assertNoUserErrors(await res.json(), "productUpdate");
    } else if (module === "collections") {
      const res = await admin.graphql(
        `#graphql
        mutation ($input: CollectionInput!) {
          collectionUpdate(input: $input) { userErrors { message } }
        }`,
        {
          variables: {
            input: { id: row.resourceId, descriptionHtml: value },
          },
        },
      );
      await assertNoUserErrors(await res.json(), "collectionUpdate");
    } else if (module === "images") {
      const details = row.detailsJson ? JSON.parse(row.detailsJson) : {};
      if (!details.productId) throw new Error("missing productId");
      const res = await admin.graphql(
        `#graphql
        mutation ($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            mediaUserErrors { message }
          }
        }`,
        {
          variables: {
            productId: details.productId,
            media: [{ id: row.resourceId, alt: value }],
          },
        },
      );
      await assertNoUserErrors(await res.json(), "productUpdateMedia");
    } else {
      await resolveIssue(table, row.id);
      await markFixDone(job.id);
      return { ok: true };
    }

    await resolveIssue(table, row.id);
    await markFixDone(job.id);
    return { ok: true };
  } catch (error) {
    if (shouldRethrowResponse(error)) throw error;
    await wipeSessionsIfForbidden(shopId, error);
    const msg = await formatCaughtErrorAsync(error);
    await markFixDone(job.id, msg);
    return { ok: false, error: msg.slice(0, 180) || "fix_failed" };
  }
}

/** Generate AI text for an issue without writing to Shopify — merchant reviews then saves. */
export async function previewModuleFix(
  admin: AdminApiContext,
  shopId: number,
  module: string,
  issueId: number,
): Promise<FixResult> {
  const table = MODULE_TABLES[module];
  if (!table) return { ok: false, error: "unknown_module" };
  const [row] = await db.select().from(table).where(eq(table.id, issueId)).limit(1);
  if (!row) return { ok: false, error: "no_issue" };
  if (!row.resourceId) return { ok: false, error: "no_resource" };

  if (module === "products" && row.issueCode === "no_media") {
    return {
      ok: false,
      skipMessage:
        "Upload an image file or paste an image URL, then Save. AI cannot invent product photos.",
    };
  }

  try {
    if (!(await hasAnyAiKey())) {
      return {
        ok: false,
        error: "AI is not configured. Add an API key in Admin → AI providers.",
      };
    }
    const plan = await getShopPlan(shopId);
    await assertCanAiFix(shopId, plan);

    if (module === "products") {
      const ctx = await fetchProductAiContext(admin, row.resourceId);
      if (!ctx) throw new Error("product_not_found");
      if (row.issueCode === "missing_description") {
        const descriptionHtml = await generateProductDescriptionHtml(ctx);
        return { ok: true, preview: descriptionHtml, field: "descriptionHtml" };
      }
      if (row.issueCode === "missing_sku") {
        const sku = suggestSku(ctx);
        return { ok: true, preview: sku, field: "sku" };
      }
    }

    if (module === "seo") {
      const ctx = await fetchProductAiContext(admin, row.resourceId);
      if (!ctx) throw new Error("product_not_found");
      const seo = await generateSeo({
        title: ctx.title,
        description: ctx.descriptionText,
        ctx,
      });
      const preview =
        row.issueCode === "seo_description" ? seo.seoDescription : seo.seoTitle;
      return {
        ok: true,
        preview,
        field: row.issueCode === "seo_description" ? "seoDescription" : "seoTitle",
      };
    }

    if (module === "collections" && row.issueCode === "missing_description") {
      const descriptionHtml = await generateCollectionDescriptionHtml(
        admin,
        row.resourceId,
      );
      return { ok: true, preview: descriptionHtml, field: "descriptionHtml" };
    }

    if (module === "images" && row.issueCode === "missing_alt") {
      const details = row.detailsJson ? JSON.parse(row.detailsJson) : {};
      const result = await generateAltText({
        productTitle: String(details.title || row.title || "Product"),
        context: String(details.url || ""),
      });
      return { ok: true, preview: result.alt, field: "alt" };
    }

    return {
      ok: false,
      skipMessage: "Use Optimize / Save for this issue type, or open in Shopify.",
    };
  } catch (error) {
    if (shouldRethrowResponse(error)) throw error;
    await wipeSessionsIfForbidden(shopId, error);
    return { ok: false, error: await formatCaughtErrorAsync(error) };
  }
}

export async function runModuleFix(
  admin: AdminApiContext,
  shopId: number,
  module: string,
  issueId: number,
  opts?: { existingJobId?: number; queueOnly?: boolean },
): Promise<FixResult> {
  const table = MODULE_TABLES[module];
  if (!table) return { ok: false, error: "unknown_module" };

  const [row] = await db.select().from(table).where(eq(table.id, issueId)).limit(1);
  if (!row) return { ok: false, error: "no_issue" };

  if (opts?.queueOnly) {
    await enqueueFix({
      shopId,
      module,
      issueId: row.id,
      action: row.issueCode,
    });
    return { ok: true };
  }

  // Enforce plan AI-fix limit (except upload-only no_media)
  if (!(module === "products" && row.issueCode === "no_media")) {
    try {
      if (!(await hasAnyAiKey())) {
        return {
          ok: false,
          error: "AI is not configured. Add an API key in Admin → AI providers.",
        };
      }
      const plan = await getShopPlan(shopId);
      await assertCanAiFix(shopId, plan);
    } catch (error) {
      if (shouldRethrowResponse(error)) throw error;
      return { ok: false, error: await formatCaughtErrorAsync(error) };
    }
  }

  const job = opts?.existingJobId
    ? { id: opts.existingJobId }
    : await enqueueFix({
        shopId,
        module,
        issueId: row.id,
        action: row.issueCode,
      });

  try {
    if (SUGGEST_ONLY.has(module)) {
      await resolveIssue(table, row.id);
      await markFixDone(job.id);
      return { ok: true };
    }

    if (module === "products" && row.resourceId) {
      const ctx = await fetchProductAiContext(admin, row.resourceId);
      if (!ctx) throw new Error("product_not_found");

      if (row.issueCode === "missing_description") {
        const descriptionHtml = await generateProductDescriptionHtml(ctx);
        const res = await admin.graphql(
          `#graphql
          mutation ($input: ProductInput!) {
            productUpdate(input: $input) { userErrors { message } }
          }`,
          {
            variables: {
              input: { id: row.resourceId, descriptionHtml },
            },
          },
        );
        await assertNoUserErrors(await res.json(), "productUpdate");
      } else if (row.issueCode === "missing_sku") {
        const variantsRes = await admin.graphql(
          `#graphql
          query ($id: ID!) {
            product(id: $id) {
              variants(first: 50) { nodes { id title sku } }
            }
          }`,
          { variables: { id: row.resourceId } },
        );
        const vJson = await variantsRes.json();
        const variants = (vJson.data?.product?.variants?.nodes ?? []) as {
          id: string;
          title?: string;
          sku?: string | null;
        }[];
        const toUpdate = variants
          .filter((v) => !v.sku?.trim())
          .map((v) => ({
            id: v.id,
            inventoryItem: { sku: suggestSku(ctx, v.title) },
          }));
        if (toUpdate.length === 0) {
          // already fixed
        } else {
          const res = await admin.graphql(
            `#graphql
            mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                userErrors { message field }
              }
            }`,
            {
              variables: {
                productId: row.resourceId,
                variants: toUpdate,
              },
            },
          );
          await assertNoUserErrors(await res.json(), "productVariantsBulkUpdate");
        }
      } else if (row.issueCode === "no_media") {
        await markFixDone(job.id, "upload_required");
        return {
          ok: false,
          skipMessage:
            "Add an image URL in the detail panel (or upload in Shopify Admin). AI does not generate photos.",
        };
      }
    } else if (module === "collections" && row.resourceId) {
      if (row.issueCode === "missing_description") {
        const descriptionHtml = await generateCollectionDescriptionHtml(
          admin,
          row.resourceId,
        );
        const res = await admin.graphql(
          `#graphql
          mutation ($input: CollectionInput!) {
            collectionUpdate(input: $input) { userErrors { message } }
          }`,
          {
            variables: {
              input: { id: row.resourceId, descriptionHtml },
            },
          },
        );
        await assertNoUserErrors(await res.json(), "collectionUpdate");
      } else {
        await markFixDone(job.id, "collection_issue_manual");
        return {
          ok: false,
          skipMessage: "This collection issue needs a merchant review in Shopify Admin.",
        };
      }
    } else if (module === "seo" && row.resourceId) {
      const ctx = await fetchProductAiContext(admin, row.resourceId);
      if (!ctx) throw new Error("product_not_found");
      const seo = await generateSeo({
        title: ctx.title,
        description: ctx.descriptionText,
        ctx,
      });
      // Only update the weak field when issue is field-specific; else both
      const seoInput =
        row.issueCode === "seo_title"
          ? { title: seo.seoTitle, description: ctx.seoDescription || seo.seoDescription }
          : row.issueCode === "seo_description"
            ? { title: ctx.seoTitle || seo.seoTitle, description: seo.seoDescription }
            : { title: seo.seoTitle, description: seo.seoDescription };

      const res = await admin.graphql(
        `#graphql
        mutation ($input: ProductInput!) {
          productUpdate(input: $input) { userErrors { message } }
        }`,
        {
          variables: {
            input: { id: row.resourceId, seo: seoInput },
          },
        },
      );
      await assertNoUserErrors(await res.json(), "productUpdate");
    } else if (module === "images") {
      if (row.issueCode === "missing_alt" && row.resourceId) {
        const details = row.detailsJson ? JSON.parse(row.detailsJson) : {};
        if (!details.productId) throw new Error("missing productId");
        const ctx = await fetchProductAiContext(admin, String(details.productId));
        const { alt } = await generateAltText({
          productTitle: ctx?.title || row.title,
          context: details.url ? `image url: ${details.url}` : undefined,
          ctx,
        });
        const safeAlt = alt.slice(0, 125);
        const res = await admin.graphql(
          `#graphql
          mutation ($productId: ID!, $media: [UpdateMediaInput!]!) {
            productUpdateMedia(productId: $productId, media: $media) {
              mediaUserErrors { message }
            }
          }`,
          {
            variables: {
              productId: details.productId,
              media: [{ id: row.resourceId, alt: safeAlt }],
            },
          },
        );
        await assertNoUserErrors(await res.json(), "productUpdateMedia");
      } else if (row.issueCode === "oversized") {
        const details = row.detailsJson ? JSON.parse(row.detailsJson) : {};
        if (!details.url || !details.productId) {
          await markFixDone(job.id, "missing image url/productId");
          return {
            ok: false,
            skipMessage: "Missing image URL or product — cannot optimize.",
          };
        }
        // Sharp only — no AI API
        const uploaded = await uploadOptimizedProductImage(
          admin,
          String(details.productId),
          String(details.url),
          ctxTitleFromRow(row.title),
        );
        if (!uploaded.ok) throw new Error(uploaded.error);
      }
    }

    await resolveIssue(table, row.id);
    await markFixDone(job.id);
    return { ok: true };
  } catch (error) {
    if (shouldRethrowResponse(error)) throw error;
    await wipeSessionsIfForbidden(shopId, error);
    const msg = await formatCaughtErrorAsync(error);
    await markFixDone(job.id, msg);
    return { ok: false, error: msg.slice(0, 180) || "fix_failed" };
  }
}

function ctxTitleFromRow(title: string) {
  return title.replace(/^Missing alt text — /, "").replace(/^Oversized image — /, "").slice(0, 80);
}
