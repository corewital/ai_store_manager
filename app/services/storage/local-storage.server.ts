import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { db } from "../../db/client";
import { fileUploads } from "../../db/schema";

const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");

export async function saveLocalUpload(input: {
  data: Buffer | Uint8Array;
  filename: string;
  mime?: string;
  uploadedByAdminUserId?: number;
  purpose?: string;
}) {
  await mkdir(UPLOAD_ROOT, { recursive: true });
  const ext = path.extname(input.filename) || "";
  const stored = `${randomUUID()}${ext}`;
  const rel = path.join("storage", "uploads", stored);
  const abs = path.join(process.cwd(), rel);
  await writeFile(abs, input.data);

  const [{ id }] = await db
    .insert(fileUploads)
    .values({
      path: rel.replace(/\\/g, "/"),
      mime: input.mime ?? null,
      size: input.data.byteLength,
      uploadedByAdminUserId: input.uploadedByAdminUserId ?? null,
      purpose: input.purpose ?? null,
    })
    .$returningId();

  return { id, path: rel.replace(/\\/g, "/") };
}
