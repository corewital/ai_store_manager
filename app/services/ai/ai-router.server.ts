import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { aiApiKeys, aiProviders } from "../../db/schema";
import { getSetting, setSetting } from "../admin/settings.server";
import { AiQuotaError, callProvider } from "./ai-providers.server";

export const AI_NOT_CONFIGURED = "AI_NOT_CONFIGURED";

export class AiNotConfiguredError extends Error {
  reason = AI_NOT_CONFIGURED;
  constructor() {
    super("No AI provider/API key is configured");
  }
}

export type AiRoutingConfig = {
  preferred: string;
  failover: boolean;
};

const DEFAULT_ROUTING: AiRoutingConfig = {
  preferred: "auto",
  failover: true,
};

export async function getAiRouting(): Promise<AiRoutingConfig> {
  return getSetting<AiRoutingConfig>("ai_routing", DEFAULT_ROUTING);
}

export async function setAiRouting(cfg: AiRoutingConfig) {
  await setSetting("ai_routing", cfg, "Multi-AI routing");
}

const COOLDOWN_MS = 30 * 60 * 1000;

async function markKeySuccess(id: number) {
  await db
    .update(aiApiKeys)
    .set({
      status: "active",
      cooldownUntil: null,
      lastError: null,
      lastUsedAt: new Date(),
      successCount: sql`${aiApiKeys.successCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(aiApiKeys.id, id));
}

async function markKeyQuota(id: number, error: string) {
  await db
    .update(aiApiKeys)
    .set({
      status: "cooldown",
      cooldownUntil: new Date(Date.now() + COOLDOWN_MS),
      lastError: error.slice(0, 500),
      lastUsedAt: new Date(),
      failCount: sql`${aiApiKeys.failCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(aiApiKeys.id, id));
}

async function markKeyFail(id: number, error: string) {
  await db
    .update(aiApiKeys)
    .set({
      lastError: error.slice(0, 500),
      lastUsedAt: new Date(),
      failCount: sql`${aiApiKeys.failCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(aiApiKeys.id, id));
}

async function reviveCooldowns() {
  await db
    .update(aiApiKeys)
    .set({ status: "active", cooldownUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(aiApiKeys.status, "cooldown"),
        or(isNull(aiApiKeys.cooldownUntil), sql`${aiApiKeys.cooldownUntil} < NOW()`),
      ),
    );
}

async function listEnabledProviders(preferred: string) {
  const rows = await db.query.aiProviders.findMany({
    where: and(eq(aiProviders.enabled, true), isNull(aiProviders.deletedAt)),
    orderBy: [asc(aiProviders.priority)],
  });
  if (preferred === "auto" || !preferred) return rows;
  const first = rows.find((p) => p.slug === preferred);
  if (!first) return rows;
  return [first, ...rows.filter((p) => p.id !== first.id)];
}

async function activeKeysFor(providerId: number) {
  return db.query.aiApiKeys.findMany({
    where: and(
      eq(aiApiKeys.providerId, providerId),
      eq(aiApiKeys.status, "active"),
      isNull(aiApiKeys.deletedAt),
    ),
    orderBy: [asc(aiApiKeys.id)],
  });
}

export async function hasAnyAiKey(): Promise<boolean> {
  const row = await db.query.aiApiKeys.findFirst({
    where: and(isNull(aiApiKeys.deletedAt), eq(aiApiKeys.status, "active")),
  });
  if (row) return true;
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Preferred provider → rotate keys → next provider on quota (if failover on).
 */
export async function routeGenerateText(
  prompt: string,
  opts?: { preferredSlug?: string | null },
): Promise<{ text: string; provider: string; keyId: number | null }> {
  await reviveCooldowns();
  const routing = await getAiRouting();
  const preferred = opts?.preferredSlug || routing.preferred;
  const providers = await listEnabledProviders(preferred);
  const errors: string[] = [];

  for (const provider of providers) {
    const keys = await activeKeysFor(provider.id);
    const attempts: { id: number; apiKey: string }[] = keys.map((k) => ({
      id: k.id,
      apiKey: k.apiKey,
    }));
    if (
      attempts.length === 0 &&
      provider.slug === "gemini" &&
      process.env.GEMINI_API_KEY
    ) {
      attempts.push({ id: 0, apiKey: process.env.GEMINI_API_KEY });
    }

    for (const key of attempts) {
      try {
        const result = await callProvider({
          slug: provider.slug,
          apiKey: key.apiKey,
          model: provider.defaultModel,
          baseUrl: provider.baseUrl,
          prompt,
        });
        if (key.id > 0) await markKeySuccess(key.id);
        return {
          text: result.text,
          provider: provider.slug,
          keyId: key.id || null,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const quota = error instanceof AiQuotaError;
        if (quota && key.id > 0) await markKeyQuota(key.id, msg);
        else if (key.id > 0) await markKeyFail(key.id, msg);
        errors.push(
          `${provider.slug}#${key.id}: ${quota ? "quota — " : ""}${msg.slice(0, 100)}`,
        );
      }
    }

    if (!routing.failover && preferred !== "auto" && provider.slug === preferred) {
      break;
    }
  }

  if (errors.length === 0) throw new AiNotConfiguredError();
  throw new Error(`All AI providers failed:\n${errors.join("\n")}`);
}

export async function testProviderKey(
  providerSlug: string,
  apiKey: string,
  model?: string,
  baseUrl?: string | null,
): Promise<{ ok: boolean; message: string }> {
  try {
    const provider = await db.query.aiProviders.findFirst({
      where: eq(aiProviders.slug, providerSlug),
    });
    const result = await callProvider({
      slug: providerSlug,
      apiKey,
      model: model || provider?.defaultModel || "gpt-4o-mini",
      baseUrl: baseUrl ?? provider?.baseUrl,
      prompt: "Reply with exactly: OK",
    });
    return { ok: true, message: `${providerSlug}: ${result.text.slice(0, 80)}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
