# AI Store Manager

Shopify embedded app (Remix + Polaris + App Bridge).

## Install / run

1. Copy env: `cp .env.example .env` and fill Shopify + secrets.
2. Install: `npm install`
3. Link Partner app (once): `npm run config:link` — or set `client_id` in `shopify.app.toml`.
4. DB (local MySQL): ensure MySQL is running, DB `corepilot_ai` exists, then `npm run db:migrate` → `npm run db:seed`.
5. Dev admin: `npm run vite` → http://127.0.0.1:3000/admin/login
6. Dev embedded app: `npm run dev` (Shopify CLI tunnel + install on a test store).

### Local MySQL env

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=corepilot_ai
DB_USER=root
DB_PASSWORD=password
```

Turso keys stay blank until production.
Without a Partner app linked yet, `npm run vite` starts Vite alone; Shopify auth needs CLI + Partner credentials.

## Deploy (15.7)

1. Create Vercel project; set all `.env.example` keys as env vars.
2. Point `SHOPIFY_APP_URL` / `shopify.app.toml` `application_url` to the Vercel URL.
3. `npm run db:migrate` + `npm run db:seed` against production Turso.
4. `npm run deploy` (`shopify app deploy`) for app config + theme embed.
5. Confirm Vercel Cron hits `/api/cron/*` with `Authorization: Bearer $CRON_SECRET`.

## Cron (Vercel)

Paths in `vercel.json`:

- `/api/cron/daily-scan` — `0 3 * * *`
- `/api/cron/weekly-report` — `0 4 * * 0`

Send `Authorization: Bearer $CRON_SECRET`.

## Admin

- `/admin/login` — seed user from `ADMIN_SEED_*` after `db:seed`.

## Session protocol

Paste the block in [`START.md`](./START.md) each Cursor session. See `CURRENT.md` / `PROGRESS.md`.
