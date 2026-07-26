import { sql } from "drizzle-orm";
import {
  boolean,
  double,
  index,
  int,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

const timestamps = {
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
};

const softDelete = {
  deletedAt: timestamp("deleted_at", { mode: "date" }),
};

// —— Core ——

export const shops = mysqlTable(
  "shops",
  {
    id: int("id").autoincrement().primaryKey(),
    shopDomain: varchar("shop_domain", { length: 255 }).notNull().unique(),
    accessToken: text("access_token"),
    appApiUrl: varchar("app_api_url", { length: 512 }),
    plan: varchar("plan", { length: 64 }).notNull().default("free"),
    timezone: varchar("timezone", { length: 64 }).default("UTC"),
    installedAt: timestamp("installed_at", { mode: "date" }),
    uninstalledAt: timestamp("uninstalled_at", { mode: "date" }),
    frozenAt: timestamp("frozen_at", { mode: "date" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("shops_domain_idx").on(t.shopDomain)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    shopId: int("shop_id").references(() => shops.id),
    shop: varchar("shop", { length: 255 }).notNull(),
    state: text("state"),
    isOnline: boolean("is_online").notNull().default(false),
    scope: text("scope"),
    expires: timestamp("expires", { mode: "date" }),
    accessToken: text("access_token"),
    userId: varchar("user_id", { length: 64 }),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    email: varchar("email", { length: 255 }),
    accountOwner: boolean("account_owner"),
    locale: varchar("locale", { length: 32 }),
    collaborator: boolean("collaborator"),
    emailVerified: boolean("email_verified"),
    ...timestamps,
  },
  (t) => [index("sessions_shop_idx").on(t.shop)],
);

export const healthScores = mysqlTable(
  "health_scores",
  {
    id: int("id").autoincrement().primaryKey(),
    shopId: int("shop_id")
      .notNull()
      .references(() => shops.id),
    date: varchar("date", { length: 32 }).notNull(),
    overall: double("overall").notNull().default(0),
    products: double("products").default(0),
    seo: double("seo").default(0),
    images: double("images").default(0),
    inventory: double("inventory").default(0),
    collections: double("collections").default(0),
    navigation: double("navigation").default(0),
    theme: double("theme").default(0),
    apps: double("apps").default(0),
    performance: double("performance").default(0),
    ...timestamps,
  },
  (t) => [index("health_scores_shop_date_idx").on(t.shopId, t.date)],
);

export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id)
    .unique(),
  modulesEnabledJson: text("modules_enabled_json").default("{}"),
  scanFrequency: varchar("scan_frequency", { length: 32 }).default("daily"),
  aiEnabled: boolean("ai_enabled").default(true),
  notifyEmail: varchar("notify_email", { length: 255 }),
  notifyFrequency: varchar("notify_frequency", { length: 32 }).default("daily"),
  autoFixEnabled: boolean("auto_fix_enabled").default(false),
  designTier: varchar("design_tiers", { length: 32 }).default("standard"),
  geminiApiKey: varchar("gemini_api_key", { length: 255 }),
  aiTone: varchar("ai_tone", { length: 32 }).default("concise"),
  lastScannedCursor: text("last_scanned_cursor"),
  lastScannedAt: timestamp("last_scanned_at", { mode: "date" }),
  jobStatus: varchar("job_status", { length: 32 }).default("idle"),
  jobType: varchar("job_type", { length: 64 }),
  jobMessage: text("job_message"),
  jobStartedAt: timestamp("job_started_at", { mode: "date" }),
  jobFinishedAt: timestamp("job_finished_at", { mode: "date" }),
  ...timestamps,
});

export const billingSubscriptions = mysqlTable("billing_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  plan: varchar("plan", { length: 64 }).notNull().default("free"),
  shopifySubscriptionId: varchar("shopify_subscription_id", { length: 255 }),
  status: varchar("status", { length: 64 }).notNull().default("active"),
  trialEndsAt: timestamp("trial_ends_at", { mode: "date" }),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
  ...timestamps,
  ...softDelete,
});

export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 64 }).notNull().default("member"),
  invitedAt: timestamp("invited_at", { mode: "date" }),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
  ...timestamps,
  ...softDelete,
});

