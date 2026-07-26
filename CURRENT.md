# CURRENT TASK

**ID:** `15.7-deploy`  
**Phase:** 15 — Hardening  
**Spec:** Sec 15.7

## Do
- Production deploy (Vercel + Turso + production URLs)

## Done this pass
- Admin sidebar: collapsible groups + submenus, expand/collapse all, state persisted
- Support: admin ticket queue (filters, bulk status, needs-reply), threaded detail with status/priority; merchant app now lists tickets and replies in-thread
- Audit log: filters (actor/action/entity/date/search), per-page, pagination, payload details
- System settings: Gemini key removed (AI keys live in /admin/ai); Compliance page deleted
- Installs: grid/table views, summary tiles, live issue counts, bulk freeze/unfreeze/queue-scan
- Install detail: module health cards, grid/table issue views, activity tab, freeze + retry-failed actions, module visibility respected
- Admin dashboard: MRR/ARR/ARPU/projection tiles, SVG charts, last-10 lists with View all
- Cron jobs: run history filters + rerun, per-store job view with queue scan / retry failed / reset
