# CorePilot AI (AI Store Manager)

Shopify embedded app (Remix + Polaris) · **live Turso** · Vercel.

## Live (production)

| Item | Value |
|------|--------|
| App | https://corepilotai.corewital.com |
| Admin | https://corepilotai.corewital.com/admin |
| **Master DB** | `libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io` |
| Turso console | [corepilot-ai-db](https://app.turso.tech/vercel-icfg-iurxedhaq7upmnrfjl1nqjpw/databases/corepilot-ai-db) |

**Rules**

- Production backend **always** uses master `corepilot-ai-db` (`app/db/master-db.ts`) — Vercel cannot switch to a branch DB.
- Set `TURSO_AUTH_TOKEN` on Vercel for that master DB.
- Schema: `npm run db:push-live` (ALTER only). Never `db:fresh` on live.
- Local dev: `file:./data/local.db` in `.env` (separate from live).

See [`docs/DEPLOY.md`](./docs/DEPLOY.md) for full Vercel + Shopify deploy steps.

## Local install

1. `cp .env.example .env` — fill Shopify keys; keep `TURSO_DATABASE_URL=file:./data/local.db` for local.
2. `npm install`
3. `npm run db:migrate` → `npm run db:seed` (local file DB only)
4. `npm run dev` — embedded app (`shopify.app.dev.toml`)
5. Admin: `npm run vite` → http://127.0.0.1:3000/admin/login

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run db:push-live` | Push schema to **live** corepilot-ai-db (ALTER only) |
| `npm run db:repair` | Repair local file DB columns |
| `npx tsx scripts/migrate-expiring-tokens-live.ts` | Live session columns + clear stale tokens |
| `npx tsx scripts/update-live-products-limit.ts` | Example: patch live `plan_features` |

## Cron (Vercel Hobby)

- `/api/cron/daily-scan` — `0 3 * * *`
- `/api/cron/process-jobs` — `15 3 * * *`
- `/api/cron/weekly-report` — `0 4 * * 0`

Header: `Authorization: Bearer $CRON_SECRET`

## Session protocol

[`START.md`](./START.md) · `CURRENT.md` / `PROGRESS.md`