function issueTable(name: string) {
  return mysqlTable(
    name,
    {
      id: int("id").autoincrement().primaryKey(),
      shopId: int("shop_id")
        .notNull()
        .references(() => shops.id),
      resourceId: varchar("resource_id", { length: 255 }),
      resourceType: varchar("resource_type", { length: 64 }),
      issueCode: varchar("issue_code", { length: 128 }).notNull(),
      severity: varchar("severity", { length: 32 }).notNull().default("medium"),
      title: varchar("title", { length: 512 }).notNull(),
      detailsJson: text("details_json"),
      status: varchar("status", { length: 32 }).notNull().default("open"),
      resolvedAt: timestamp("resolved_at", { mode: "date" }),
      ...timestamps,
      ...softDelete,
    },
    (t) => [
      index(`${name}_shop_idx`).on(t.shopId),
      index(`${name}_status_idx`).on(t.status),
    ],
  );
}

export const productIssues = issueTable("product_issues");
export const seoIssues = issueTable("seo_issues");
export const imageIssues = issueTable("image_issues");
export const inventoryFlags = issueTable("inventory_flags");
export const collectionIssues = issueTable("collection_issues");
export const navigationIssues = issueTable("navigation_issues");
export const themeIssues = issueTable("theme_issues");

export const installedAppsSnapshot = mysqlTable("installed_apps_snapshot", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  snapshotJson: text("snapshot_json").notNull(),
  scannedAt: timestamp("scanned_at", { mode: "date" }).notNull(),
  ...timestamps,
});

export const performanceSnapshots = mysqlTable("performance_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  metricsJson: text("metrics_json").notNull(),
  suggestionsJson: text("suggestions_json"),
  scannedAt: timestamp("scanned_at", { mode: "date" }).notNull(),
  ...timestamps,
});

export const assistantConversations = mysqlTable("assistant_conversations", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  messagesJson: text("messages_json").notNull().default("[]"),
  ...timestamps,
  ...softDelete,
});

export const reportsSent = mysqlTable("reports_sent", {
  id: int("id").autoincrement().primaryKey(),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  type: varchar("type", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 512 }),
  bodyHtml: text("body_html"),
  summaryJson: text("summary_json"),
  sentAt: timestamp("sent_at", { mode: "date" }).notNull(),
  ...timestamps,
});

export const fixQueue = mysqlTable(
  "fix_queue",
  {
    id: int("id").autoincrement().primaryKey(),
    shopId: int("shop_id")
      .notNull()
      .references(() => shops.id),
    module: varchar("module", { length: 64 }).notNull(),
    issueId: int("issue_id"),
    action: varchar("action", { length: 128 }).notNull(),
    payloadJson: text("payload_json"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("fix_queue_shop_status_idx").on(t.shopId, t.status)],
);

export const agencyAccounts = mysqlTable("agency_accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerEmail: varchar("owner_email", { length: 255 }).notNull(),
  ...timestamps,
  ...softDelete,
});

export const agencyStores = mysqlTable("agency_stores", {
  id: int("id").autoincrement().primaryKey(),
  agencyId: int("agency_id")
    .notNull()
    .references(() => agencyAccounts.id),
  shopId: int("shop_id")
    .notNull()
    .references(() => shops.id),
  ...timestamps,
  ...softDelete,
});

