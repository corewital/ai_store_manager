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
  if (!/^https?:\/\//i.test(url)) {
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

/** Set / replace a collection featured image from a remote URL (no AI). */
export async function attachCollectionImageFromUrl(
  admin: AdminApiContext,
  collectionId: string,
  imageUrl: string,
  alt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = imageUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "Image URL must start with http:// or https://" };
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
          image: {
            src: url,
            altText: (alt || "").slice(0, 125) || null,
          },
        },
      },
    },
  );
  const json = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      collectionUpdate?: {
        userErrors?: { message: string }[];
      };
    };
  };
  if (json.errors?.length) {
    return { ok: false, error: json.errors.map((e) => e.message).join("; ") };
  }
  const errs = json.data?.collectionUpdate?.userErrors ?? [];
  if (errs.length) {
    return { ok: false, error: errs.map((e) => e.message).join("; ") };
  }
  return { ok: true };
}
