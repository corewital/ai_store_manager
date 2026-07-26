import { Resend } from "resend";
import { db } from "../../db/client";
import { reportsSent } from "../../db/schema";

function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is required");
  return new Resend(key);
}

export async function sendReportEmail(input: {
  shopId: number;
  to: string;
  type: "daily" | "weekly" | "support";
  subject: string;
  html: string;
  summary?: unknown;
}) {
  const from = process.env.RESEND_FROM_EMAIL || "AI Store Manager <onboarding@resend.dev>";
  await resend().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  await db.insert(reportsSent).values({
    shopId: input.shopId,
    type: input.type,
    subject: input.subject,
    bodyHtml: input.html,
    summaryJson: input.summary ? JSON.stringify(input.summary) : null,
    sentAt: new Date(),
  });
}
