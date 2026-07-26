# CURRENT TASK

**ID:** `15.7-deploy`  
**Phase:** 15 — Hardening  
**Spec:** Sec 15.7

## Do
- After Vercel deploy succeeds: set `SHOPIFY_APP_URL` to the Vercel URL, run `npm run deploy`, connect custom subdomain later

## Done this pass
- Fixed Hobby cron blocker (`process-jobs` → daily `15 3 * * *`)
- Migrated DB dialect MySQL → Turso/libSQL (schema + client + session storage)
- Pushed schema + seed to Turso; copied local MySQL data (shops, issues, AI keys, tickets, …)
- Added `docs/DEPLOY.md` with Vercel env checklist
