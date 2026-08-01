import type {
  ActionFunctionArgs,
  LinksFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import { eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { assistantConversations } from "../db/schema";
import { askAssistant } from "../services/ai/assistant.server";
import { getShopAiConfig } from "../services/ai/ai-config.server";
import { ensureShop } from "../services/shopify/shops.server";
import { requireAppModule } from "../services/shopify/require-module.server";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { MODULE_IMAGES } from "../config/brand";
import assistantStyles from "../styles/assistant.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: assistantStyles },
];

const SUGGESTIONS = [
  "What are my top 10 products?",
  "How can I boost my store sales?",
  "Which products need better images or descriptions?",
  "Summarize my store health and what to fix next",
  "Any collection SEO or image gaps?",
];

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
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const form = await request.formData();
  const intent = String(form.get("intent") || "ask");

  if (intent === "clear") {
    const convo = await db.query.assistantConversations.findFirst({
      where: eq(assistantConversations.shopId, shop.id),
    });
    if (convo) {
      await db
        .update(assistantConversations)
        .set({ messagesJson: "[]", updatedAt: new Date() })
        .where(eq(assistantConversations.id, convo.id));
    }
    return { ok: true, cleared: true, messages: [] as { role: string; text: string }[] };
  }

  const message = String(form.get("message") ?? "").trim();
  if (!message) return { ok: false, reason: "EMPTY" };

  const result = await askAssistant(shop.id, message, admin);
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
  ].slice(-40);

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
  return { ok: true, reply: result.reply, messages };
};

function reasonBanner(reason: string) {
  if (reason === "AI_NOT_CONFIGURED") {
    return (
      <Banner tone="warning" title="AI is temporarily unavailable">
        <Text as="p">Please try again later or contact support.</Text>
      </Banner>
    );
  }
  if (reason === "AI_DISABLED") {
    return (
      <Banner tone="warning" title="AI features are turned off">
        <Text as="p">Contact support if you need the assistant enabled.</Text>
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
  const [thread, setThread] = useState(messages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingUser = useRef<string | null>(null);

  const blocked = !aiConfigured || !aiEnabled;
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    setThread(messages);
  }, [messages]);

  useEffect(() => {
    if (fetcher.state === "submitting" && pendingUser.current) {
      // Clear after submit has started (message already in flight)
      setInput("");
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (
      fetcher.data.ok &&
      "messages" in fetcher.data &&
      Array.isArray(fetcher.data.messages)
    ) {
      setThread(fetcher.data.messages as { role: string; text: string }[]);
      setInput("");
      pendingUser.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, busy]);

  const displayThread =
    busy && pendingUser.current
      ? [...thread, { role: "user", text: pendingUser.current }]
      : thread;

  return (
    <Page fullWidth>
      <TitleBar title="AI Store Assistant" />
      <div className="cp-assist">
        {blocked &&
          reasonBanner(aiConfigured ? "AI_DISABLED" : "AI_NOT_CONFIGURED")}
        {fetcher.data && !fetcher.data.ok && !blocked &&
          reasonBanner(String((fetcher.data as { reason?: string }).reason))}

        <section className="cp-assist-hero">
          <div className="cp-assist-hero__glow" aria-hidden />
          <div className="cp-assist-hero__row">
            <img
              className="cp-assist-hero__icon"
              src={MODULE_IMAGES.assistant}
              alt=""
            />
            <div>
              <h1>AI Store Assistant</h1>
              <p>
                Ask anything about this store — top products, growth ideas, SEO,
                images, collections, and what to fix next. Answers use your live
                catalog plus health data.
              </p>
            </div>
          </div>
        </section>

        {!blocked && (
          <div className="cp-assist-chips">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="cp-assist-chip"
                disabled={busy}
                onClick={() => setInput(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="cp-assist-panel">
          <div className="cp-assist-thread">
            {displayThread.length === 0 && !busy && (
              <div className="cp-assist-empty">
                Start with a suggestion above, or type a store question below.
              </div>
            )}
            {displayThread.map((m, i) => (
              <div
                key={`${m.role}-${i}-${m.text.slice(0, 12)}`}
                className={`cp-assist-bubble ${
                  m.role === "user" ? "is-user" : "is-assistant"
                }`}
              >
                <span className="cp-assist-bubble__role">
                  {m.role === "user" ? "You" : "Assistant"}
                </span>
                {m.role === "assistant" ? (
                  <AssistantMarkdown text={m.text} />
                ) : (
                  <p className="cp-assist-md-p">{m.text}</p>
                )}
              </div>
            ))}
            {busy && (
              <div className="cp-assist-typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="cp-assist-composer">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="ask" />
              <div className="cp-assist-composer__row">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Message"
                    labelHidden
                    value={input}
                    onChange={setInput}
                    autoComplete="off"
                    multiline={3}
                    name="message"
                    disabled={blocked || busy}
                    placeholder="Ask about top products, sales boost, SEO, images…"
                  />
                </div>
              </div>
              <div className="cp-assist-composer__actions">
                <Button
                  submit
                  variant="primary"
                  loading={busy}
                  disabled={blocked || busy || !input.trim()}
                  onClick={() => {
                    const msg = input.trim();
                    if (!msg) return;
                    pendingUser.current = msg;
                  }}
                >
                  Send
                </Button>
                <Button
                  disabled={blocked || busy || thread.length === 0}
                  onClick={() => {
                    fetcher.submit({ intent: "clear" }, { method: "post" });
                    setThread([]);
                    setInput("");
                    pendingUser.current = null;
                  }}
                >
                  Clear chat
                </Button>
              </div>
            </fetcher.Form>
          </div>
        </div>

        <BlockStack gap="200">
          <Text as="p" tone="subdued" variant="bodySm">
            Tip: Clear chat if older replies still look like the old “health only”
            assistant — new answers use live products and collections.
          </Text>
        </BlockStack>
      </div>
    </Page>
  );
}
