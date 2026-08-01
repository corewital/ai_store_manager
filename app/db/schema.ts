import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  real,
  index,
} from "drizzle-orm/sqlite-core";

/** SQLite boolean stored as integer 0/1 */
function boolean(name: string) {
  return integer(name, { mode: "boolean" });
}

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$onUpdateFn(() => new Date()).default(sql`(unixepoch() * 1000)`),
};

const softDelete = {
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
};

// —— Core ——

export const shops = sqliteTable(
  "shops",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopDomain: text("shop_domain").notNull().unique(),
    accessToken: text("access_token"),
    appApiUrl: text("app_api_url"),
    plan: text("plan").notNull().default("free"),
    /** shopify = synced from billing; admin = plan override (do not wipe on sync) */
    planSource: text("plan_source").notNull().default("shopify"),
    timezone: text("timezone").default("UTC"),
    installedAt: integer("installed_at", { mode: "timestamp_ms" }),
    uninstalledAt: integer("uninstalled_at", { mode: "timestamp_ms" }),
    frozenAt: integer("frozen_at", { mode: "timestamp_ms" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("shops_domain_idx").on(t.shopDomain)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    shopId: integer("shop_id").references(() => shops.id),
    shop: text("shop").notNull(),
    state: text("state"),
    isOnline: boolean("is_online").notNull().default(false),
    scope: text("scope"),
    expires: integer("expires", { mode: "timestamp_ms" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    refreshTokenExpires: integer("refresh_token_expires", {
      mode: "timestamp_ms",
    }),
    userId: text("user_id"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    accountOwner: boolean("account_owner"),
    locale: text("locale"),
    collaborator: boolean("collaborator"),
    emailVerified: boolean("email_verified"),
    ...timestamps,
  },
  (t) => [index("sessions_shop_idx").on(t.shop)],
);

export const healthScores = sqliteTable(
  "health_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    date: text("date").notNull(),
    overall: real("overall").notNull().default(0),
    products: real("products").default(0),
    seo: real("seo").default(0),
    images: real("images").default(0),
    inventory: real("inventory").default(0),
    collections: real("collections").default(0),
    navigation: real("navigation").default(0),
    theme: real("theme").default(0),
    apps: real("apps").default(0),
    performance: real("performance").default(0),
    ...timestamps,
  },
  (t) => [index("health_scores_shop_date_idx").on(t.shopId, t.date)],
);

export const appSettings = sqliteTable("app_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id)
    .unique(),
  modulesEnabledJson: text("modules_enabled_json").default("{}"),
  scanFrequency: text("scan_frequency").default("daily"),
  aiEnabled: boolean("ai_enabled").default(true),
  notifyEmail: text("notify_email"),
  notifyFrequency: text("notify_frequency").default("daily"),
  autoFixEnabled: boolean("auto_fix_enabled").default(false),
  designTier: text("design_tiers").default("standard"),
  geminiApiKey: text("gemini_api_key"),
  aiTone: text("ai_tone").default("concise"),
  lastScannedCursor: text("last_scanned_cursor"),
  lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }),
  jobStatus: text("job_status").default("idle"),
  jobType: text("job_type"),
  jobMessage: text("job_message"),
  jobStartedAt: integer("job_started_at", { mode: "timestamp_ms" }),
  jobFinishedAt: integer("job_finished_at", { mode: "timestamp_ms" }),
  /** Manual Scan Now counter (period-based for paid; lifetime for Free). */
  manualScanCount: integer("manual_scan_count").notNull().default(0),
  /** Period key for manual scans: lifetime | YYYY-MM | YYYY-MM-DD (week start) | YYYY-MM-DD */
  manualScanPeriodKey: text("manual_scan_period_key"),
  ...timestamps,
});

export const billingSubscriptions = sqliteTable("billing_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  plan: text("plan").notNull().default("free"),
  shopifySubscriptionId: text("shopify_subscription_id"),
  status: text("status").notNull().default("active"),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  ...timestamps,
  ...softDelete,
});

export const teamMembers = sqliteTable("team_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
  ...timestamps,
  ...softDelete,
});

