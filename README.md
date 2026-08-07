# CorePilot AI (AI Store Manager)

Shopify embedded app that scans catalog health (products, SEO, images, inventory, collections, nav, theme), AI-fixes issues, billing plans, in-app assistant, and a separate **Admin Core**.

**Stack:** Remix · `@shopify/shopify-app-remix` · Polaris · App Bridge · Drizzle + Turso · Vercel Cron · Resend · multi-provider text AI · `sharp` (pixels only)

## Live

| | |
|--|--|
| App | https://corepilotai.corewital.com |
| Admin | https://corepilotai.corewital.com/admin |
| DB | Turso master `corepilot-ai-db` (see `app/db/master-db.ts`) |
| Deploy | [`docs/DEPLOY.md`](./docs/DEPLOY.md) · listing [`docs/SHOPIFY_PUBLIC_LISTING.md`](./docs/SHOPIFY_PUBLIC_LISTING.md) |

**Prod rules:** Vercel always uses master Turso (never `file:` / branch DB). Schema = `npm run db:push-live` (ALTER only). Never `db:fresh` on live. Local = `file:./data/local.db`.

## Paths

| Area | Path |
|------|------|
| Merchant | `app/routes/app.*` |
| Admin | `app/routes/admin.*` + `AdminLayout` |
| Services | `app/services/**/*.server.ts` |
| Schema | `app/db/schema.ts` |
| Prod TOML | `shopify.app.toml` → `npm run deploy` |
| Dev TOML | `shopify.app.dev.toml` → `npm run dev` |

Admin = **cookie session** (not Shopify). Soft-delete via `deletedAt`. Business config → `systemSettings` / `appSettings` / `planFeatures` (not hardcoded).

**Compliance webhooks** (App Store required): one subscription, all three topics → `/webhooks/compliance`  
`customers/data_request` · `customers/redact` · `shop/redact`

## Local

```bash
cp .env.example .env   # Shopify keys; TURSO_DATABASE_URL=file:./data/local.db
npm install
npm run db:migrate && npm run db:seed
npm run dev            # embedded app
npm run vite           # admin → http://127.0.0.1:3000/admin/login
```

| Script | Purpose |
|--------|---------|
| `npm run db:push-live` | ALTER schema on live Turso |
| `npm run db:repair` | Repair local columns |
| `npm run deploy` | Release Shopify app config / version |

**Cron** (`Authorization: Bearer $CRON_SECRET`): daily-scan `0 3 * * *` · process-jobs `15 3 * * *` · weekly-report `0 4 * * 0`

## Agent protocol

[`START.md`](./START.md) · `CURRENT.md` · `PROGRESS.md` · locked choices [`docs/DECISIONS.md`](./docs/DECISIONS.md)

## Sibling app blueprint

New Year/Make/Model app (same shell, different domain): [`docs/COREYMM.md`](./docs/COREYMM.md)
