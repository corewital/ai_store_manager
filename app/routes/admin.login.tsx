import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, redirect } from "@remix-run/react";

import { getAdminUser, loginAdmin } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAdminUser(request);
  if (user) throw redirect("/admin");
  return null;
}

function dbUnavailableMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (/TURSO_AUTH_TOKEN|misconfigured|auth token/i.test(msg)) {
    return "Server database is not configured. Set TURSO_AUTH_TOKEN on Vercel for corepilot-ai-db.";
  }
  return "Server error — database unavailable. Try again shortly.";
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    if (!email || !password) {
      return { error: "Email and password are required" };
    }

    const result = await loginAdmin(request, email, password);
    if (!result.ok) return { error: result.error };

    throw redirect("/admin", { headers: { "Set-Cookie": result.cookie } });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[admin.login]", error);
    return { error: dbUnavailableMessage(error) };
  }
}

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="admin-auth">
      <div className="admin-auth__card">
        <h1>Sign in to Admin</h1>
        <p className="lead">
          Internal CorePilot back office — invite-only access.
        </p>
        {actionData?.error && (
          <p className="admin-auth__error" role="alert">
            {actionData.error}
          </p>
        )}
        <Form method="post" className="admin-form">
          <label>
            Email
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="admin-btn admin-btn--primary" style={{ width: "100%" }}>
            Sign in
          </button>
        </Form>
      </div>
    </div>
  );
}