function issueTable(name: string) {
  return sqliteTable(
    name,
    {
      id: integer("id").primaryKey({ autoIncrement: true }),
      shopId: integer("shop_id")
        .notNull()
        .references(() => shops.id),
      resourceId: text("resource_id"),
      resourceType: text("resource_type"),
      issueCode: text("issue_code").notNull(),
      severity: text("severity").notNull().default("medium"),
      title: text("title").notNull(),
      detailsJson: text("details_json"),
      status: text("status").notNull().default("open"),
      resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
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

export const installedAppsSnapshot = sqliteTable("installed_apps_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  snapshotJson: text("snapshot_json").notNull(),
  scannedAt: integer("scanned_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

export const performanceSnapshots = sqliteTable("performance_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  metricsJson: text("metrics_json").notNull(),
  suggestionsJson: text("suggestions_json"),
  scannedAt: integer("scanned_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

export const assistantConversations = sqliteTable("assistant_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  messagesJson: text("messages_json").notNull().default("[]"),
  ...timestamps,
  ...softDelete,
});

export const reportsSent = sqliteTable("reports_sent", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  type: text("type").notNull(),
  subject: text("subject"),
  bodyHtml: text("body_html"),
  summaryJson: text("summary_json"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

export const fixQueue = sqliteTable(
  "fix_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    module: text("module").notNull(),
    issueId: integer("issue_id"),
    action: text("action").notNull(),
    payloadJson: text("payload_json"),
    status: text("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("fix_queue_shop_status_idx").on(t.shopId, t.status)],
);

export const agencyAccounts = sqliteTable("agency_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  ...timestamps,
  ...softDelete,
});

export const agencyStores = sqliteTable("agency_stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agencyId: integer("agency_id")
    .notNull()
    .references(() => agencyAccounts.id),
  shopId: integer("shop_id")
    .notNull()
    .references(() => shops.id),
  ...timestamps,
  ...softDelete,
});

export const webhookLogs = sqliteTable(
  "webhook_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopDomain: text("shop_domain"),
    topic: text("topic").notNull(),
    status: text("status").notNull().default("ok"),
    payloadJson: text("payload_json"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("webhook_logs_topic_idx").on(t.topic)],
);

// —— Admin Core ——

export const roles = sqliteTable(
  "roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("roles_slug_idx").on(t.slug)],
);

export const permissions = sqliteTable(
  "permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("permissions_key_idx").on(t.key)],
);

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id),
    ...timestamps,
  },
  (t) => [index("role_permissions_role_perm_idx").on(t.roleId, t.permissionId)],
);

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    inviteToken: text("invite_token"),
    invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("admin_users_email_idx").on(t.email)],
);

export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorAdminUserId: integer("actor_admin_user_id").references(() => adminUsers.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metaJson: text("meta_json"),
    ip: text("ip"),
    ...timestamps,
  },
  (t) => [index("activity_logs_action_idx").on(t.action)],
);

export const appInstalls = sqliteTable(
  "app_installs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id").references(() => shops.id),
    shopDomain: text("shop_domain").notNull().unique(),
    status: text("status").notNull().default("active"),
    frozenAt: integer("frozen_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
);

export const systemSettings = sqliteTable(
  "system_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    valueJson: text("value_json").notNull().default("{}"),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("system_settings_key_idx").on(t.key)],
);

export const fileUploads = sqliteTable("file_uploads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull(),
  mime: text("mime"),
  size: integer("size"),
  uploadedByAdminUserId: integer("uploaded_by_admin_user_id").references(
    () => adminUsers.id,
  ),
  purpose: text("purpose"),
  ...timestamps,
  ...softDelete,
});

export const apiCallLogs = sqliteTable(
  "api_call_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopDomain: text("shop_domain"),
    operation: text("operation").notNull(),
    status: text("status").notNull().default("ok"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("api_call_logs_shop_idx").on(t.shopDomain)],
);

export const billingPlans = sqliteTable(
  "billing_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    trialDays: integer("trial_days").notNull().default(0),
    shopifyPlanHandle: text("shopify_plan_handle"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("billing_plans_slug_idx").on(t.slug)],
);

export const planFeatures = sqliteTable(
  "plan_features",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => billingPlans.id),
    featureKey: text("feature_key").notNull(),
    limitValue: integer("limit_value"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("plan_features_plan_key_idx").on(t.planId, t.featureKey)],
);

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shops.id),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("support_tickets_shop_idx").on(t.shopId)],
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    body: text("body").notNull(),
    fromAdminUserId: integer("from_admin_user_id").references(() => adminUsers.id),
    fromMerchantEmail: text("from_merchant_email"),
    ...timestamps,
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId)],
);

export const cronRunLogs = sqliteTable(
  "cron_run_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobName: text("job_name").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    status: text("status").notNull().default("running"),
    shopsProcessed: integer("shops_processed").default(0),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (t) => [index("cron_run_logs_job_idx").on(t.jobName)],
);

/** Multi-AI providers (OpenAI, Gemini, Claude, OpenRouter, Z.AI, BigModel, …). */
export const aiProviders = sqliteTable(
  "ai_providers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    baseUrl: text("base_url"),
    defaultModel: text("default_model").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("ai_providers_priority_idx").on(t.priority)],
);

/** Multiple API keys per provider — rotate on quota/rate-limit. */
export const aiApiKeys = sqliteTable(
  "ai_api_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => aiProviders.id),
    label: text("label"),
    apiKey: text("api_key").notNull(),
    status: text("status").notNull().default("active"),
    cooldownUntil: integer("cooldown_until", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    successCount: integer("success_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("ai_api_keys_provider_idx").on(t.providerId),
    index("ai_api_keys_status_idx").on(t.status),
  ],
);
