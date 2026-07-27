import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { ensureShop } from "./services/shopify/shops.server";
import { TursoSessionStorage } from "./services/shopify/turso-session-storage.server";

const PRODUCTION_APP_URL = "https://corepilotai.corewital.com";

/** Never use an expired Cloudflare tunnel as the live app URL. */
function resolveAppUrl() {
  const raw = (process.env.SHOPIFY_APP_URL || process.env.HOST || "").trim();
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    if (!raw || raw.includes("trycloudflare.com") || raw.includes("localhost")) {
      return PRODUCTION_APP_URL;
    }
    return raw.replace(/\/$/, "");
  }
  return (raw || PRODUCTION_APP_URL).replace(/\/$/, "");
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: resolveAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new TursoSessionStorage() as never,
  distribution: AppDistribution.AppStore,
  hooks: {
    afterAuth: async ({ session }) => {
      await ensureShop(session.shop, session.accessToken);
      await shopify.registerWebhooks({ session });
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    // Required for public apps (403 Forbidden without this after Apr 2026)
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
