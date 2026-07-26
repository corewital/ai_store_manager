# Deploy (Vercel Hobby + Turso)

## 1. Fix that blocked create
Hobby plans only allow **once-per-day** crons. `vercel.json` now uses:
- `0 3 * * *` → `/api/cron/daily-scan`
- `15 3 * * *` → `/api/cron/process-jobs`
- `0 4 * * 0` → `/api/cron/weekly-report`

## 2. Vercel project env vars
In **Project → Settings → Environment Variables** (Production + Preview):

| Key | Value |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://corepilot-ai-db-….turso.io` |
| `TURSO_AUTH_TOKEN` | Turso token |
| `DB_PROVIDER` | `turso` |
| `SHOPIFY_API_KEY` | from Partner Dashboard |
| `SHOPIFY_API_SECRET` | from Partner Dashboard |
| `SHOPIFY_APP_URL` | `https://corepilot-ai.vercel.app` (or your domain) |
| `SCOPES` | same as `.env.example` |
| `CRON_SECRET` | long random string |
| `ADMIN_SESSION_SECRET` | long random string |
| `ADMIN_SEED_EMAIL` | your admin email |
| `ADMIN_SEED_PASSWORD` | strong password (change after first login) |
| `GEMINI_API_KEY` / AI keys | optional — prefer `/admin/ai` |
| `RESEND_API_KEY` | optional |

## 3. Database (already done once)
```bash
npx drizzle-kit push --force   # schema → Turso
npm run db:seed                # roles, plans, super admin
npm run db:migrate-mysql       # copy local MySQL → Turso (optional)
```

## 4. Shopify app URL
After first Vercel deploy succeeds, set Partner Dashboard / `shopify.app.toml` `application_url` to the Vercel URL, then:
```bash
npm run deploy
```

## 5. Local development
Same Turso dialect everywhere:
- **Cloud Turso** (shared with prod): set `TURSO_*` in `.env`
- **Offline file DB**: `TURSO_DATABASE_URL=file:./data/local.db` (no token)

Legacy MySQL is only used by `npm run db:migrate-mysql`.
