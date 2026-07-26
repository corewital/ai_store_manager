import { createCookieSessionStorage } from "@remix-run/node";

const SESSION_KEY = "adminUserId";

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is required");
  return secret;
}

export const adminSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__admin_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [getSecret()],
    // Secure when serving over HTTPS (Cloudflare tunnel / production)
    secure:
      process.env.NODE_ENV === "production" ||
      (process.env.SHOPIFY_APP_URL || "").startsWith("https://"),
    maxAge: 60 * 60 * 24 * 7,
  },
});

export async function getAdminSession(request: Request) {
  return adminSessionStorage.getSession(request.headers.get("Cookie"));
}

export async function getAdminUserId(request: Request): Promise<number | null> {
  const session = await getAdminSession(request);
  const id = session.get(SESSION_KEY);
  return typeof id === "number" ? id : null;
}

export async function createAdminSession(adminUserId: number) {
  const session = await adminSessionStorage.getSession();
  session.set(SESSION_KEY, adminUserId);
  return adminSessionStorage.commitSession(session);
}

export async function destroyAdminSession(request: Request) {
  const session = await getAdminSession(request);
  return adminSessionStorage.destroySession(session);
}

export async function commitAdminSession(request: Request) {
  const session = await getAdminSession(request);
  return adminSessionStorage.commitSession(session);
}
