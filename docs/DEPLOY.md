# Deploy (Vercel Hobby + Turso `corepilot-ai-db`)

## Critical: live URLs + live DB

| Item | Value |
|------|--------|
| App URL | `https://corepilotai.corewital.com` |
| Turso DB | **only** master `corepilot-ai-db` — see `app/db/master-db.ts` |
| Never on Vercel | `file:./data/local.db`, branch DBs, or a new Turso database |

**Backend rule:** On Vercel, `app/db/client.ts` **always** connects to the master URL
(`libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io`)
even if a preview/branch env var points elsewhere. No new DB is created on deploy.

## 1. Vercel env vars (Production)

| Key | Value |
|---|---|
| `SHOPIFY_APP_URL` | `https://corepilotai.corewital.com` |
| `SHOPIFY_API_KEY` | Partner app client id |
| `SHOPIFY_API_SECRET` | Partner app secret |
| `SCOPES` | same as `.env.example` |
| `TURSO_DATABASE_URL` | `libsql://corepilot-ai-db-vercel-icfg-iurxedhaq7upmnrfjl1nqjpw.aws-us-east-1.turso.io` |
| `TURSO_AUTH_TOKEN` | **Required** — Turso token for master `corepilot-ai-db` (without this, admin login + app return 500) |
| `DB_PROVIDER` | `turso` |
| `CRON_SECRET` | long random |
| `ADMIN_SESSION_SECRET` | long random |

After deploy, verify: `GET https://corepilotai.corewital.com/api/health` → `{"ok":true,"db":"up"}`.
If `503` / `misconfigured`, add `TURSO_AUTH_TOKEN` on Vercel and redeploy.

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

After deploy, also ensure `sessions.refresh_token` / `refresh_token_expires`
columns exist (public apps need **expiring offline tokens** — without them
Shopify returns `GraphQL Client: Forbidden` / HTTP 403 on Admin API).

## 4. After deploy: refresh the store session

1. Open the store Admin → Apps → **CorePilot AI** (full reopen, not a stale tab).
2. That triggers token exchange with `expiring=1` and stores a refresh token.
3. Then retry **AI Fix**.

If AI Fix still shows Forbidden: uninstall + reinstall the app once on that store.

## 5. Hobby crons

- `0 3 * * *` → `/api/cron/daily-scan`
- `15 3 * * *` → `/api/cron/process-jobs`
- `0 4 * * 0` → `/api/cron/weekly-report`

## 6. Deployment Blocked (Hobby + private repo)

If Vercel blocks the commit author: make the GitHub repo public, upgrade to Pro,
or deploy under the personal account that owns the commits.
