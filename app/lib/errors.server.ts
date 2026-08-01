/** Turn unknown thrown values into a short merchant-facing string. */
export function formatCaughtError(error: unknown): string {
  const shopifyForbidden = shopifyForbiddenMessage(error);
  if (shopifyForbidden) return shopifyForbidden;

  if (error instanceof Error) {
    return merchantSafeError(error.message || error.name || "Error");
  }
  if (typeof Response !== "undefined" && error instanceof Response) {
    if (error.status === 403) {
      return SHOPIFY_403_HINT;
    }
    return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
  }
  if (error && typeof error === "object") {
    const r = error as {
      status?: number;
      statusText?: string;
      message?: string;
      networkStatusCode?: number;
      response?: { code?: number };
    };
    if (
      r.networkStatusCode === 403 ||
      r.response?.code === 403 ||
      r.status === 403 ||
      /forbidden/i.test(String(r.message || ""))
    ) {
      return SHOPIFY_403_HINT;
    }
    if (typeof r.status === "number") {
      return `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ""}`;
    }
    if (typeof r.message === "string" && r.message) return r.message.slice(0, 500);
  }
  if (typeof error === "string") {
    if (/forbidden/i.test(error)) return SHOPIFY_403_HINT;
    return error.slice(0, 500);
  }
  try {
    const s = JSON.stringify(error);
    if (s && s !== "{}") return s.slice(0, 500);
  } catch {
    /* ignore */
  }
  return "Unknown error";
}

export const SHOPIFY_403_HINT =
  "Shopify blocked this action (session needs refresh). Close this app tab, reopen CorePilot AI from Shopify Admin, then try AI Fix again.";

/** Never show raw backend / provider secrets to merchants. */
export function merchantSafeError(message: string | null | undefined): string {
  const raw = (message || "").trim();
  if (!raw) return "Something went wrong. Please try again.";
  if (
    /gemini|api key|not configured|ai.?provider|openai|anthropic|openrouter|admin → ai/i.test(
      raw,
    )
  ) {
    return "AI is temporarily unavailable. Please try again later or contact support.";
  }
  if (/quota|rate.?limit|429/i.test(raw)) {
    return "AI usage limit reached for now. Try again later or upgrade your plan.";
  }
  if (/TURSO|DATABASE|ADMIN_SESSION|CRON_SECRET|internal/i.test(raw)) {
    return "A system error occurred. Please try again shortly.";
  }
  if (/\[object |All AI providers failed/i.test(raw)) {
    return "AI could not complete this fix right now. Please try again.";
  }
  return raw.slice(0, 180);
}

function shopifyForbiddenMessage(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as {
    message?: string;
    networkStatusCode?: number;
    response?: { code?: number; status?: number };
    status?: number;
  };
  const code =
    e.networkStatusCode ?? e.response?.code ?? e.response?.status ?? e.status;
  const msg = String(e.message || "");
  if (code === 403 || /GraphQL Client:\s*Forbidden/i.test(msg) || /^Forbidden$/i.test(msg)) {
    return SHOPIFY_403_HINT;
  }
  return null;
}

/** Prefer body text when a Response was thrown (Shopify auth / GraphQL). */
export async function formatCaughtErrorAsync(error: unknown): Promise<string> {
  const shopifyForbidden = shopifyForbiddenMessage(error);
  if (shopifyForbidden) return shopifyForbidden;

  if (typeof Response !== "undefined" && error instanceof Response) {
    if (error.status === 403) return SHOPIFY_403_HINT;
    let detail = "";
    try {
      const text = (await error.clone().text()).trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            error?: string;
            message?: string;
            errors?: Array<{ message?: string }> | { message?: string };
          };
          if (typeof parsed.errors === "object" && !Array.isArray(parsed.errors)) {
            const nested = parsed.errors as { message?: string };
            if (/forbidden/i.test(String(nested.message || ""))) {
              return SHOPIFY_403_HINT;
            }
          }
          detail =
            parsed.error ||
            parsed.message ||
            (Array.isArray(parsed.errors) ? parsed.errors[0]?.message : undefined) ||
            text;
        } catch {
          detail = text;
        }
      }
    } catch {
      /* ignore body read */
    }
    if (/forbidden/i.test(detail)) return SHOPIFY_403_HINT;
    const base = `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
    const msg = detail ? `${base}: ${detail}` : base;
    return merchantSafeError(msg);
  }
  return merchantSafeError(formatCaughtError(error));
}

/** Remix / Shopify often throw Response for auth redirects — do not stringify. */
export function isThrownResponse(error: unknown): error is Response {
  return typeof Response !== "undefined" && error instanceof Response;
}

/**
 * Auth/reauth Responses must bubble to Remix (401 / redirects).
 * Do NOT rethrow bare 403 from GraphQL — that surfaces as "[object Response]"
 * or empty Forbidden; we convert those into merchant-facing JSON instead.
 */
export function shouldRethrowResponse(error: unknown): error is Response {
  if (!isThrownResponse(error)) return false;
  if (error.status === 302 || error.status === 401) {
    return true;
  }
  const loc = error.headers?.get?.("Location") ?? "";
  if (loc.includes("oauth") || loc.includes("auth") || loc.includes("login")) {
    return true;
  }
  return false;
}

export function isShopifyForbiddenError(error: unknown): boolean {
  return shopifyForbiddenMessage(error) != null;
}
