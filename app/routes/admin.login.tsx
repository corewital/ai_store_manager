import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, redirect } from "@remix-run/react";

import { getAdminUser, loginAdmin } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAdminUser(request);
  if (user) throw redirect("/admin");
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const result = await loginAdmin(request, email, password);
  if (!result.ok) return { error: result.error };

  throw redirect("/admin", { headers: { "Set-Cookie": result.cookie } });
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
