import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { optimizeImage } from "../images/optimize.server";

/**
 * Internal sharp optimize → staged upload → attach as product media.
 * No AI / Gemini calls.
 */
export async function uploadOptimizedProductImage(
  admin: AdminApiContext,
  productId: string,
  sourceUrl: string,
  alt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(sourceUrl);
  if (!res.ok) return { ok: false, error: `fetch_failed_${res.status}` };

  const optimized = await optimizeImage(Buffer.from(await res.arrayBuffer()), {
    maxWidth: 1600,
    quality: 78,
  });

  const filename = `opt-${Date.now()}.webp`;
  const staged = await admin.graphql(
    `#graphql
    mutation ($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { message }
      }
    }`,
    {
      variables: {
        input: [
          {
            resource: "IMAGE",
            filename,
            mimeType: "image/webp",
            httpMethod: "POST",
            fileSize: String(optimized.buffer.length),
          },
        ],
      },
    },
  );
  const stagedJson = await staged.json();
  const errs = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
  if (errs.length) {
    return { ok: false, error: errs.map((e: { message: string }) => e.message).join("; ") };
  }
  const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url) return { ok: false, error: "no_staged_target" };

  const form = new FormData();
  for (const p of target.parameters ?? []) {
    form.append(p.name, p.value);
  }
  form.append(
    "file",
    new Blob([new Uint8Array(optimized.buffer)], { type: "image/webp" }),
    filename,
  );
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) return { ok: false, error: `staged_upload_${upload.status}` };

  const media = await admin.graphql(
    `#graphql
    mutation ($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id status }
        mediaUserErrors { message }
      }
    }`,
    {
      variables: {
        productId,
        media: [
          {
            originalSource: target.resourceUrl,
            alt: (alt || "").slice(0, 125),
            mediaContentType: "IMAGE",
          },
        ],
      },
    },
  );
  const mediaJson = await media.json();
  const mErrs = mediaJson.data?.productCreateMedia?.mediaUserErrors ?? [];
  if (mErrs.length) {
    return { ok: false, error: mErrs.map((e: { message: string }) => e.message).join("; ") };
  }
  return { ok: true };
}
