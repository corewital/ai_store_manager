# PROGRESS

Protocol: one unchecked line → implement → check → update CURRENT.md → stop.  
Session paste: see `START.md`. Spec: `docs/spec.md` (section only). Decisions: `docs/DECISIONS.md`.

---

## Phase 1 — Scaffold
- [x] 1.1 Remix + Shopify app template, `shopify.app.toml`, `.env.example`, `vercel.json` crons
- [x] 1.2 Folder stubs: `app/routes`, `app/services`, `app/db`, `app/components`, `extensions/`
- [x] 1.3 Scripts: `db:migrate`, `db:seed`, `db:fresh` in package.json

## Phase 2 — DB + sessions
- [x] 2.1 Drizzle + Turso client (`app/db/client.ts`, `drizzle.config.ts`)
- [x] 2.2 Core schema: shops, sessions, healthScores, appSettings, billingSubscriptions
- [x] 2.3 Module issue tables: product/seo/image/inventory/collection/navigation/theme + apps/performance/assistant/reports/fixQueue/agency
- [x] 2.4 TursoSessionStorage adapter (store/load/delete/findByShop)
- [x] 2.5 Wire session storage into `shopify.server.ts`

## Phase 3 — Merchant shell + Health Score
- [x] 3.1 App Bridge + Polaris Frame/Navigation shell (`app.tsx`)
- [x] 3.2 Nav links for all module routes (stubs OK)
- [x] 3.3 `health-score.server.ts` weighted rollup
- [x] 3.4 `app._index.tsx` score ring + category breakdown

## Phase 4 — Webhooks
- [x] 4.1 `webhooks.app-uninstalled` (+ mark install uninstalled)
- [x] 4.2 `webhooks.products-update` / create / delete
- [x] 4.3 `webhooks.orders-create`
- [x] 4.4 `webhooks.app-scopes-update`
- [x] 4.5 Write `webhookLogs` on every inbound webhook

## Phase 5 — Scanners (no UI)
- [x] 5.1 product-scanner.server.ts → productIssues
- [x] 5.2 seo-scanner.server.ts → seoIssues
- [x] 5.3 image-scanner.server.ts → imageIssues (detect only; sharp later)
- [x] 5.4 inventory-scanner.server.ts → inventoryFlags
- [x] 5.5 collection-scanner.server.ts → collectionIssues
- [x] 5.6 navigation-scanner.server.ts → navigationIssues
- [x] 5.7 theme-scanner.server.ts → themeIssues
- [x] 5.8 apps-scanner.server.ts → installedAppsSnapshot
- [x] 5.9 performance-scanner.server.ts → performanceSnapshots

## Phase 6 — Cron
- [x] 6.1 `api.cron.daily-scan` + CRON_SECRET guard + plan gating
- [x] 6.2 Wire scanners + health score after scan
- [x] 6.3 `api.cron.weekly-report` stub (email in Phase 10)
- [x] 6.4 Cursor/chunk support for large catalogs (`lastScannedCursor`)

## Phase 7 — Module UIs + fixes
- [x] 7.1 gemini-client + generate-seo + generate-alt-text (text only)
- [x] 7.2 images/optimize.server.ts with sharp (pixels only)
- [x] 7.3 UI+fix: products, seo, images
- [x] 7.4 UI+fix: inventory, collections, navigation
- [x] 7.5 UI: theme, apps, performance (flag/suggest; no unsafe theme auto-edit)

## Phase 8 — One-Click Fix
- [x] 8.1 fixQueue writers from module fixes
- [x] 8.2 `app.fixes.tsx` + Fix All action
- [x] 8.3 `api.fix.[module].ts` endpoints

## Phase 9 — Assistant + Reports (merchant)
- [x] 9.1 `assistant.server.ts` + `app.assistant.tsx` (real health/issue context)
- [x] 9.2 Daily report email (Resend) after daily-scan — Module 12
- [x] 9.3 Weekly report + Gemini summary — Module 14
- [x] 9.4 `app.reports.tsx` in-app history

