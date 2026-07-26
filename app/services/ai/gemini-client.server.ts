/**
 * Public AI text API — routes through multi-provider pool (admin-managed).
 * Image pixels remain `sharp` only (DECISIONS).
 */
import {
  AI_NOT_CONFIGURED,
  AiNotConfiguredError,
  hasAnyAiKey,
  routeGenerateText,
  testProviderKey,
} from "./ai-router.server";
import { getSetting } from "../admin/settings.server";

export { AI_NOT_CONFIGURED, AiNotConfiguredError };

export async function resolveGeminiApiKey(
  override?: string | null,
): Promise<string | null> {
  if (override?.trim()) return override.trim();
  const fromAdmin = (await getSetting<string>("gemini_api_key", ""))?.trim();
  if (fromAdmin) return fromAdmin;
  return process.env.GEMINI_API_KEY?.trim() || null;
}

/** True when Admin → AI has an active key (or GEMINI_API_KEY env fallback). */
export async function isAiConfigured(_apiKey?: string | null) {
  return hasAnyAiKey();
}

export async function testGeminiApiKey(apiKey?: string | null) {
  const key = apiKey?.trim() || (await resolveGeminiApiKey());
  if (!key) {
    return { ok: false, message: "No Gemini key" };
  }
  return testProviderKey("gemini", key);
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function generateJson<T>(
  prompt: string,
  _apiKey?: string | null,
): Promise<T> {
  const { text } = await routeGenerateText(prompt);
  try {
    return JSON.parse(stripFences(text)) as T;
  } catch (error) {
    throw new Error(
      `AI JSON parse failed: ${error instanceof Error ? error.message : String(error)}\nRaw: ${text}`,
    );
  }
}

export async function generateText(
  prompt: string,
  _apiKey?: string | null,
): Promise<string> {
  const { text } = await routeGenerateText(prompt);
  return text;
}
