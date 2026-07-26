# AI Store Manager

Shopify embedded app (Remix + Polaris + App Bridge) · Turso/libSQL · Vercel.

## Install / run

1. Copy env: `cp .env.example .env` and fill Shopify + secrets.
2. Install: `npm install`
3. Link Partner app (once): `npm run config:link` — or set `client_id` in `shopify.app.toml`.
4. DB (Turso / local file):
   - Offline: `TURSO_DATABASE_URL=file:./data/local.db`
   - Or cloud Turso: set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
   - Then: `npm run db:migrate` → `npm run db:seed`
5. Dev admin: `npm run vite` → http://127.0.0.1:3000/admin/login
6. Dev embedded app: `npm run dev` (Shopify CLI tunnel + install on a test store).

See [`docs/DEPLOY.md`](./docs/DEPLOY.md) for Vercel Hobby + Turso setup.

## Deploy (15.7)

1. Import GitHub repo into Vercel (Remix preset). Cron schedules are Hobby-safe (daily only).
2. Set env vars from `.env.example` / `docs/DEPLOY.md` (especially `TURSO_*`, `SHOPIFY_*`, `CRON_SECRET`, `ADMIN_SESSION_SECRET`).
3. Point `SHOPIFY_APP_URL` to the Vercel URL after first deploy.
4. Schema + seed already applied to Turso; re-run `npm run db:migrate` / `db:seed` if needed.
5. `npm run deploy` (`shopify app deploy`) for app config + theme embed.

## Cron (Vercel Hobby)

Paths in `vercel.json`:

- `/api/cron/daily-scan` — `0 3 * * *`
- `/api/cron/process-jobs` — `15 3 * * *`
- `/api/cron/weekly-report` — `0 4 * * 0`

Send `Authorization: Bearer $CRON_SECRET`. Use Admin → Cron jobs → Run for an immediate tick.

## Admin

- `/admin/login` — seed user from `ADMIN_SEED_*` after `db:seed`.

## Session protocol

Paste the block in [`START.md`](./START.md) each Cursor session. See `CURRENT.md` / `PROGRESS.md`.
