import { useState } from "react";

type Props = {
  src?: string | null;
  alt: string;
  size?: number;
  onClick?: () => void;
};

const FALLBACK = "/images/placeholder.svg";

export function ResourceImage({ src, alt, size = 40, onClick }: Props) {
  const [failed, setFailed] = useState(false);
  const url = !src || failed ? FALLBACK : src;

  const img = (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
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
