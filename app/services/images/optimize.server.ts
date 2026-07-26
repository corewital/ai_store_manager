import sharp from "sharp";

export type OptimizeResult = {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
};

/** Pixel pipeline only — never call Gemini here. */
export async function optimizeImage(
  input: Buffer,
  options?: { maxWidth?: number; quality?: number },
): Promise<OptimizeResult> {
  const maxWidth = options?.maxWidth ?? 1600;
  const quality = options?.quality ?? 80;

  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? maxWidth;

  const pipeline =
    width > maxWidth
      ? image.resize({ width: maxWidth, withoutEnlargement: true })
      : image;

  const buffer = await pipeline.webp({ quality }).toBuffer();
  const out = await sharp(buffer).metadata();

  return {
    buffer,
    contentType: "image/webp",
    width: out.width ?? maxWidth,
    height: out.height ?? 0,
  };
}
