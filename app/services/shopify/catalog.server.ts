import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export async function getCatalogCounts(admin: AdminApiContext) {
  try {
    const res = await admin.graphql(
      `#graphql
      query CatalogCounts {
        productsCount { count }
        collectionsCount { count }
      }`,
    );
    const json = await res.json();
    return {
      products: Number(json.data?.productsCount?.count ?? 0),
      collections: Number(json.data?.collectionsCount?.count ?? 0),
    };
  } catch {
    return { products: 0, collections: 0 };
  }
}

/** Attach a remote image URL to a product (no AI). */
export async function attachProductImageFromUrl(
  admin: AdminApiContext,
  productId: string,
  imageUrl: string,
  alt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = imageUrl.trim();
  if (!/^https?:\/\//i.test(url) && !/^shopify:\/\//i.test(url)) {
    return { ok: false, error: "Image URL must start with http:// or https://" };
  }

  const res = await admin.graphql(
    `#graphql
    mutation ($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media { id status }
        mediaUserErrors { message code }
      }
    }`,
    {
      variables: {
        productId,
        media: [
          {
            originalSource: url,
            alt: (alt || "").slice(0, 125),
            mediaContentType: "IMAGE",
          },
        ],
      },
    },
  );
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      productCreateMedia?: {
        mediaUserErrors?: { message: string }[];
      };
    };
  };
  if (json.errors?.length) {
    return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }
  const errs = json.data?.productCreateMedia?.mediaUserErrors ?? [];
  if (errs.length) {
    return { ok: false, error: errs.map((e) => e.message).join("; ") };
  }
  return { ok: true };
}

type FileNode = {
  id?: string;
  fileStatus?: string;
  image?: { url?: string | null } | null;
};

async function createShopifyFileFromSource(
  admin: AdminApiContext,
  sourceUrl: string,
  alt: string,
): Promise<{ ok: true; fileId: string; url: string | null } | { ok: false; error: string }> {
  const create = await admin.graphql(
    `#graphql
    mutation ($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on MediaImage {
            image { url }
          }
        }
        userErrors { message field code }
      }
    }`,
    {
      variables: {
        files: [
          {
            originalSource: sourceUrl,
            contentType: "IMAGE",
            alt: alt.slice(0, 125),
          },
        ],
      },
    },
  );
  const createJson = (await create.json()) as {
    errors?: { message: string }[];
    data?: {
      fileCreate?: {
        files?: FileNode[];
        userErrors?: { message: string }[];
      };
    };
  };
  if (createJson.errors?.length) {
    return { ok: false, error: createJson.errors.map((e) => e.message).join("; ") };
  }
  const cErrs = createJson.data?.fileCreate?.userErrors ?? [];
  if (cErrs.length) {
    return { ok: false, error: cErrs.map((e) => e.message).join("; ") };
  }
  const file = createJson.data?.fileCreate?.files?.[0];
  if (!file?.id) {
    return { ok: false, error: "Shopify did not create the image file" };
  }

  // Wait briefly for processing (staged → READY)
  let ready = file;
  for (let i = 0; i < 8; i++) {
    const status = String(ready.fileStatus || "").toUpperCase();
    if (status === "READY" || ready.image?.url) break;
    if (status === "FAILED") {
      return { ok: false, error: "Shopify failed to process the image" };
    }
    await new Promise((r) => setTimeout(r, 500));
    const poll = await admin.graphql(
      `#graphql
      query ($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            fileStatus
            image { url }
          }
        }
      }`,
      { variables: { id: file.id } },
    );
    const pollJson = await poll.json();
    ready = (pollJson.data?.node as FileNode) || ready;
  }

  return {
    ok: true,
    fileId: file.id,
    url: ready.image?.url || null,
  };
}

/**
 * Set / replace a collection featured image.
 * Supports public https URLs and Shopify staged-upload resource URLs
 * (same flow as product image upload in the app).
 */
export async function attachCollectionImageFromUrl(
  admin: AdminApiContext,
  collectionId: string,
  imageUrl: string,
  alt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = imageUrl.trim();
  if (!url) {
    return { ok: false, error: "Paste an image URL or upload a file first" };
  }

  const altText = (alt || "Collection image").slice(0, 125);
  const isPublicHttp = /^https?:\/\//i.test(url);
  const isStaged =
    /shopify-staged-uploads/i.test(url) ||
    /^shopify:\/\//i.test(url) ||
    /storage\.googleapis\.com/i.test(url);

  // Prefer fileCreate for staged / Shopify temp URLs; direct src for normal CDNs
  let imageInput: { id?: string; src?: string; altText: string };

  if (!isPublicHttp && !isStaged) {
    return { ok: false, error: "Image URL must start with http:// or https://" };
  }

  if (isStaged || !isPublicHttp) {
    const created = await createShopifyFileFromSource(admin, url, altText);
    if (!created.ok) return created;
    imageInput = created.url
      ? { src: created.url, altText }
      : { id: created.fileId, altText };
  } else {
    // Try direct src first (fast path for cdn / public URLs)
    imageInput = { src: url, altText };
  }

  const res = await admin.graphql(
    `#graphql
    mutation ($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id image { url } }
        userErrors { message field }
      }
    }`,
    {
      variables: {
        input: {
          id: collectionId,
          image: imageInput,
        },
      },
    },
  );
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      collectionUpdate?: {
        collection?: { image?: { url?: string | null } | null };
        userErrors?: { message: string }[];
      };
    };
  };
  if (json.errors?.length) {
    return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }
  let errs = json.data?.collectionUpdate?.userErrors ?? [];

  // Fallback: public URL failed download → create File then attach by id
  if (errs.length && isPublicHttp && imageInput.src && !imageInput.id) {
    const created = await createShopifyFileFromSource(admin, url, altText);
    if (!created.ok) return created;
    const retry = await admin.graphql(
      `#graphql
      mutation ($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id image { url } }
          userErrors { message field }
        }
      }`,
      {
        variables: {
          input: {
            id: collectionId,
            image: created.url
              ? { src: created.url, altText }
              : { id: created.fileId, altText },
          },
        },
      },
    );
    const retryJson = (await retry.json()) as typeof json;
    if (retryJson.errors?.length) {
      return { ok: false, error: retryJson.errors.map((e) => e.message).join("; ") };
    }
    errs = retryJson.data?.collectionUpdate?.userErrors ?? [];
    if (errs.length) {
      return { ok: false, error: errs.map((e) => e.message).join("; ") };
    }
    return { ok: true };
  }

  if (errs.length) {
    return { ok: false, error: errs.map((e) => e.message).join("; ") };
  }
  return { ok: true };
}
