import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { rateLimit } from "../services/shopify/rate-limit.server";
import { formatCaughtErrorAsync, shouldRethrowResponse } from "../lib/errors.server";

/** Stage a merchant-uploaded image to Shopify; return public resource URL for preview/save. */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  try {
    const { session, admin } = await authenticate.admin(request);
    const limited = rateLimit(`upload:${session.shop}`, 30, 60_000);
    if (!limited.ok) {
      return json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return json({ ok: false, error: "no_file" }, { status: 400 });
    }
    if (file.size > 8_000_000) {
      return json({ ok: false, error: "File too large (max 8MB)" }, { status: 400 });
    }
    const mime = file.type || "image/jpeg";
    if (!mime.startsWith("image/")) {
      return json({ ok: false, error: "Only image files are allowed" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const filename = (file.name || `upload-${Date.now()}.jpg`).replace(/[^\w.-]/g, "_");

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
              mimeType: mime,
              httpMethod: "POST",
              fileSize: String(buf.length),
            },
          ],
        },
      },
    );
    const stagedJson = await staged.json();
    const errs = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
    if (errs.length) {
      return json(
        { ok: false, error: errs.map((e: { message: string }) => e.message).join("; ") },
        { status: 422 },
      );
    }
    const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target?.url || !target?.resourceUrl) {
      return json({ ok: false, error: "no_staged_target" }, { status: 422 });
    }

    const uploadForm = new FormData();
    for (const p of target.parameters ?? []) {
      uploadForm.append(p.name, p.value);
    }
    uploadForm.append("file", new Blob([buf], { type: mime }), filename);
    const upload = await fetch(target.url, { method: "POST", body: uploadForm });
    if (!upload.ok) {
      return json({ ok: false, error: `Upload failed (${upload.status})` }, { status: 422 });
    }

    return json({
      ok: true,
      url: String(target.resourceUrl),
      previewUrl: String(target.resourceUrl),
    });
  } catch (error) {
    if (shouldRethrowResponse(error)) throw error;
    return json({ ok: false, error: await formatCaughtErrorAsync(error) }, { status: 422 });
  }
};
