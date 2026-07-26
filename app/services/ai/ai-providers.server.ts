import { GoogleGenerativeAI } from "@google/generative-ai";

export type ProviderCallResult = { text: string };

function isQuotaError(status: number, body: string) {
  const b = body.toLowerCase();
  return (
    status === 429 ||
    status === 402 ||
    b.includes("quota") ||
    b.includes("rate limit") ||
    b.includes("rate_limit") ||
    b.includes("insufficient") ||
    b.includes("exceeded") ||
    b.includes("billing")
  );
}

export class AiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiQuotaError";
  }
}

async function openAiCompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  authHeader?: "bearer" | "api-key";
}): Promise<ProviderCallResult> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        opts.authHeader === "api-key"
          ? opts.apiKey
          : `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      temperature: 0.4,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    if (isQuotaError(res.status, raw)) throw new AiQuotaError(raw.slice(0, 400));
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  const json = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return { text };
}

async function callClaude(apiKey: string, model: string, prompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    if (isQuotaError(res.status, raw)) throw new AiQuotaError(raw.slice(0, 400));
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  const json = JSON.parse(raw) as {
    content?: { type: string; text?: string }[];
  };
  const text = json.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("Empty Claude response");
  return { text };
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const m = genAI.getGenerativeModel({ model });
    const result = await m.generateContent(prompt);
    return { text: result.response.text().trim() };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (isQuotaError(429, msg)) throw new AiQuotaError(msg.slice(0, 400));
    throw error;
  }
}

/** Dispatch one provider+key. Throws AiQuotaError when free/paid limit hit. */
export async function callProvider(opts: {
  slug: string;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  prompt: string;
}): Promise<ProviderCallResult> {
  const { slug, apiKey, model, prompt } = opts;
  switch (slug) {
    case "gemini":
      return callGemini(apiKey, model, prompt);
    case "claude":
      return callClaude(apiKey, model, prompt);
    case "openai":
      return openAiCompatible({
        baseUrl: opts.baseUrl || "https://api.openai.com/v1",
        apiKey,
        model,
        prompt,
      });
    case "openrouter":
      return openAiCompatible({
        baseUrl: opts.baseUrl || "https://openrouter.ai/api/v1",
        apiKey,
        model,
        prompt,
      });
    case "zai":
      return openAiCompatible({
        baseUrl: opts.baseUrl || "https://api.z.ai/api/paas/v4",
        apiKey,
        model,
        prompt,
      });
    case "bigmodel":
      return openAiCompatible({
        baseUrl: opts.baseUrl || "https://open.bigmodel.cn/api/paas/v4",
        apiKey,
        model,
        prompt,
      });
    default:
      // Extensible: any OpenAI-compatible baseUrl
      if (!opts.baseUrl) throw new Error(`Unknown provider: ${slug}`);
      return openAiCompatible({
        baseUrl: opts.baseUrl,
        apiKey,
        model,
        prompt,
      });
  }
}
