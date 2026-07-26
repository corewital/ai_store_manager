# Locked decisions (do not re-ask)

| Topic | Decision |
|---|---|
| Email | Resend (`RESEND_API_KEY`) |
| Support inbound email | v1 = in-app form only; email-inbound later |
| Design tier (Sec 27) | Visual tokens + feature unlock via `planFeatures` (Sec 29) |
| SLA digest cron (Sec 31.3) | Skip v1 |
| Admin signup | Invite-only |
| Impersonation | Yes, always audit-logged |
| FontAwesome | Free solid/regular only |
| Merchant listings default | List (IndexTable); Grid only Images/Collections |
| Image pixels | `sharp` only — never an AI vision / Gemini pixel path |
| Text AI | Multi-provider pool (`/admin/ai`): OpenAI, Gemini, Claude, OpenRouter, Z.AI, BigModel — key rotate + failover on quota |
| DB now | Turso + Drizzle (libSQL). Local: `file:./data/local.db` or same Turso cloud. Legacy MySQL only via `npm run db:migrate-mysql`. |
| Hosting | Vercel + Cron |
| Soft delete | All admin/merchant removable rows use `deletedAt` |