## Phase 9b–9m — Admin Core
- [x] 9b.1 Admin schema: adminUsers, roles, permissions, rolePermissions, activityLogs
- [x] 9b.2 Admin schema: appInstalls, systemSettings, fileUploads, webhookLogs, apiCallLogs
- [x] 9b.3 Admin schema: billingPlans, planFeatures, supportTickets, supportMessages
- [x] 9b.4 Seeders: Super Admin, roles/permissions, default systemSettings, billingPlans
- [x] 9c.1 Admin cookie session + bcrypt login/logout
- [x] 9c.2 Invite-only signup + requireAdmin/requireRole/can
- [x] 9d.1 AdminLayout (Header/Sidebar/Navbar/Footer)
- [x] 9d.2 FontAwesome wrapper + SweetAlert2 helpers
- [x] 9e.1 datatable.server.ts + datatable.config whitelist + API route
- [x] 9e.2 DataTable + Filters + ListGridToggle + StatusToggle components
- [x] 9e.3 Retrofit merchant module listings to DataTable
- [x] 9f.1 admin._index dashboard tiles
- [x] 9f.2 admin.installs (freeze/rescan/impersonate + audit)
- [x] 9f.3 admin.users CRUD + soft delete + admin.roles + audit-log
- [x] 9g.1 local-storage.server.ts + fileUploads
- [x] 9h.1 admin.billing-plans + Shopify sync
- [x] 9h.2 admin.webhooks-health + apiCallLogs on Admin GraphQL
- [x] 9i.1 Design tokens standard/premium/enterprise CSS vars
- [x] 9j.1 settings.schema.ts + getSetting/setSetting everywhere business config
- [x] 9k.1 requirePlan/getPlanUsage gating on premium actions
- [x] 9l.1 GDPR webhooks (customers/data_request, customers/redact, shop/redact) + compliance tile
- [x] 9m.1 Support: schema already in 9b — in-app form `app.support.tsx`
- [x] 9m.2 admin.support-tickets list + $id reply-by-email (Resend)

## Phase 10–14 (remaining merchant)
- [x] 10.1 Billing API 4 tiers + requireBilling helper
- [x] 11.1 Settings: general, modules, ai, notifications, billing, team
- [x] 12.1 Multi-store dashboard (Business) agencyAccounts/agencyStores
- [x] 13.1 Theme App Extension / App Embed on/off only

## Phase 15 — Hardening
- [x] 15.1 All listings use centralized DataTable
- [x] 15.2 Destructive/status actions = SweetAlert2 + activityLogs
- [x] 15.3 All webhooks + Admin GraphQL logged
- [x] 15.4 Sec 30 checklist green in admin tile
- [x] 15.5 Support e2e (in-app create → admin reply → email)
- [x] 15.6 Bulk ops / rate-limit / error boundaries
- [x] Polish: Admin enterprise shell (sticky header/sidebar) + all admin pages restyled
- [x] Hotfix: Shopify install lifecycle tracking + Admin store detail
- [x] Admin enterprise v3: installs actions, dashboard, sidebar, billing CRUD, profile, plan override
- [x] Admin store Details: merchant module mirror + scan/fix via offline token; removed Audit login
- [x] Async jobs: store API token+appUrl; cron process-jobs; Details UI pagination/bulk/images; super_admin credentials
- [x] Admin console v4: collapsible sidebar, ticket threads (admin+app), audit filters/pagination, installs grid/table + bulk, install detail modules/activity, revenue dashboard charts, cron history + per-store jobs + rerun; removed Compliance page and Gemini key from System settings
- [x] 15.7a Hobby cron fix + Turso schema/seed + MySQL→Turso data copy; `docs/DEPLOY.md`
- [ ] 15.7 Deploy Vercel + secrets; `shopify app deploy` + custom subdomain
