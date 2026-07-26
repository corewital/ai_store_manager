import { db } from "../../db/client";
import { webhookLogs } from "../../db/schema";

export async function logWebhook(input: {
  shopDomain?: string | null;
  topic: string;
  status?: string;
  payload?: unknown;
  errorMessage?: string | null;
}) {
  await db.insert(webhookLogs).values({
    shopDomain: input.shopDomain ?? null,
    topic: input.topic,
    status: input.status ?? "ok",
    payloadJson: input.payload != null ? JSON.stringify(input.payload) : null,
    errorMessage: input.errorMessage ?? null,
  });
}
