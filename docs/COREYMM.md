# CoreYMM — Year Make Model

Bootstrap for a **new** Shopify app repo. Same shell as CorePilot AI (`ai_store_manager`): Admin Core, DB, auth, webhooks, settings, billing — domain = **YMM fitment** (not health scanners).

**Name:** CoreYMM · **Brand:** CoreWital · **Do not** share CorePilot Turso / Partner app / Vercel project.

---

## Stack (lock)

Remix · `@shopify/shopify-app-remix` · Polaris · App Bridge · Drizzle + Turso · Vercel Cron · Resend · Admin cookie session · soft-delete `deletedAt` · config → `systemSettings` / `appSettings` / `planFeatures`

```
app/routes/app.* | admin.* + AdminLayout | services/**/*.server.ts | db/schema.ts
shopify.app.toml (prod deploy) | shopify.app.dev.toml (dev)
CURRENT.md · PROGRESS.md · START.md · docs/DECISIONS.md
```

---

## Copy-paste: NEW PROJECT CREATE PROMPT

Paste into Cursor in an **empty / new** CoreYMM repo. One phase at a time; stop after each; update `CURRENT.md` / `PROGRESS.md`.

```
You are building CoreYMM — Shopify embedded Year/Make/Model fitment app (CoreWital).
Reference patterns from sibling repo ai_store_manager (CorePilot) — COPY STRUCTURE, adapt names; do NOT port health-score/SEO/image-fix/assistant unless asked.

STACK: Remix + shopify-app-remix + Polaris + App Bridge; Drizzle + Turso (libSQL); Vercel + Cron; Resend; soft-delete deletedAt; business values in systemSettings/appSettings/planFeatures only.

RULES: One CURRENT.md task only. Commit only if asked. Gemini=text only; sharp=pixels only. Separate Admin cookie session ≠ Shopify session.

=== PHASE ORDER (do in order) ===

P1 SCAFFOLD
- Shopify Remix app template; name CoreYMM
- shopify.app.toml + shopify.app.dev.toml; automatically_update_urls_on_dev false on prod
- .env.example: SHOPIFY_API_KEY/SECRET, SHOPIFY_APP_URL, SCOPES, TURSO_*, CRON_SECRET, RESEND_API_KEY, ADMIN_SESSION_SECRET
- vercel.json crons stubs; package.json scripts: db:migrate, db:seed, db:push-live, deploy
- START.md / CURRENT.md / PROGRESS.md / docs/DECISIONS.md

P2 DB SCHEMA (app/db/schema.ts) — create all:
CORE: shops, sessions, appSettings, billingSubscriptions, teamMembers, webhookLogs, cronRunLogs, apiCallLogs, fileUploads
ADMIN: adminUsers, roles, permissions, rolePermissions, activityLogs, appInstalls, systemSettings
BILLING: billingPlans, planFeatures
SUPPORT: supportTickets, supportMessages
AI (optional keys pool): aiProviders, aiApiKeys
YMM DOMAIN: ymmYears, ymmMakes, ymmModels, ymmFitments (productId/shopifyProductGid ↔ year/make/model), ymmImportJobs
Indexes + unique shop_domain; all removable rows have deletedAt
Turso client + TursoSessionStorage wired in shopify.server.ts

P3 SHOPIFY AUTH (merchant)
- OAuth via shopify-app-remix; afterAuth → ensureShop + appInstalls row
- Embedded app shell app.tsx (Polaris Frame/Nav)
- Nav stubs: Dashboard, Fitment, Makes, Models, Products, Import, Settings, Billing, Support
- Routes app._index, app.fitment, app.makes, app.models, app.products, app.import, app.settings.*, app.billing, app.support

P4 WEBHOOKS (HMAC authenticate.webhook; invalid → 401; log webhookLogs)
- app/uninstalled → soft-delete shop + clear token
- app/scopes_update
- products/create|update|delete → queue fitment resync job (stub OK)
- MANDATORY compliance ONE subscription:
  compliance_topics = ["customers/data_request","customers/redact","shop/redact"]
  uri = "/webhooks/compliance"
  Route: loader GET health JSON; action handles all 3 topics; shop/redact wipes shop data
- Deploy TOML: npm run deploy before App Store submit

P5 ADMIN AUTH + PANEL
- Cookie session (bcrypt); invite-only signup; requireAdmin / requireRole / can(permission)
- AdminLayout: Header, Sidebar, Navbar, Footer; FontAwesome; SweetAlert2
- Routes: admin.login/logout, admin._index (tiles), admin.users, admin.roles, admin.installs (freeze/rescan/impersonate+audit), admin.audit-log
- admin.billing-plans + planFeatures CRUD
- admin.system-settings (key/value UI from settings schema)
- admin.webhooks-health, admin.api-logs, admin.support-tickets + reply (Resend)
- admin.ymm.* (years/makes/models global catalog if shared) OR shop-scoped later
- DataTable server whitelist + Filters + StatusToggle (reuse CorePilot pattern)

P6 ADMIN / APP SETTINGS KEYS (seed systemSettings + getSetting/setSetting)
app.name, app.support_email, app.privacy_url
billing.trial_days, billing.default_plan
cron.daily_enabled, cron.secret_hint
ymm.year_min, ymm.year_max, ymm.csv_max_rows, ymm.metafield_namespace, ymm.metafield_key
email.from_name, email.from_address
features.theme_extension_enabled
planFeatures caps: max_products_mapped, max_ymm_rows, max_imports_per_month, theme_extension

P7 MERCHANT SETTINGS PAGES
general | notifications | billing | team | ymm (metafield mapping, year range defaults)

P8 PRODUCT SCAN / FITMENT SYNC (CoreYMM “scan” — not CorePilot health)
- Cron api.cron.daily-scan + api.cron.process-jobs (CRON_SECRET Bearer)
- Job: page products → read/write YMM metafields → upsert ymmFitments → flag unmapped products
- Merchant UI: unmapped list, bulk assign Year/Make/Model, one-click sync
- plan gate via getShopPlan / planFeatures

P9 YMM DOMAIN UI + CSV
- CRUD makes/models/years; CSV import/export; import job queue
- Theme app extension stub: vehicle picker / fits-my-vehicle filter

P10 BILLING + HARDENING
- Shopify Billing API tiers Free/Starter/Pro; requirePlan on premium actions
- Privacy page; compliance verified; live Turso only on Vercel; db:push-live ALTER-only
- Separate Partner app + DB from CorePilot

After each phase: check PROGRESS line, set CURRENT.md to next unchecked, STOP.
```

