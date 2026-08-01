import { eq } from "drizzle-orm";
import { db, insertReturningId } from "../../db/client";
import { fixQueue } from "../../db/schema";

export async function enqueueFix(input: {
  shopId: number;
  module: string;
  issueId?: number | null;
  action: string;
  payload?: unknown;
}) {
  const id = await insertReturningId(fixQueue, {
    shopId: input.shopId,
    module: input.module,
    issueId: input.issueId ?? null,
    action: input.action,
    payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    status: "pending",
  });
  const row = await db.query.fixQueue.findFirst({
    where: eq(fixQueue.id, id),
  });
  if (!row) throw new Error("Failed to enqueue fix");
  return row;
}

export async function markFixDone(
  id: number,
  error?: string,
  payload?: Record<string, unknown>,
) {
  const patch: {
    status: string;
    errorMessage: string | null;
    completedAt: Date;
    updatedAt: Date;
    payloadJson?: string;
  } = {
    status: error ? "failed" : "done",
    errorMessage: error ?? null,
    completedAt: new Date(),
    updatedAt: new Date(),
  };
  if (payload) {
    const existing = await db.query.fixQueue.findFirst({
      where: eq(fixQueue.id, id),
    });
    let prev: Record<string, unknown> = {};
    try {
      prev = existing?.payloadJson ? JSON.parse(existing.payloadJson) : {};
    } catch {
      prev = {};
    }
    patch.payloadJson = JSON.stringify({ ...prev, ...payload });
  }
  await db.update(fixQueue).set(patch).where(eq(fixQueue.id, id));
}
