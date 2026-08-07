import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db, insertReturningId } from "../client";
import {
  adminUsers,
  billingPlans,
  permissions,
  planFeatures,
  rolePermissions,
  roles,
  systemSettings,
} from "../schema";

const ROLE_DEFS = [
  { slug: "super_admin", name: "Super Admin", description: "Full access" },
  { slug: "admin", name: "Admin", description: "Manage installs, billing, settings" },
  { slug: "support", name: "Support", description: "Support tickets and installs" },
  { slug: "viewer", name: "Viewer", description: "Read-only audit access" },
] as const;

const PERM_DEFS = [
  { key: "users.manage", description: "Manage admin users" },
  { key: "installs.manage", description: "Manage app installs" },
  { key: "billing.manage", description: "Manage billing plans" },
  { key: "settings.manage", description: "Manage system settings" },
  { key: "support.reply", description: "Reply to support tickets" },
  { key: "audit.view", description: "View activity logs" },
] as const;

const ROLE_PERM_MAP: Record<string, string[]> = {
  super_admin: PERM_DEFS.map((p) => p.key),
  admin: [
    "users.manage",
    "installs.manage",
    "billing.manage",
    "settings.manage",
    "support.reply",
    "audit.view",
  ],
  support: ["installs.manage", "support.reply", "audit.view"],
  viewer: ["audit.view"],
};

const SETTINGS = [
  {
    key: "scan.products.max_per_run",
    valueJson: JSON.stringify({ limit: 500 }),
    description: "Max products scanned per cron chunk",
  },
  {
    key: "scan.daily_cap",
    valueJson: JSON.stringify({ limit: 2000 }),
    description: "Soft daily scan cap across catalog",
  },
  {
    key: "scan.chunk_size",
    valueJson: JSON.stringify({ limit: 100 }),
    description: "Products per scan cursor chunk",
  },
  {
    key: "ai.daily_cap",
    valueJson: JSON.stringify({ limit: 50 }),
    description: "Soft daily Gemini call cap per shop",
  },
];

