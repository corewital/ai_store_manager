import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "@remix-run/react";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Pagination,
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

const PAGE_SIZE = 10;

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
  createdAt: string | null;
  updatedAt: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await db.query.shops.findFirst({
    where: eq(shops.shopDomain, session.shop),
  });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const status = url.searchParams.get("status") || "all";
  const priority = url.searchParams.get("priority") || "all";
  const requested = Number(url.searchParams.get("ticket") || 0);

  const empty = {
    shopId: null as number | null,
    tickets: [] as TicketRow[],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
    status,
    priority,
    active: null as TicketRow | null,
    messages: [] as Array<{
      id: number;
      body: string;
      fromAdminUserId: number | null;
      fromMerchantEmail: string | null;
      adminName: string | null;
      createdAt: string | null;
    }>,
    counts: { open: 0, pending: 0, closed: 0 },
  };

  if (!shop) return empty;

  const conditions = [
    eq(supportTickets.shopId, shop.id),
    isNull(supportTickets.deletedAt),
  ];
  if (status !== "all") conditions.push(eq(supportTickets.status, status));
  if (priority !== "all") conditions.push(eq(supportTickets.priority, priority));

  const [{ total }] = await db
    .select({ total: count() })
    .from(supportTickets)
    .where(and(...conditions));

  const rows = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
    })
    .from(supportTickets)
    .where(and(...conditions))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const tickets: TicketRow[] = rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
    updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
  }));

  const allForCounts = await db
    .select({ status: supportTickets.status })
    .from(supportTickets)
    .where(
      and(eq(supportTickets.shopId, shop.id), isNull(supportTickets.deletedAt)),
    );
  const counts = { open: 0, pending: 0, closed: 0 };
  for (const row of allForCounts) {
    if (row.status === "open") counts.open += 1;
    else if (row.status === "pending") counts.pending += 1;
    else counts.closed += 1;
  }

  let active: TicketRow | null =
    tickets.find((t) => t.id === requested) ?? tickets[0] ?? null;

  if (requested && (!active || active.id !== requested)) {
    const found = await db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.id, requested),
        eq(supportTickets.shopId, shop.id),
        isNull(supportTickets.deletedAt),
      ),
    });
    if (found) {
      active = {
        id: found.id,
        subject: found.subject,
        status: found.status,
        priority: found.priority,
        createdAt: found.createdAt
          ? new Date(found.createdAt).toISOString()
          : null,
        updatedAt: found.updatedAt
          ? new Date(found.updatedAt).toISOString()
          : null,
      };
    }
  }

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
        .leftJoin(
          adminUsers,
          eq(supportMessages.fromAdminUserId, adminUsers.id),
        )
        .where(eq(supportMessages.ticketId, active.id))
        .orderBy(asc(supportMessages.id))
    : [];

  return {
    shopId: shop.id as number | null,
    total,
    page,
    pageSize: PAGE_SIZE,
    status,
    priority,
    counts,
    tickets,
    active,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      fromAdminUserId: m.fromAdminUserId,
      fromMerchantEmail: m.fromMerchantEmail,
      adminName: m.adminName,
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
  const {
    shopId,
    tickets,
    active,
    messages,
    total,
    page,
    pageSize,
    status,
    priority,
    counts,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [params, setParams] = useSearchParams();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [showNew, setShowNew] = useState(tickets.length === 0);

  const patchParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all" || (k === "page" && v === "1")) next.delete(k);
      else next.set(k, v);
    }
    setParams(next);
  };

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
          <InlineStack align="space-between" blockAlign="center" wrap gap="300">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Your tickets
              </Text>
              <InlineStack gap="200">
                <Badge tone="attention">{`${counts.open} open`}</Badge>
                <Badge tone="info">{`${counts.pending} pending`}</Badge>
                <Badge>{`${counts.closed} closed`}</Badge>
              </InlineStack>
            </BlockStack>
            <Button variant="primary" onClick={() => setShowNew((v) => !v)}>
              {showNew ? "Hide new ticket" : "New ticket"}
            </Button>
          </InlineStack>
        </Card>

        {showNew && (
          <Card>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Create ticket
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
                  value={newPriority}
                  onChange={setNewPriority}
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
        )}

        <InlineStack gap="300" wrap>
          <Select
            label="Status"
            labelHidden
            options={[
              { label: "All statuses", value: "all" },
              { label: "Open", value: "open" },
              { label: "Pending", value: "pending" },
              { label: "Closed", value: "closed" },
            ]}
            value={status}
            onChange={(v) => patchParams({ status: v, page: "1" })}
          />
          <Select
            label="Priority"
            labelHidden
            options={[
              { label: "All priorities", value: "all" },
              { label: "High", value: "high" },
              { label: "Normal", value: "normal" },
              { label: "Low", value: "low" },
            ]}
            value={priority}
            onChange={(v) => patchParams({ priority: v, page: "1" })}
          />
        </InlineStack>

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card padding="0">
              {tickets.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued">
                    No tickets match this filter. Create one to reach support.
                  </Text>
                </Box>
              ) : (
                <>
                  <IndexTable
                    resourceName={{ singular: "ticket", plural: "tickets" }}
                    itemCount={tickets.length}
                    selectable={false}
                    headings={[
                      { title: "Ticket" },
                      { title: "Priority" },
                      { title: "Status" },
                      { title: "Updated" },
                    ]}
                  >
                    {tickets.map((ticket, i) => (
                      <IndexTable.Row
                        id={String(ticket.id)}
                        key={ticket.id}
                        position={i}
                        selected={active?.id === ticket.id}
                        onClick={() =>
                          patchParams({ ticket: String(ticket.id) })
                        }
                      >
                        <IndexTable.Cell>
                          <Text as="span" fontWeight="semibold">
                            #{ticket.id} {ticket.subject}
                          </Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{ticket.priority}</IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={statusTone(ticket.status)}>
                            {ticket.status}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {fmt(ticket.updatedAt)}
                          </Text>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                  {total > pageSize && (
                    <div
                      style={{
                        padding: "0.85rem",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <Pagination
                        hasPrevious={page > 1}
                        onPrevious={() =>
                          patchParams({ page: String(page - 1) })
                        }
                        hasNext={page * pageSize < total}
                        onNext={() => patchParams({ page: String(page + 1) })}
                      />
                    </div>
                  )}
                </>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            {active ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" wrap>
                    <Text as="h2" variant="headingMd">
                      #{active.id} {active.subject}
                    </Text>
                    <Badge tone={statusTone(active.status)}>
                      {active.status}
                    </Badge>
                  </InlineStack>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Priority: {active.priority} · Created {fmt(active.createdAt)}
                  </Text>
                  {messages.map((m) => (
                    <Box
                      key={m.id}
                      padding="300"
                      background={
                        m.fromAdminUserId
                          ? "bg-surface-success"
                          : "bg-surface-secondary"
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
            ) : (
              <Card>
                <Text as="p" tone="subdued">
                  Select a ticket to view the conversation.
                </Text>
              </Card>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