export const webhookLogs = mysqlTable(
  "webhook_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    shopDomain: varchar("shop_domain", { length: 255 }),
    topic: varchar("topic", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ok"),
    payloadJson: text("payload_json"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("webhook_logs_topic_idx").on(t.topic)],
);

// —— Admin Core ——

export const roles = mysqlTable(
  "roles",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    description: text("description"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("roles_slug_idx").on(t.slug)],
);

export const permissions = mysqlTable(
  "permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("permissions_key_idx").on(t.key)],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    id: int("id").autoincrement().primaryKey(),
    roleId: int("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: int("permission_id")
      .notNull()
      .references(() => permissions.id),
    ...timestamps,
  },
  (t) => [index("role_permissions_role_perm_idx").on(t.roleId, t.permissionId)],
);

export const adminUsers = mysqlTable(
  "admin_users",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash"),
    name: varchar("name", { length: 255 }).notNull(),
    roleId: int("role_id")
      .notNull()
      .references(() => roles.id),
    inviteToken: varchar("invite_token", { length: 255 }),
    invitedAt: timestamp("invited_at", { mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { mode: "date" }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("admin_users_email_idx").on(t.email)],
);

export const activityLogs = mysqlTable(
  "activity_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    actorAdminUserId: int("actor_admin_user_id").references(() => adminUsers.id),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: varchar("entity_id", { length: 64 }),
    metaJson: text("meta_json"),
    ip: varchar("ip", { length: 64 }),
    ...timestamps,
  },
  (t) => [index("activity_logs_action_idx").on(t.action)],
);

export const appInstalls = mysqlTable(
  "app_installs",
  {
    id: int("id").autoincrement().primaryKey(),
    shopId: int("shop_id").references(() => shops.id),
    shopDomain: varchar("shop_domain", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    frozenAt: timestamp("frozen_at", { mode: "date" }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("app_installs_domain_idx").on(t.shopDomain)],
);

export const systemSettings = mysqlTable(
  "system_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    valueJson: text("value_json").notNull().default("{}"),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("system_settings_key_idx").on(t.key)],
);

export const fileUploads = mysqlTable("file_uploads", {
  id: int("id").autoincrement().primaryKey(),
  path: varchar("path", { length: 512 }).notNull(),
  mime: varchar("mime", { length: 128 }),
  size: int("size"),
  uploadedByAdminUserId: int("uploaded_by_admin_user_id").references(
    () => adminUsers.id,
  ),
  purpose: varchar("purpose", { length: 128 }),
  ...timestamps,
  ...softDelete,
});

export const apiCallLogs = mysqlTable(
  "api_call_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    shopDomain: varchar("shop_domain", { length: 255 }),
    operation: varchar("operation", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ok"),
    durationMs: int("duration_ms"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("api_call_logs_shop_idx").on(t.shopDomain)],
);

export const billingPlans = mysqlTable(
  "billing_plans",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    priceCents: int("price_cents").notNull().default(0),
    trialDays: int("trial_days").notNull().default(0),
    shopifyPlanHandle: varchar("shopify_plan_handle", { length: 128 }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("billing_plans_slug_idx").on(t.slug)],
);

export const planFeatures = mysqlTable(
  "plan_features",
  {
    id: int("id").autoincrement().primaryKey(),
    planId: int("plan_id")
      .notNull()
      .references(() => billingPlans.id),
    featureKey: varchar("feature_key", { length: 128 }).notNull(),
    limitValue: int("limit_value"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("plan_features_plan_key_idx").on(t.planId, t.featureKey)],
);

export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: int("id").autoincrement().primaryKey(),
    shopId: int("shop_id")
      .notNull()
      .references(() => shops.id),
    subject: varchar("subject", { length: 512 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    priority: varchar("priority", { length: 32 }).notNull().default("normal"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("support_tickets_shop_idx").on(t.shopId)],
);

export const supportMessages = mysqlTable(
  "support_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    ticketId: int("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    body: text("body").notNull(),
    fromAdminUserId: int("from_admin_user_id").references(() => adminUsers.id),
    fromMerchantEmail: varchar("from_merchant_email", { length: 255 }),
    ...timestamps,
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId)],
);

export const cronRunLogs = mysqlTable(
  "cron_run_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    jobName: varchar("job_name", { length: 64 }).notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    status: varchar("status", { length: 32 }).notNull().default("running"),
    shopsProcessed: int("shops_processed").default(0),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("cron_run_logs_job_idx").on(t.jobName)],
);

/** Multi-AI providers (OpenAI, Gemini, Claude, OpenRouter, Z.AI, BigModel, …). */
export const aiProviders = mysqlTable(
  "ai_providers",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 128 }).notNull(),
    baseUrl: varchar("base_url", { length: 512 }),
    defaultModel: varchar("default_model", { length: 128 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: int("priority").notNull().default(100),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("ai_providers_priority_idx").on(t.priority)],
);

/** Multiple API keys per provider — rotate on quota/rate-limit. */
export const aiApiKeys = mysqlTable(
  "ai_api_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    providerId: int("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    label: varchar("label", { length: 128 }),
    apiKey: text("api_key").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    cooldownUntil: timestamp("cooldown_until", { mode: "date" }),
    lastError: text("last_error"),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    successCount: int("success_count").notNull().default(0),
    failCount: int("fail_count").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("ai_api_keys_provider_idx").on(t.providerId),
    index("ai_api_keys_status_idx").on(t.status),
  ],
);
