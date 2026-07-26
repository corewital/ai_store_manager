import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { aiApiKeys, aiProviders } from "../../db/schema";

export const DEFAULT_PROVIDERS = [
  {
    slug: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    priority: 10,
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    priority: 20,
  },
  {
    slug: "gemini",
    name: "Google Gemini",
    baseUrl: null as string | null,
    defaultModel: "gemini-2.0-flash",
    priority: 30,
  },
  {
    slug: "claude",
    name: "Anthropic Claude",
    baseUrl: null as string | null,
    defaultModel: "claude-3-5-haiku-latest",
    priority: 40,
  },
  {
    slug: "zai",
    name: "Z.AI",
    baseUrl: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4-flash",
    priority: 50,
  },
  {
    slug: "bigmodel",
    name: "BigModel (智谱)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    priority: 60,
  },
] as const;

export async function ensureDefaultProviders() {
  for (const p of DEFAULT_PROVIDERS) {
    const existing = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.slug, p.slug),
    });
    if (existing) continue;
    await db.insert(aiProviders).values({
      slug: p.slug,
      name: p.name,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      enabled: true,
      priority: p.priority,
    });
  }
}

export async function listProvidersWithKeys() {
  await ensureDefaultProviders();
  const providers = await db.query.aiProviders.findMany({
    where: isNull(aiProviders.deletedAt),
    orderBy: [asc(aiProviders.priority)],
  });
  const result = [];
  for (const p of providers) {
    const keys = await db.query.aiApiKeys.findMany({
      where: and(eq(aiApiKeys.providerId, p.id), isNull(aiApiKeys.deletedAt)),
      orderBy: [asc(aiApiKeys.id)],
    });
    result.push({
      ...p,
      keys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        status: k.status,
        cooldownUntil: k.cooldownUntil,
        lastError: k.lastError,
        lastUsedAt: k.lastUsedAt,
        successCount: k.successCount,
        failCount: k.failCount,
        masked: maskKey(k.apiKey),
      })),
    });
  }
  return result;
}

export function maskKey(key: string) {
  if (key.length <= 12) return "••••••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export async function addApiKey(
  providerSlug: string,
  apiKey: string,
  label?: string,
) {
  await ensureDefaultProviders();
  const provider = await db.query.aiProviders.findFirst({
    where: eq(aiProviders.slug, providerSlug),
  });
  if (!provider) throw new Error(`Unknown provider ${providerSlug}`);
  const dup = await db.query.aiApiKeys.findFirst({
    where: and(
      eq(aiApiKeys.providerId, provider.id),
      eq(aiApiKeys.apiKey, apiKey),
      isNull(aiApiKeys.deletedAt),
    ),
  });
  if (dup) return dup;
  const [{ id }] = await db
    .insert(aiApiKeys)
    .values({
      providerId: provider.id,
      apiKey,
      label: label || null,
      status: "active",
    })
    .$returningId();
  return db.query.aiApiKeys.findFirst({ where: eq(aiApiKeys.id, id) });
}
