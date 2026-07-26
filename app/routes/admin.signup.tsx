import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { adminUsers } from "../db/schema";
import { completeInviteSignup, getAdminUser } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getAdminUser(request);
  if (user) throw redirect("/admin");

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return { email: null, token: null, error: null as string | null };

  const inviteRows = await db
    .select({ email: adminUsers.email, name: adminUsers.name })
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.inviteToken, token),
        eq(adminUsers.status, "invited"),
        isNull(adminUsers.deletedAt),
      ),
    )
    .limit(1);
  const invite = inviteRows[0];

  if (!invite) {
    return { email: null, token: null, error: "Invalid or expired invite" };
  }
  return { email: invite.email, name: invite.name, token, error: null as string | null };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const name = String(form.get("name") || "").trim();

  if (!token || !password) {
    return { error: "Password is required" };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const result = await completeInviteSignup(request, token, password, name);
  if (!result.ok) return { error: result.error };

  throw redirect("/admin", { headers: { "Set-Cookie": result.cookie } });
}

export default function AdminSignup() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (!data.token) {
    return (
      <div className="admin-auth">
        <div className="admin-auth__card">
          <h1>Invite required</h1>
          <p className="lead">
            {data.error ||
              "A valid invite link is required to create an Admin Core account."}
          </p>
          <Link to="/admin/login" className="admin-btn admin-btn--primary">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth__card">
        <h1>Complete signup</h1>
        <p className="lead">
          Invited as <strong>{data.email}</strong>
        </p>
        {actionData?.error && (
          <p className="admin-auth__error" role="alert">
            {actionData.error}
          </p>
        )}
        <Form method="post" className="admin-form">
          <input type="hidden" name="token" value={data.token} />
          <label>
            Name
            <input type="text" name="name" defaultValue={data.name || ""} required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="admin-btn admin-btn--primary" style={{ width: "100%" }}>
            Create account
          </button>
        </Form>
      </div>
    </div>
  );
}
