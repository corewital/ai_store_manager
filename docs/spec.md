# AI Store Manager — Spec (section reference)

Read **only the section** named in `CURRENT.md`. Full protocol: Sec 32 / `PROGRESS.md`.

---

## Sec 1 — Stack

React + Polaris + App Bridge · Remix `@shopify/shopify-app-remix` · Turso + Drizzle · Vercel Cron · Gemini text-only · sharp for pixels · Admin GraphQL, Webhooks, Billing API, Theme App Extension / App Embed.

**Hard:** image pixels → `sharp`. Gemini → text only (SEO, alt wording, chat, recommendations).

---

## Sec 2 — Folders

```
app/routes/          app.*, admin.*, webhooks.*, api.cron.*, api.fix.*, api.admin.*
app/db/              schema.ts, client.ts, migrations/, seeders/
app/services/        shopify/, scanners/, ai/, images/, scoring/, email/, admin/, storage/
app/components/      layout/, datatable/, ui/, module UI
app/styles/tokens/   standard.css, premium.css, enterprise.css
app/lib/             sweetalert.client.ts, fontawesome.client.ts
extensions/theme-app-embed/
drizzle.config.ts, vercel.json, shopify.app.toml
```

---

## Sec 3 — shopify.app.toml

- `embedded = true`
- Scopes: `read_products,write_products,read_inventory,write_inventory,read_orders,read_customers,read_content,write_content,read_themes,write_themes,read_online_store_navigation` (+ extras as needed: locales, price_rules, discounts, shipping, reports)
- Webhooks api_version `2025-01`: app/uninstalled, products create/update/delete, orders/create, app_scopes/update
- Later GDPR: customers/data_request, customers/redact, shop/redact
- App proxy optional: prefix apps, subpath store-manager

---

## Sec 4 — Env (secrets only)

```
SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, SCOPES
TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
GEMINI_API_KEY, CRON_SECRET, RESEND_API_KEY
ADMIN_SESSION_SECRET
```

Business config ≠ env → `systemSettings` / `appSettings` (Sec 28).

---

## Sec 5 — Merchant schema (Drizzle)

- `shops` (shopDomain, accessToken, plan, installedAt, uninstalledAt, timezone)
- `sessions` (Shopify session fields + shopId)
- `healthScores` (date + overall + per-module scores)
- `productIssues`, `seoIssues`, `imageIssues`, `inventoryFlags`, `collectionIssues`, `navigationIssues`, `themeIssues`
- `installedAppsSnapshot`, `performanceSnapshots`, `assistantConversations`, `reportsSent`, `fixQueue`
- `agencyAccounts`, `agencyStores`
- `appSettings` (modulesEnabledJson, scanFrequency, aiEnabled, notifyEmail, notifyFrequency, autoFixEnabled, designTier, lastScannedCursor, …)
- `billingSubscriptions`, `teamMembers`

---

## Sec 6 — Auth (merchant)

Custom `TursoSessionStorage`: storeSession, loadSession, deleteSession, deleteSessions, findSessionsByShop.  
Every `app.*` loader/action: `authenticate.admin(request)`.

---

## Sec 7 — Jobs

`vercel.json`:
- `/api/cron/daily-scan` — `0 3 * * *`
- `/api/cron/weekly-report` — `0 4 * * 0`

Daily: verify `CRON_SECRET` → active paid shops → scanners chain → health score → daily email. Free = manual only.  
Webhooks re-scan single resource. Large catalogs: bulkOperation or cursor chunks.

---

## Sec 8 — Gemini

Model: `gemini-2.0-flash` via `@google/generative-ai`. Structured JSON prompts; strip fences; try/catch parse.  
Uses: SEO title/desc, alt wording, assistant, report bullets, product copy suggestions. Never pixels.

---

## Sec 9 — Image optimize

`services/images/optimize.server.ts`: sharp resize/compress/WebP; re-upload via stagedUploads + productImageUpdate. Alt string from Gemini separately.

---

## Sec 10 — Billing tiers

| Plan | Price | Trial |
|---|---|---|
| free | $0 | — limits in app (100 products, manual scan) |
| starter | $4.99 | 7d |
| professional | $9.99 | 7d |
| business | $19.99 | 7d |

`appSubscriptionCreate`; Multi-Store = Business; AI fixes = Professional+.

---

## Sec 11 — Merchant settings routes