---

## Admin menu (target)

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard tiles (installs, webhooks, jobs, tickets) |
| `/admin/installs` | Shops: freeze, rescan, impersonate |
| `/admin/users` `/admin/roles` | Invite, soft-delete, permissions |
| `/admin/billing-plans` | Plans + planFeatures caps |
| `/admin/system-settings` | All config keys |
| `/admin/webhooks-health` | Last deliveries / failures |
| `/admin/support-tickets` | Reply via Resend |
| `/admin/audit-log` | Impersonation + admin actions |
| `/admin/ymm/*` | Global YMM catalog (optional) |

---

## Merchant menu (target)

Dashboard · Fitment (unmapped/mapped) · Makes · Models · Products · Import · Settings · Billing · Support

---

## Compliance TOML (required)

```toml
[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "/webhooks/compliance"
```

Scopes start: `read_products,write_products,read_content,write_content` (+ metafields when wiring).

---

## Env

`SHOPIFY_API_KEY` · `SHOPIFY_API_SECRET` · `SHOPIFY_APP_URL` · `SCOPES` · `TURSO_DATABASE_URL` · `TURSO_AUTH_TOKEN` · `CRON_SECRET` · `RESEND_API_KEY` · `ADMIN_SESSION_SECRET`

---

## Kickoff

1. New folder/repo → paste prompt → run **P1** only  
2. New Turso DB + Partner app + Vercel project  
3. Mirror CorePilot files by **diff** (AdminLayout, DataTable, settings, compliance) — rename branding to CoreYMM  
4. `PROGRESS.md` = P1–P10 checkboxes; `CURRENT.md` = P1  

## Out of scope v1

CorePilot health score, SEO/image one-click fix, store assistant, agency multi-store.
