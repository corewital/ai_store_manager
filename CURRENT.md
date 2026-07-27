# CURRENT TASK

**ID:** `15.7-deploy`  
**Phase:** 15 — Hardening  
**Spec:** Sec 15.7

## Do
- Confirm Vercel env: `SHOPIFY_APP_URL=https://corepilotai.corewital.com` + live `TURSO_*` for **corepilot-ai-db only**
- Open embedded app and verify it loads (not trycloudflare)
- Partner version `corepilot-ai-5` released with live webhooks

## Done this pass
- Production Shopify deploy (`corepilot-ai-5`) — webhooks → corepilotai.corewital.com
- Split `shopify.app.toml` (prod) / `shopify.app.dev.toml` (local)
- Guard: Vercel refuses `file:` DB; `npm run db:push-live` ALTER-only for corepilot-ai-db
