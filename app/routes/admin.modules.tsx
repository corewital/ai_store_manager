import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

import { requireRole } from "../services/admin/auth.server";
import {
  DEFAULT_MODULE_VISIBILITY,
  MODULE_VISIBILITY_LABELS,
  type AppModuleVisibility,
} from "../services/admin/module-visibility";
import {
  getModuleVisibility,
  setModuleVisibility,
} from "../services/admin/module-visibility.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRole(request, ["super_admin"]);
  return { visibility: await getModuleVisibility() };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireRole(request, ["super_admin"]);
  const form = await request.formData();
  const next = { ...DEFAULT_MODULE_VISIBILITY } as AppModuleVisibility;
  for (const key of Object.keys(DEFAULT_MODULE_VISIBILITY) as (keyof AppModuleVisibility)[]) {
    next[key] = form.get(key) === "on";
  }
  // Keep deferred modules off until ready (can re-enable later)
  if (form.get("force_hide_deferred") === "on") {
    next.navigation = false;
    next.theme = false;
    next.apps = false;
  }
  await setModuleVisibility(next);
  return { ok: true };
}

export default function AdminModulesPage() {
  const { visibility } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <h1>App modules</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            Master show/hide for the Shopify embedded app. Off = hidden from
            merchant nav, health tabs, and dashboard links.
          </p>
        </div>
      </div>

      {actionData?.ok && (
        <div className="admin-card" style={{ borderColor: "#86efac" }}>
          Module visibility saved.
        </div>
      )}

      <div className="admin-card" style={{ maxWidth: 560 }}>
        <Form method="post" className="admin-form">
          {(Object.keys(MODULE_VISIBILITY_LABELS) as (keyof AppModuleVisibility)[]).map(
            (key) => (
              <label
                key={key}
                style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
              >
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={visibility[key]}
                  style={{ width: "auto", margin: 0 }}
                />
                {MODULE_VISIBILITY_LABELS[key]}
              </label>
            ),
          )}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input
              type="checkbox"
              name="force_hide_deferred"
              defaultChecked
              style={{ width: "auto", margin: 0 }}
            />
            Keep Navigation / Theme / Apps hidden (until later setup)
          </label>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={busy}
            style={{ marginTop: "1rem" }}
          >
            Save visibility
          </button>
        </Form>
      </div>
    </div>
  );
}
