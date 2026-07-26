import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireRole } from "../services/admin/auth.server";
import { getSetting, setSetting } from "../services/admin/settings.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRole(request, ["super_admin"]);
  return {
    resendApiKey: (await getSetting<string>("resend_api_key", "")) || "",
    cronSecretSet: Boolean(process.env.CRON_SECRET),
    featureFlags: await getSetting<Record<string, boolean>>("feature_flags", {
      team: false,
      multiStore: false,
    }),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireRole(request, ["super_admin"]);
  const form = await request.formData();
  const resend = String(form.get("resendApiKey") || "").trim();
  const team = form.get("flag_team") === "on";
  const multiStore = form.get("flag_multiStore") === "on";

  if (resend) await setSetting("resend_api_key", resend, "Resend API key");
  await setSetting("feature_flags", { team, multiStore }, "Feature flags");

  return { ok: true, by: user.email };
}

export default function AdminSystemSettingsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        SuperAdmin only. AI model keys now live in{" "}
        <Link to="/admin/ai">AI providers</Link> — this page keeps platform
        secrets and feature flags.
      </p>

      {actionData?.ok && (
        <div className="admin-card" style={{ borderColor: "#86efac" }}>
          Saved by {actionData.by}
        </div>
      )}

      <div className="admin-card" style={{ maxWidth: 560 }}>
        <Form method="post" className="admin-form">
          <label>
            Resend API key
            <input
              type="password"
              name="resendApiKey"
              autoComplete="off"
              placeholder={data.resendApiKey ? "•••••••• (saved)" : "re_..."}
            />
          </label>
          <p style={{ fontSize: "0.8125rem", color: "var(--admin-muted)" }}>
            CRON_SECRET:{" "}
            {data.cronSecretSet ? (
              <span className="admin-badge admin-badge--ok">set in env</span>
            ) : (
              <span className="admin-badge admin-badge--err">missing</span>
            )}
          </p>
          <fieldset
            style={{
              border: "1px solid var(--admin-border)",
              borderRadius: 8,
              padding: "0.75rem",
            }}
          >
            <legend style={{ padding: "0 0.35rem", fontWeight: 700 }}>
              Feature flags
            </legend>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                name="flag_team"
                defaultChecked={data.featureFlags.team}
                style={{ width: "auto", margin: 0 }}
              />
              Team (merchant)
            </label>
            <label
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <input
                type="checkbox"
                name="flag_multiStore"
                defaultChecked={data.featureFlags.multiStore}
                style={{ width: "auto", margin: 0 }}
              />
              Multi-store
            </label>
          </fieldset>
          <div className="admin-actions" style={{ marginTop: "0.85rem" }}>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={busy}
            >
              Save settings
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