`app.settings.general|modules|ai|notifications|billing|team` — see original module list. Theme embed = on/off only.

---

## Sec 12 — Modules (trigger → data → fix)

1. Health Score — after scan → healthScores — UI ring — no fix  
2. Products — cron+webhook → productIssues — AI text + productUpdate  
3. SEO — cron → seoIssues — Gemini + productUpdate/metafieldsSet  
4. Images — cron+webhook → imageIssues — sharp + Gemini alt + productImageUpdate  
5. Inventory — cron+orders → inventoryFlags — restock/archive/discount/bundle suggest  
6. Collections — cron → collectionIssues  
7. Navigation — cron → navigationIssues  
8. Theme — weekly → themeIssues — no auto theme file edit  
9. Apps — weekly → installedAppsSnapshot — theme blocks only (no full installed-apps API)  
10. Performance — cron → performanceSnapshots — suggest only  
11. Assistant — on-demand → assistantConversations — Gemini + real context  
12. Daily report — after daily-scan → reportsSent — Resend  
13. Fix queue — cross-cut → fixQueue — Fix All  
14. Weekly report — Sunday cron → reportsSent — Gemini bullets  
15. Multi-store — Business → agency* — aggregate healthScores  

---

## Sec 13 — Deploy

Vercel env + Turso + drizzle push + `shopify app deploy`. Point application_url to Vercel.

---

## Sec 16 — MVC map

Controller=routes · Model=schema+services · View=components · Migration=drizzle · Seeder=`npm run db:seed` · Middleware=loader guards.

---

## Sec 17 — Admin Core

### Tables
adminUsers, roles, permissions, rolePermissions, activityLogs, appInstalls, systemSettings, fileUploads, webhookLogs, apiCallLogs, billingPlans, planFeatures, supportTickets, supportMessages. Soft delete via `deletedAt`.

### RBAC
super_admin · admin · support · viewer — `requireAdmin`, `requireRole`, `can(perm)`.

### Auth
Invite-only signup · bcrypt · separate cookie session · log login_success/failed.

### Pages
admin.login/logout/signup, admin._index, installs, users, users.$id, roles, audit-log, settings, billing-plans, webhooks-health, support-tickets, support-tickets.$id, profile.

### Installs actions
View, force re-scan, freeze/unfreeze, impersonate (audit).

---

## Sec 18 — DataTable

Server: `datatable.server.ts` + whitelist config.  
`GET /api/admin/datatable/:table?...`  
Client: IndexTable-based DataTable + filters + ListGridToggle + StatusToggle. All listings reuse this.

---

## Sec 19 — FA + SweetAlert2

Tree-shaken FA wrapper. `confirmDelete`, `confirmToggleStatus`, `toastSuccess`, `toastError`. Replace window.confirm/alert and confirm-only Polaris Modals.

---

## Sec 20 — Status toggle

`POST /api/admin/toggle-status` `{table,id,field,value}` whitelist + activityLogs. Inline update, no full reload.

---

## Sec 21 — Local storage

`storage/uploads/...` staging only (Vercel ephemeral). Persist via Shopify upload or email stream. Index in `fileUploads`.

---

## Sec 22 — AdminLayout

Header + Sidebar + Navbar + Body + Footer — **admin.* only**. Merchant keeps App Bridge Frame/Navigation.

---

## Sec 23–28 — Settings

`getSetting` / `setSetting`; shop overrides then system defaults. `settings.schema.ts` shared. design.tier tokens in CSS vars. No hardcoded business numbers.

---

## Sec 29 — Plans

`requirePlan(session, featureKey)`, `getPlanUsage(shopId, featureKey)`. Gate AI, export, design premium, multi-store, priority support.

---

## Sec 30 — App Store checklist

systemSettings group `app_review` checklist on admin dashboard. GDPR webhooks, uninstall cleanup, Billing API only, privacy/support URLs, etc.

---

## Sec 31 — Support

In-app `app.support.tsx` → ticket + message → email confirm. Admin list/thread → reply emails requester. No inbound-email in v1 (DECISIONS).

---

## Sec 32 — Cursor protocol

State = `PROGRESS.md` + `CURRENT.md`. One task. No full-spec reread. See `.cursor/rules/00-build-protocol.mdc`.

---

## Sec 33 — Open → locked

See `docs/DECISIONS.md`.
