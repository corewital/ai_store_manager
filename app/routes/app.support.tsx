import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams } from "@remix-run/react";
import { asc, desc, eq, isNull, and } from "drizzle-orm";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import { authenticate } from "../shopify.server";
import { db, insertReturningId } from "../db/client";
import {
  adminUsers,
  appSettings,
  shops,
  supportMessages,
  supportTickets,
} from "../db/schema";
import { SETTINGS_NAV, SubNav } from "../components/SubNav";

type Tone = "success" | "attention" | "info" | "critical";

function statusTone(status: string): Tone {
  if (status === "open") return "attention";
  if (status === "pending") return "info";
  return "success";
}

type TicketRow = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });

  const tickets: TicketRow[] = shop
    ? await db
        .select({
          id: supportTickets.id,
          subject: supportTickets.subject,
          status: supportTickets.status,
          priority: supportTickets.priority,
          createdAt: supportTickets.createdAt,
          updatedAt: supportTickets.updatedAt,
        })
        .from(supportTickets)
        .where(
          and(eq(supportTickets.shopId, shop.id), isNull(supportTickets.deletedAt)),
        )
        .orderBy(desc(supportTickets.updatedAt))
        .limit(50)
    : [];

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("ticket") || 0);
  const active =
    tickets.find((t) => t.id === requested) ?? tickets[0] ?? null;

  const messages = active
    ? await db
        .select({
          id: supportMessages.id,
          body: supportMessages.body,
          fromAdminUserId: supportMessages.fromAdminUserId,
          fromMerchantEmail: supportMessages.fromMerchantEmail,
          adminName: adminUsers.name,
          createdAt: supportMessages.createdAt,
        })
        .from(supportMessages)
        .leftJoin(adminUsers, eq(supportMessages.fromAdminUserId, adminUsers.id))
        .where(eq(supportMessages.ticketId, active.id))
        .orderBy(asc(supportMessages.id))
    : [];

  return {
    shopId: shop?.id ?? null,
    tickets: tickets.map((t) => ({
      ...t,
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
    })),
    active: active
      ? {
          ...active,
          createdAt: active.createdAt
            ? new Date(active.createdAt).toISOString()
            : null,
          updatedAt: active.updatedAt
            ? new Date(active.updatedAt).toISOString()
            : null,
        }
      : null,
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });
  if (!shop) return json({ error: "Shop not found" }, { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") || "create");
  const settings = await db.query.appSettings.findFirst({
    where: eq(appSettings.shopId, shop.id),
  });
  const merchantEmail = settings?.notifyEmail || null;

  if (intent === "reply") {
    const ticketId = Number(form.get("ticketId"));
    const body = String(form.get("body") || "").trim();
    if (!body) return json({ error: "Message is required" });
    const ticket = await db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.shopId, shop.id),
      ),
    });
    if (!ticket) return json({ error: "Ticket not found" }, { status: 404 });

    await db.insert(supportMessages).values({
      ticketId,
      body,
      fromMerchantEmail: merchantEmail,
    });
    await db
      .update(supportTickets)
      .set({ status: "open", updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
    return json({ ok: true, ticketId, replied: true });
  }

  const subject = String(form.get("subject") || "").trim();
  const body = String(form.get("body") || "").trim();
  const priority = String(form.get("priority") || "normal");
  if (!subject || !body) {
    return json({ error: "Subject and message are required" });
  }

  const ticketId = await insertReturningId(supportTickets, {
    shopId: shop.id,
    subject,
    priority,
    status: "open",
  });

  await db.insert(supportMessages).values({
    ticketId,
    body,
    fromMerchantEmail: merchantEmail,
  });

  return json({ ok: true, ticketId, replied: false });
}

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function SupportPage() {
  const { shopId, tickets, active, messages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [, setParams] = useSearchParams();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [priority, setPriority] = useState("normal");

  return (
    <Page>
      <TitleBar title="Support" />
      <SubNav items={SETTINGS_NAV} />
      <BlockStack gap="400">
        {!shopId && (
          <Banner tone="warning">Shop record missing — reinstall the app.</Banner>
        )}
        {actionData && "ok" in actionData && (
          <Banner tone="success">
            {actionData.replied
              ? "Reply sent to our support team."
              : `Ticket #${actionData.ticketId} submitted. We reply here and by email.`}
          </Banner>
        )}
        {actionData && "error" in actionData && (
          <Banner tone="critical">{actionData.error}</Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Your tickets
            </Text>
            {tickets.length === 0 && (
              <Text as="p" tone="subdued">
                No tickets yet. Send us a message below.
              </Text>
            )}
            {tickets.map((t) => (
              <Box
                key={t.id}
                padding="300"
                borderWidth="025"
                borderColor={active?.id === t.id ? "border-emphasis" : "border"}
                borderRadius="200"
              >
                <InlineStack align="space-between" blockAlign="center" gap="200">
                  <BlockStack gap="050">
                    <Text as="span" fontWeight="semibold">
                      #{t.id} {t.subject}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      Updated {fmt(t.updatedAt)}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                    <Button
                      onClick={() => setParams({ ticket: String(t.id) })}
                      variant={active?.id === t.id ? "primary" : "secondary"}
                    >
                      {active?.id === t.id ? "Viewing" : "View"}
                    </Button>
                  </InlineStack>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        </Card>

        {active && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                #{active.id} {active.subject}
              </Text>
              {messages.map((m) => (
                <Box
                  key={m.id}
                  padding="300"
                  background={
                    m.fromAdminUserId ? "bg-surface-success" : "bg-surface-secondary"
                  }
                  borderRadius="200"
                >
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {m.fromAdminUserId
                        ? `${m.adminName || "Support"} · ${fmt(m.createdAt)}`
                        : `You · ${fmt(m.createdAt)}`}
                    </Text>
                    <Text as="p">{m.body}</Text>
                  </BlockStack>
                </Box>
              ))}
              <Form method="post">
                <input type="hidden" name="intent" value="reply" />
                <input type="hidden" name="ticketId" value={active.id} />
                <BlockStack gap="200">
                  <TextField
                    label="Reply"
                    name="body"
                    value={reply}
                    onChange={setReply}
                    multiline={3}
                    autoComplete="off"
                  />
                  <Button submit variant="primary">
                    Send reply
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        )}

        <Card>
          <Form method="post">
            <input type="hidden" name="intent" value="create" />
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                New ticket
              </Text>
              <TextField
                label="Subject"
                name="subject"
                value={subject}
                onChange={setSubject}
                autoComplete="off"
              />
              <Select
                label="Priority"
                name="priority"
                options={[
                  { label: "Normal", value: "normal" },
                  { label: "High", value: "high" },
                  { label: "Low", value: "low" },
                ]}
                value={priority}
                onChange={setPriority}
              />
              <TextField
                label="Message"
                name="body"
                value={body}
                onChange={setBody}
                multiline={4}
                autoComplete="off"
              />
              <Button submit disabled={!shopId} variant="primary">
                Submit ticket
              </Button>
            </BlockStack>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
