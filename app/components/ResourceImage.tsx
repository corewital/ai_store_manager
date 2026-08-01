import { useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  size?: number;
  onClick?: () => void;
};

const FALLBACK = "/images/placeholder.svg";

/** Normalize Shopify CDN / relative URLs for embedded app img tags. */
export function normalizeImageUrl(src?: string | null): string | null {
  if (!src || typeof src !== "string") return null;
  let url = src.trim();
  if (!url) return null;
  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  // Request a small thumb when CDN supports width param
  if (
    /cdn\.shopify\.com|shopifycdn\.net/i.test(url) &&
    !/[?&]width=/.test(url)
  ) {
    url += (url.includes("?") ? "&" : "?") + "width=160";
  }
  return url;
}

export function ResourceImage({ src, alt, size = 40, onClick }: Props) {
  const [failed, setFailed] = useState(false);
  const normalized = normalizeImageUrl(src);
  const url = !normalized || failed ? FALLBACK : normalized;

  const img = (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: 6,
        background: "var(--p-color-bg-fill-secondary)",
        display: "block",
      }}
    />
  );

  if (!onClick) return img;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "zoom-in",
        lineHeight: 0,
      }}
      aria-label={`Preview ${alt}`}
    >
      {img}
    </button>
  );
}

export function imageFormat(src?: string | null): string | null {
  if (!src) return null;
  const clean = src.split("?")[0].toLowerCase();
  const ext = clean.split(".").pop();
  if (!ext) return null;
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (["png", "webp", "gif", "svg", "avif"].includes(ext)) return ext.toUpperCase();
  return null;
}