const PLAN_DEFS = [
  {
    slug: "free",
    name: "Free",
    priceCents: 0,
    trialDays: 0,
    shopifyPlanHandle: "free",
    features: [
      { featureKey: "products_limit", limitValue: 50, enabled: true },
      { featureKey: "collections_limit", limitValue: 3, enabled: true },
      { featureKey: "ai_fixes_limit", limitValue: 50, enabled: true },
      { featureKey: "manual_scans_limit", limitValue: 3, enabled: true },
      { featureKey: "scan_cadence", limitValue: 0, enabled: true },
      { featureKey: "module_products", limitValue: null, enabled: true },
      { featureKey: "module_seo", limitValue: null, enabled: true },
      { featureKey: "module_images", limitValue: null, enabled: true },
      { featureKey: "module_collections", limitValue: null, enabled: true },
      { featureKey: "module_inventory", limitValue: null, enabled: false },
      { featureKey: "module_performance", limitValue: null, enabled: false },
      { featureKey: "module_assistant", limitValue: null, enabled: false },
      { featureKey: "module_reports", limitValue: null, enabled: true },
      { featureKey: "email_reports", limitValue: null, enabled: false },
      { featureKey: "scheduled_reports", limitValue: null, enabled: false },
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    priceCents: 499,
    trialDays: 7,
    shopifyPlanHandle: "starter",
    features: [
      { featureKey: "products_limit", limitValue: 300, enabled: true },
      { featureKey: "collections_limit", limitValue: 50, enabled: true },
      { featureKey: "ai_fixes_limit", limitValue: 200, enabled: true },
      { featureKey: "manual_scans_limit", limitValue: 15, enabled: true },
      { featureKey: "scan_cadence", limitValue: 1, enabled: true },
      { featureKey: "module_products", limitValue: null, enabled: true },
      { featureKey: "module_seo", limitValue: null, enabled: true },
      { featureKey: "module_images", limitValue: null, enabled: true },
      { featureKey: "module_collections", limitValue: null, enabled: true },
      { featureKey: "module_inventory", limitValue: null, enabled: false },
      { featureKey: "module_performance", limitValue: null, enabled: false },
      { featureKey: "module_assistant", limitValue: null, enabled: false },
      { featureKey: "module_reports", limitValue: null, enabled: true },
      { featureKey: "email_reports", limitValue: null, enabled: false },
      { featureKey: "scheduled_reports", limitValue: null, enabled: false },
    ],
  },
  {
    slug: "professional",
    name: "Professional",
    priceCents: 999,
    trialDays: 7,
    shopifyPlanHandle: "professional",
    features: [
      { featureKey: "products_limit", limitValue: 1000, enabled: true },
      { featureKey: "collections_limit", limitValue: 500, enabled: true },
      { featureKey: "ai_fixes_limit", limitValue: 500, enabled: true },
      { featureKey: "manual_scans_limit", limitValue: 5, enabled: true },
      { featureKey: "scan_cadence", limitValue: 2, enabled: true },
      { featureKey: "module_products", limitValue: null, enabled: true },
      { featureKey: "module_seo", limitValue: null, enabled: true },
      { featureKey: "module_images", limitValue: null, enabled: true },
      { featureKey: "module_collections", limitValue: null, enabled: true },
      { featureKey: "module_inventory", limitValue: null, enabled: true },
      { featureKey: "module_performance", limitValue: null, enabled: true },
      { featureKey: "module_assistant", limitValue: null, enabled: false },
      { featureKey: "module_reports", limitValue: null, enabled: true },
      { featureKey: "email_reports", limitValue: null, enabled: false },
      { featureKey: "scheduled_reports", limitValue: null, enabled: false },
    ],
  },
  {
    slug: "business",
    name: "Business",
    priceCents: 1999,
    trialDays: 14,
    shopifyPlanHandle: "business",
    features: [
      { featureKey: "products_limit", limitValue: 5000, enabled: true },
      { featureKey: "collections_limit", limitValue: 1000, enabled: true },
      { featureKey: "ai_fixes_limit", limitValue: 5000, enabled: true },
      { featureKey: "manual_scans_limit", limitValue: 2, enabled: true },
      { featureKey: "scan_cadence", limitValue: 3, enabled: true },
      { featureKey: "module_products", limitValue: null, enabled: true },
      { featureKey: "module_seo", limitValue: null, enabled: true },
      { featureKey: "module_images", limitValue: null, enabled: true },
      { featureKey: "module_collections", limitValue: null, enabled: true },
      { featureKey: "module_inventory", limitValue: null, enabled: true },
      { featureKey: "module_performance", limitValue: null, enabled: true },
      { featureKey: "module_assistant", limitValue: null, enabled: true },
      { featureKey: "module_reports", limitValue: null, enabled: true },
      { featureKey: "email_reports", limitValue: null, enabled: false },
      { featureKey: "scheduled_reports", limitValue: null, enabled: false },
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    priceCents: 9999,
    trialDays: 0,
    shopifyPlanHandle: "enterprise",
    features: [
      { featureKey: "products_limit", limitValue: null as number | null, enabled: true },
      { featureKey: "collections_limit", limitValue: null as number | null, enabled: true },
      { featureKey: "ai_fixes_limit", limitValue: 10000, enabled: true },
      { featureKey: "manual_scans_limit", limitValue: 5, enabled: true },
      { featureKey: "scan_cadence", limitValue: 3, enabled: true },
      { featureKey: "module_products", limitValue: null, enabled: true },
      { featureKey: "module_seo", limitValue: null, enabled: true },
      { featureKey: "module_images", limitValue: null, enabled: true },
      { featureKey: "module_collections", limitValue: null, enabled: true },
      { featureKey: "module_inventory", limitValue: null, enabled: true },
      { featureKey: "module_performance", limitValue: null, enabled: true },
      { featureKey: "module_assistant", limitValue: null, enabled: true },
      { featureKey: "module_reports", limitValue: null, enabled: true },
      { featureKey: "email_reports", limitValue: null, enabled: false },
      { featureKey: "scheduled_reports", limitValue: null, enabled: false },
    ],
  },
];

async function seedRoles() {
  const roleIds: Record<string, number> = {};
  for (const r of ROLE_DEFS) {
    const existing = await db.query.roles.findFirst({
      where: eq(roles.slug, r.slug),
    });
    if (existing) {
      roleIds[r.slug] = existing.id;
      continue;
    }
    roleIds[r.slug] = await insertReturningId(roles, {
      name: r.name,
      slug: r.slug,
      description: r.description,
    });
  }
  return roleIds;
}

async function seedPermissions() {
  const permIds: Record<string, number> = {};
  for (const p of PERM_DEFS) {
    const existing = await db.query.permissions.findFirst({
      where: eq(permissions.key, p.key),
    });
    if (existing) {
      permIds[p.key] = existing.id;
      continue;
    }
    permIds[p.key] = await insertReturningId(permissions, {
      key: p.key,
      description: p.description,
    });
  }
  return permIds;
}

async function seedRolePermissions(
  roleIds: Record<string, number>,
  permIds: Record<string, number>,
) {
  for (const [roleSlug, keys] of Object.entries(ROLE_PERM_MAP)) {
    const roleId = roleIds[roleSlug];
    for (const key of keys) {
      const permissionId = permIds[key];
      const existing = await db.query.rolePermissions.findFirst({
        where: and(
          eq(rolePermissions.roleId, roleId),
          eq(rolePermissions.permissionId, permissionId),
        ),
      });
      if (existing) continue;
      await db.insert(rolePermissions).values({ roleId, permissionId });
    }
  }
}

async function seedSuperAdmin(roleIds: Record<string, number>) {
  const email = (
    process.env.ADMIN_SEED_EMAIL || "admin@example.com"
  ).toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD || "ChangeMe123!";
  const existing = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, email),
  });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(adminUsers).values({
    email,
    passwordHash,
    name: "Super Admin",
    roleId: roleIds.super_admin,
    status: "active",
  });
}

