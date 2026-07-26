# CURRENT TASK

**ID:** `15.7-deploy`  
**Phase:** 15 — Hardening  
**Spec:** Sec 15.7

## Do
- Push code to GitHub (`dev` → `main`) so Vercel deploys scan-now + plan limits
- Confirm `SHOPIFY_APP_URL=https://corepilotai.corewital.com` on Vercel
- Run `shopify app deploy` for production URLs

## Done this pass
- Scans/fixes process immediately (Hobby cron is daily-only)
- Plan limits Free→Enterprise + admin editable features
- Home activity = 5; One-Click Fix + Reports show real rows
- Cron status legend: ok / partial / failed
