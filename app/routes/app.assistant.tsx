import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { assistantConversations } from "../db/schema";
import { askAssistant } from "../services/ai/assistant.server";
import { getShopAiConfig } from "../services/ai/ai-config.server";
import { ensureShop } from "../services/shopify/shops.server";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  await requireAppModule("assistant", shop.id);
  const ai = await getShopAiConfig(shop.id);
  const convo = await db.query.assistantConversations.findFirst({
    where: eq(assistantConversations.shopId, shop.id),
  });
  let messages: { role: string; text: string }[] = [];
  try {
    messages = convo?.messagesJson ? JSON.parse(convo.messagesJson) : [];
  } catch {
    messages = [];
  }
  return {
    messages: Array.isArray(messages) ? messages : [],
    aiConfigured: ai.configured,
    aiEnabled: ai.enabled,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const message = String((await request.formData()).get("message") ?? "").trim();
  if (!message) return { ok: false, reason: "EMPTY" };

  const result = await askAssistant(shop.id, message);
  if (!result.ok) return { ok: false, reason: result.reason };

  const convo = await db.query.assistantConversations.findFirst({
    where: eq(assistantConversations.shopId, shop.id),
  });
  let prev: { role: string; text: string }[] = [];
  try {
    prev = convo?.messagesJson ? JSON.parse(convo.messagesJson) : [];
  } catch {
    prev = [];
  }
  const messages = [
    ...(Array.isArray(prev) ? prev : []),
    { role: "user", text: message },
    { role: "assistant", text: result.reply },
  ];

  if (convo) {
    await db
      .update(assistantConversations)
      .set({ messagesJson: JSON.stringify(messages), updatedAt: new Date() })
      .where(eq(assistantConversations.id, convo.id));
  } else {
    await db.insert(assistantConversations).values({
      shopId: shop.id,
      messagesJson: JSON.stringify(messages),
    });
  }
  return { ok: true, reply: result.reply };
};

function reasonBanner(reason: string) {
  if (reason === "AI_NOT_CONFIGURED") {
    return (
      <Banner tone="warning" title="AI is temporarily unavailable">
        <Text as="p">
          Please try again later or contact support if this keeps happening.
        </Text>
      </Banner>
    );
  }
  if (reason === "AI_DISABLED") {
    return (
      <Banner tone="warning" title="AI features are turned off">
        <Text as="p">
          AI is disabled for this store. Contact support if you need it enabled.
        </Text>
      </Banner>
    );
  }
  if (reason === "EMPTY") return null;
  return <Banner tone="critical">Could not send message. Try again.</Banner>;
}

export default function AssistantPage() {
  const { messages, aiConfigured, aiEnabled } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [input, setInput] = useState("");

  const blocked = !aiConfigured || !aiEnabled;

  return (
    <Page>
      <TitleBar title="AI Store Assistant" />
      <BlockStack gap="400">
        {blocked &&
          reasonBanner(aiConfigured ? "AI_DISABLED" : "AI_NOT_CONFIGURED")}
        {fetcher.data && !fetcher.data.ok && !blocked &&
          reasonBanner(String((fetcher.data as { reason?: string }).reason))}
        <Card>
          <BlockStack gap="300">
            {messages.length === 0 && (
              <Text as="p" tone="subdued">
                Ask about your store health, open issues, or next steps.
              </Text>
            )}
            {messages.map((m, i) => (
              <Text key={i} as="p" variant="bodyMd">
                <Text as="span" fontWeight="semibold">
                  {m.role === "user" ? "You" : "Assistant"}:
                </Text>{" "}
                {m.text}
              </Text>
            ))}
          </BlockStack>
        </Card>
        <fetcher.Form method="post">
          <BlockStack gap="200">
            <TextField
              label="Message"
              value={input}
              onChange={setInput}
              autoComplete="off"
              multiline={3}
              name="message"
              disabled={blocked}
              placeholder="Why are my sales dropping?"
            />
            <Button
              submit
              variant="primary"
              loading={fetcher.state !== "idle"}
              disabled={blocked}
            >
              Send
            </Button>
          </BlockStack>
        </fetcher.Form>
      </BlockStack>
    </Page>
  );
}