async function seedSystemSettings() {
  for (const s of SETTINGS) {
    const existing = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, s.key),
    });
    if (existing) continue;
    await db.insert(systemSettings).values(s);
  }
}

async function seedBillingPlans() {
  for (const plan of PLAN_DEFS) {
    let planId: number;
    const existing = await db.query.billingPlans.findFirst({
      where: eq(billingPlans.slug, plan.slug),
    });
    if (existing) {
      planId = existing.id;
      await db
        .update(billingPlans)
        .set({
          name: plan.name,
          priceCents: plan.priceCents,
          trialDays: plan.trialDays,
          shopifyPlanHandle: plan.shopifyPlanHandle,
          updatedAt: new Date(),
        })
        .where(eq(billingPlans.id, planId));
    } else {
      planId = await insertReturningId(billingPlans, {
        slug: plan.slug,
        name: plan.name,
        priceCents: plan.priceCents,
        trialDays: plan.trialDays,
        shopifyPlanHandle: plan.shopifyPlanHandle,
      });
    }

    for (const f of plan.features) {
      const row = await db.query.planFeatures.findFirst({
        where: and(
          eq(planFeatures.planId, planId),
          eq(planFeatures.featureKey, f.featureKey),
        ),
      });
      if (row) {
        await db
          .update(planFeatures)
          .set({
            limitValue: f.limitValue,
            enabled: f.enabled,
            updatedAt: new Date(),
          })
          .where(eq(planFeatures.id, row.id));
      } else {
        await db.insert(planFeatures).values({
          planId,
          featureKey: f.featureKey,
          limitValue: f.limitValue,
          enabled: f.enabled,
        });
      }
    }
  }
}

async function main() {
  console.log("db:seed — starting…");
  const roleIds = await seedRoles();
  const permIds = await seedPermissions();
  await seedRolePermissions(roleIds, permIds);
  await seedSuperAdmin(roleIds);
  await seedSystemSettings();
  await seedBillingPlans();
  console.log("db:seed — done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
