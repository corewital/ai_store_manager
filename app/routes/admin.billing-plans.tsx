import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { and, eq } from "drizzle-orm";

import { db, insertReturningId } from "../db/client";
import { activityLogs, billingPlans, planFeatures } from "../db/schema";
import { can, requireAdmin } from "../services/admin/auth.server";
import { PLAN_FEATURE_KEYS } from "../config/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const plans = await db
    .select()
    .from(billingPlans)
    .orderBy(billingPlans.id);

  const withFeatures = [];
  for (const p of plans) {
    const feats = await db.query.planFeatures.findMany({
      where: eq(planFeatures.planId, p.id),
    });
    const byKey = new Map(feats.map((f) => [f.featureKey, f]));
    withFeatures.push({
      ...p,
      features: PLAN_FEATURE_KEYS.map((meta) => {
        const row = byKey.get(meta.key);
        return {
          key: meta.key,
          label: meta.label,
          id: row?.id ?? null,
          limitValue: row?.limitValue ?? null,
          enabled: row?.enabled ?? false,
        };
      }),
    });
  }
  return { plans: withFeatures };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAdmin(request);
  if (!(await can(request, "billing.manage"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "update");

  if (intent === "create") {
    const slug = String(form.get("slug") || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    const name = String(form.get("name") || "").trim();
    if (!slug || !name)
      return json({ error: "Slug and name required" }, { status: 400 });
    const id = await insertReturningId(billingPlans, {
      slug,
      name,
      priceCents: Number(form.get("priceCents") || 0),
      trialDays: Number(form.get("trialDays") || 0),
      shopifyPlanHandle: String(form.get("shopifyPlanHandle") || "") || null,
    });
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "billing_plan_create",
      entityType: "billing_plan",
      entityId: String(id),
    });
    return redirect("/admin/billing-plans");
  }

  const id = Number(form.get("id"));

  if (intent === "deactivate") {
    await db
      .update(billingPlans)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(billingPlans.id, id));
    return redirect("/admin/billing-plans");
  }

  if (intent === "activate") {
    await db
      .update(billingPlans)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(billingPlans.id, id));
    return redirect("/admin/billing-plans");
  }

  if (intent === "update_features") {
    for (const meta of PLAN_FEATURE_KEYS) {
      const enabled = form.get(`enabled_${meta.key}`) === "on";
      const raw = String(form.get(`limit_${meta.key}`) ?? "").trim();
      const limitValue = raw === "" ? null : Number(raw);
      const existing = await db.query.planFeatures.findFirst({
        where: and(
          eq(planFeatures.planId, id),
          eq(planFeatures.featureKey, meta.key),
        ),
      });
      if (existing) {
        await db
          .update(planFeatures)
          .set({ enabled, limitValue, updatedAt: new Date() })
          .where(eq(planFeatures.id, existing.id));
      } else {
        await db.insert(planFeatures).values({
          planId: id,
          featureKey: meta.key,
          enabled,
          limitValue,
        });
      }
    }
    await db.insert(activityLogs).values({
      actorAdminUserId: user.id,
      action: "billing_plan_features_update",
      entityType: "billing_plan",
      entityId: String(id),
    });
    return redirect("/admin/billing-plans");
  }

  await db
    .update(billingPlans)
    .set({
      name: String(form.get("name") || ""),
      priceCents: Number(form.get("priceCents") || 0),
      trialDays: Number(form.get("trialDays") || 0),
      shopifyPlanHandle: String(form.get("shopifyPlanHandle") || "") || null,
      updatedAt: new Date(),
    })
    .where(eq(billingPlans.id, id));

  return redirect("/admin/billing-plans");
}

export default function AdminBillingPlans() {
  const { plans } = useLoaderData<typeof loader>();

  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Edit plan prices and per-plan limits (products, collections, AI fixes,
        module visibility). Changes apply to merchant gating immediately.
      </p>

      <div className="admin-card">
        <div className="admin-card__title">Add plan</div>
        <Form method="post" className="admin-form admin-form--inline">
          <input type="hidden" name="intent" value="create" />
          <label>
            Slug
            <input name="slug" required placeholder="starter" />
          </label>
          <label>
            Name
            <input name="name" required placeholder="Starter" />
          </label>
          <label>
            Price (¢)
            <input name="priceCents" type="number" defaultValue={0} />
          </label>
          <label>
            Trial days
            <input name="trialDays" type="number" defaultValue={0} />
          </label>
          <label>
            Shopify handle
            <input name="shopifyPlanHandle" placeholder="optional" />
          </label>
          <button type="submit" className="admin-btn admin-btn--primary">
            Create plan
          </button>
        </Form>
      </div>

      <div className="admin-grid-2">
        {plans.map((p) => {
          const active = !p.deletedAt;
          return (
            <div
              key={p.id}
              className="admin-card"
              style={{ opacity: active ? 1 : 0.72 }}
            >
              <div className="admin-card__title">
                {p.name}{" "}
                <span className="admin-badge">{p.slug}</span>{" "}
                <span
                  className={
                    active
                      ? "admin-badge admin-badge--ok"
                      : "admin-badge admin-badge--warn"
                  }
                >
                  {active ? "active" : "inactive"}
                </span>
              </div>

              <Form method="post" className="admin-form">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="intent" value="update" />
                <label>
                  Name
                  <input name="name" defaultValue={p.name} />
                </label>
                <label>
                  Price (¢) (−1 = contact sales)
                  <input
                    name="priceCents"
                    type="number"
                    defaultValue={p.priceCents}
                  />
                </label>
                <label>
                  Trial days
                  <input
                    name="trialDays"
                    type="number"
                    defaultValue={p.trialDays}
                  />
                </label>
                <label>
                  Shopify handle
                  <input
                    name="shopifyPlanHandle"
                    defaultValue={p.shopifyPlanHandle ?? ""}
                  />
                </label>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Save plan
                </button>
              </Form>

              <Form method="post" className="admin-form" style={{ marginTop: "1rem" }}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="intent" value="update_features" />
                <div className="admin-card__title" style={{ fontSize: "0.95rem" }}>
                  Limits & modules
                </div>
                {p.features.map((f) => (
                  <div
                    key={f.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 90px 70px",
                      gap: "0.5rem",
                      alignItems: "center",
                      marginBottom: "0.35rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span>{f.label}</span>
                    <input
                      name={`limit_${f.key}`}
                      type="number"
                      placeholder="∞"
                      defaultValue={f.limitValue ?? ""}
                    />
                    <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name={`enabled_${f.key}`}
                        defaultChecked={f.enabled}
                      />
                      on
                    </label>
                  </div>
                ))}
                <button type="submit" className="admin-btn admin-btn--primary">
                  Save limits
                </button>
              </Form>

              <Form method="post" style={{ marginTop: "0.75rem" }}>
                <input type="hidden" name="id" value={p.id} />
                <input
                  type="hidden"
                  name="intent"
                  value={active ? "deactivate" : "activate"}
                />
                <button type="submit" className="admin-btn">
                  {active ? "Deactivate" : "Activate"}
                </button>
              </Form>
            </div>
          );
        })}
      </div>
      {plans.length === 0 && (
        <div className="admin-card">No billing plans yet.</div>
      )}
    </div>
  );
}
