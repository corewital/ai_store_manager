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

### Local vs production DB — read this
`drizzle-kit push` targets whatever `TURSO_DATABASE_URL` is set to. If the cloud
URL is exported in your shell, a later "local" push silently hits **production**
and your local DB drifts.

- Local dev: `.env` → `TURSO_DATABASE_URL=file:./data/local.db`
- Production push: pass the cloud URL **inline for that one command only**

If the app throws `Failed query: select … from "shops"` naming a column that
exists in `app/db/schema.ts`, the local DB drifted. Repair it:
```bash
npm run db:repair             # adds missing columns to data/local.db
npx drizzle-kit push --force  # then confirm "No changes detected"
```

## 4. Shopify app URL
After first Vercel deploy succeeds, set Partner Dashboard / `shopify.app.toml` `application_url` to the Vercel URL, then:
```bash
npm run deploy
```

## Hobby: “Deployment Blocked” (commit author)

If Vercel says the commit author lacks contributing access:

**Cause:** Hobby does **not** allow collaborators on **private** repos. Commits from `hp-development` cannot deploy into a **CoreWital** team project.

**Pick one fix (no code change):**

1. **Easiest (free):** GitHub → repo **Settings → Change visibility → Public**, then Redeploy on Vercel.  
2. **Keep private:** Vercel → upgrade team to **Pro**, add `hp-development` as a member.  
3. **Same account:** Create/import the project under the **personal** Vercel account that owns the GitHub login used for commits (not a separate team), then reconnect the repo.

Then: **Deployments → … on latest → Redeploy**.
