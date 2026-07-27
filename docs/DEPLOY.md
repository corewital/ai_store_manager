# Deploy (Vercel Hobby + Turso `corepilot-ai-db`)

## Critical: live URLs + live DB

| Item | Value |
|------|--------|
| App URL | `https://corepilotai.corewital.com` |
| Turso DB | **only** `corepilot-ai-db` (`libsql://corepilot-ai-db-….turso.io`) |
| Never on Vercel | `file:./data/local.db` or a new Turso database |

## 1. Vercel env vars (Production)

| Key | Value |
|---|---|
| `SHOPIFY_APP_URL` | `https://corepilotai.corewital.com` |
| `SHOPIFY_API_KEY` | Partner app client id |
| `SHOPIFY_API_SECRET` | Partner app secret |
| `SCOPES` | same as `.env.example` |
| `TURSO_DATABASE_URL` | `libsql://corepilot-ai-db-….turso.io` |
| `TURSO_AUTH_TOKEN` | Turso token for **corepilot-ai-db** |
| `DB_PROVIDER` | `turso` |
| `CRON_SECRET` | long random |
| `ADMIN_SESSION_SECRET` | long random |

If `SHOPIFY_APP_URL` is still an old `*.trycloudflare.com` tunnel, the embedded
app will fail with “server IP address could not be found”.

## 2. Shopify config deploy (fix webhooks)

Local `shopify app dev` used to rewrite webhook URLs to a tunnel. Fix:

```bash
npm run deploy
# uses shopify.app.toml → application_url = https://corepilotai.corewital.com
# relative webhook URIs resolve to that host
```

Then confirm in Partner Dashboard → Versions that webhook URIs are
`https://corepilotai.corewital.com/webhooks/…` (not trycloudflare).

- Production config: `shopify.app.toml` (`automatically_update_urls_on_dev = false`)
- Local tunnel: `npm run dev` → `shopify.app.dev.toml`

## 3. Schema on live DB (ALTER only — never recreate)

```bash
# Point at live DB for this command only, then:
npm run db:push-live
```

This runs `drizzle-kit push` against **corepilot-ai-db** only. It will not
create a new database. Do **not** run `db:fresh` against production.

## 4. Hobby crons

- `0 3 * * *` → `/api/cron/daily-scan`
- `15 3 * * *` → `/api/cron/process-jobs`
- `0 4 * * 0` → `/api/cron/weekly-report`

## 5. Deployment Blocked (Hobby + private repo)

If Vercel blocks the commit author: make the GitHub repo public, upgrade to Pro,
or deploy under the personal account that owns the commits.
