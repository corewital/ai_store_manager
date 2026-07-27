/** Turn unknown thrown values into a short merchant-facing string. */
export function formatCaughtError(error: unknown): string {
  if (error instanceof Error) {
    return (error.message || error.name || "Error").slice(0, 500);
  }
  if (typeof Response !== "undefined" && error instanceof Response) {
    return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
  }
  if (error && typeof error === "object") {
    const r = error as {
      status?: number;
      statusText?: string;
      message?: string;
    };
    if (typeof r.status === "number") {
      return `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ""}`;
    }
    if (typeof r.message === "string" && r.message) return r.message.slice(0, 500);
  }
  if (typeof error === "string") return error.slice(0, 500);
  try {
    const s = JSON.stringify(error);
    if (s && s !== "{}") return s.slice(0, 500);
  } catch {
    /* ignore */
  }
  return "Unknown error";
}

/** Prefer body text when a Response was thrown (Shopify auth / GraphQL). */
export async function formatCaughtErrorAsync(error: unknown): Promise<string> {
  if (typeof Response !== "undefined" && error instanceof Response) {
    let detail = "";
    try {
      const text = (await error.clone().text()).trim();
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            error?: string;
            message?: string;
            errors?: Array<{ message?: string }>;
          };
          detail =
            parsed.error ||
            parsed.message ||
            parsed.errors?.[0]?.message ||
            text;
        } catch {
          detail = text;
        }
      }
    } catch {
      /* ignore body read */
    }
    const base = `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
    const msg = detail ? `${base}: ${detail}` : base;
    return msg.slice(0, 500);
  }
  return formatCaughtError(error);
}

/** Remix / Shopify often throw Response for auth redirects — do not stringify. */
export function isThrownResponse(error: unknown): error is Response {
  return typeof Response !== "undefined" && error instanceof Response;
}

/**
 * Auth/reauth Responses must bubble to Remix.
 * Other Responses (e.g. throw json()) become messages.
 */
export function shouldRethrowResponse(error: unknown): error is Response {
  if (!isThrownResponse(error)) return false;
  // Shopify session refresh / install redirects
  if (error.status === 302 || error.status === 401 || error.status === 403) {
    return true;
  }
  const loc = error.headers?.get?.("Location") ?? "";
  if (loc.includes("oauth") || loc.includes("auth") || loc.includes("login")) {
    return true;
  }
  return false;
}
