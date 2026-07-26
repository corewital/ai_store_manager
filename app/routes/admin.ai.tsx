import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/client";
import { aiApiKeys, aiProviders } from "../db/schema";
import { requireRole } from "../services/admin/auth.server";
import {
  addApiKey,
  ensureDefaultProviders,
  listProvidersWithKeys,
} from "../services/ai/ai-admin.server";
import {
  getAiRouting,
  setAiRouting,
  testProviderKey,
} from "../services/ai/ai-router.server";

function iso(d: Date | null | undefined) {
  return d ? new Date(d).toISOString() : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireRole(request, ["super_admin"]);
  await ensureDefaultProviders();
  const [providers, routing] = await Promise.all([
    listProvidersWithKeys(),
    getAiRouting(),
  ]);
  return {
    routing,
    providers: providers.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      baseUrl: p.baseUrl,
      defaultModel: p.defaultModel,
      enabled: p.enabled,
      priority: p.priority,
      keys: p.keys.map((k) => ({
        ...k,
        cooldownUntil: iso(k.cooldownUntil),
        lastUsedAt: iso(k.lastUsedAt),
      })),
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireRole(request, ["super_admin"]);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "save_routing") {
      await setAiRouting({
        preferred: String(form.get("preferred") || "auto"),
        failover: form.get("failover") === "on",
      });
      return { ok: true, message: "Routing saved" };
    }

    if (intent === "toggle_provider") {
      const id = Number(form.get("providerId"));
      const enabled = String(form.get("enabled")) === "1";
      await db
        .update(aiProviders)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(aiProviders.id, id));
      return { ok: true, message: `Provider ${enabled ? "enabled" : "disabled"}` };
    }

    if (intent === "save_model") {
      const id = Number(form.get("providerId"));
      const defaultModel = String(form.get("defaultModel") || "").trim();
      const priority = Number(form.get("priority") || 100);
      await db
        .update(aiProviders)
        .set({ defaultModel, priority, updatedAt: new Date() })
        .where(eq(aiProviders.id, id));
      return { ok: true, message: "Model / priority updated" };
    }

    if (intent === "add_key") {
      const slug = String(form.get("providerSlug") || "");
      const apiKey = String(form.get("apiKey") || "").trim();
      const label = String(form.get("label") || "").trim();
      if (!apiKey) return { ok: false, message: "API key required" };
      await addApiKey(slug, apiKey, label || undefined);
      const test = await testProviderKey(slug, apiKey);
      return {
        ok: true,
        message: test.ok
          ? `Key added — test OK: ${test.message}`
          : `Key added — test FAILED: ${test.message}`,
        testOk: test.ok,
      };
    }

    if (intent === "test_key") {
      const keyId = Number(form.get("keyId"));
      const row = await db.query.aiApiKeys.findFirst({
        where: and(eq(aiApiKeys.id, keyId), isNull(aiApiKeys.deletedAt)),
      });
      if (!row) return { ok: false, message: "Key not found" };
      const provider = await db.query.aiProviders.findFirst({
        where: eq(aiProviders.id, row.providerId),
      });
      if (!provider) return { ok: false, message: "Provider missing" };
      const test = await testProviderKey(
        provider.slug,
        row.apiKey,
        provider.defaultModel,
        provider.baseUrl,
      );
      if (test.ok) {
        await db
          .update(aiApiKeys)
          .set({
            status: "active",
            cooldownUntil: null,
            lastError: null,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(aiApiKeys.id, keyId));
      }
      return {
        ok: test.ok,
        message: test.message,
        testOk: test.ok,
      };
    }

    if (intent === "delete_key") {
      const keyId = Number(form.get("keyId"));
      await db
        .update(aiApiKeys)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(aiApiKeys.id, keyId));
      return { ok: true, message: "Key removed" };
    }

    if (intent === "reset_key") {
      const keyId = Number(form.get("keyId"));
      await db
        .update(aiApiKeys)
        .set({
          status: "active",
          cooldownUntil: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(aiApiKeys.id, keyId));
      return { ok: true, message: "Key reactivated" };
    }

    return { ok: false, message: "Unknown action" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export default function AdminAiPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div>
          <h1>AI providers</h1>
          <p className="admin-page__lead" style={{ marginBottom: 0 }}>
            Multi-AI pool for the Shopify app + Admin. Preferred provider first;
            on free-tier / quota errors the next key, then next provider, is used
            automatically.
          </p>
        </div>
      </div>

      {actionData?.message && (
        <div
          className="admin-card"
          style={{
            borderColor:
              actionData.ok === false ||
              ("testOk" in actionData && actionData.testOk === false)
                ? "#f87171"
                : "#86efac",
          }}
        >
          {actionData.message}
        </div>
      )}

      <div className="admin-card" style={{ maxWidth: 640 }}>
        <div className="admin-card__title">Routing</div>
        <Form method="post" className="admin-form">
          <input type="hidden" name="intent" value="save_routing" />
          <label>
            Preferred provider
            <select name="preferred" defaultValue={data.routing.preferred}>
              <option value="auto">Auto (priority order)</option>
              {data.providers.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              name="failover"
              defaultChecked={data.routing.failover}
              style={{ width: "auto", margin: 0 }}
            />
            Failover to next provider when quota / rate-limit hits
          </label>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
            Save routing
          </button>
        </Form>
      </div>

      {data.providers.map((p) => (
        <div className="admin-card" key={p.id}>
          <div
            className="admin-card__title"
            style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}
          >
            <span>
              {p.name}{" "}
              <code style={{ fontSize: "0.75rem" }}>{p.slug}</code>{" "}
              {p.enabled ? (
                <span className="admin-badge admin-badge--ok">on</span>
              ) : (
                <span className="admin-badge admin-badge--err">off</span>
              )}
            </span>
            <Form method="post">
              <input type="hidden" name="intent" value="toggle_provider" />
              <input type="hidden" name="providerId" value={p.id} />
              <input type="hidden" name="enabled" value={p.enabled ? "0" : "1"} />
              <button type="submit" className="admin-btn" disabled={busy}>
                {p.enabled ? "Disable" : "Enable"}
              </button>
            </Form>
          </div>

          <Form method="post" className="admin-toolbar" style={{ marginBottom: "0.75rem" }}>
            <input type="hidden" name="intent" value="save_model" />
            <input type="hidden" name="providerId" value={p.id} />
            <input
              name="defaultModel"
              defaultValue={p.defaultModel}
              placeholder="model id"
              style={{ minWidth: 180 }}
            />
            <input
              name="priority"
              type="number"
              defaultValue={p.priority}
              title="Lower = first"
              style={{ width: 80 }}
            />
            <button type="submit" className="admin-btn" disabled={busy}>
              Save model
            </button>
          </Form>
          <p className="admin-page__lead" style={{ marginTop: 0 }}>
            Base: {p.baseUrl || "—"} · Keys: {p.keys.length}
          </p>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Key</th>
                <th>Status</th>
                <th>OK / Fail</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {p.keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.label || "—"}</td>
                  <td>
                    <code style={{ fontSize: "0.75rem" }}>{k.masked}</code>
                  </td>
                  <td>
                    <span className="admin-badge">{k.status}</span>
                    {k.lastError ? (
                      <div style={{ fontSize: "0.7rem", color: "var(--admin-muted)", maxWidth: 220 }}>
                        {k.lastError.slice(0, 100)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {k.successCount}/{k.failCount}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Form method="post">
                        <input type="hidden" name="intent" value="test_key" />
                        <input type="hidden" name="keyId" value={k.id} />
                        <button type="submit" className="admin-btn" disabled={busy}>
                          Test
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="reset_key" />
                        <input type="hidden" name="keyId" value={k.id} />
                        <button type="submit" className="admin-btn" disabled={busy}>
                          Reset
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete_key" />
                        <input type="hidden" name="keyId" value={k.id} />
                        <button type="submit" className="admin-btn" disabled={busy}>
                          Delete
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
              {p.keys.length === 0 && (
                <tr>
                  <td colSpan={5}>No keys — add below.</td>
                </tr>
              )}
            </tbody>
          </table>

          <Form method="post" className="admin-form" style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="intent" value="add_key" />
            <input type="hidden" name="providerSlug" value={p.slug} />
            <label>
              Add API key ({p.name})
              <input name="label" placeholder="Label (optional)" />
            </label>
            <label>
              <input
                name="apiKey"
                type="password"
                placeholder="Paste API key"
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              Add &amp; test key
            </button>
          </Form>
        </div>
      ))}
    </div>
  );
}
