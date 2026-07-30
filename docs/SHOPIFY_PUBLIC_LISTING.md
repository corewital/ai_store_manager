# Shopify plans & billing (API) — how upgrades work

Production URL: `https://corepilotai.corewital.com`  
Billing page: Settings → Billing in the embedded app

## How CorePilot creates plans (API — no Partner “plan catalog” required)

Shopify **App Subscription API** creates the charge when the merchant clicks
**Upgrade**. You do **not** need to pre-create Starter/Pro/Business rows in
Partner Dashboard for this mode (that’s “Managed Pricing”).

Flow:

1. Merchant clicks **Upgrade to Starter** (etc.)
2. App calls GraphQL `appSubscriptionCreate` with price from `app/config/plans.ts`
3. Shopify returns a **confirmationUrl**
4. App opens that URL **outside the iframe** (`_top`) so the merchant can approve
5. Merchant returns to `/app/settings/billing?confirmed=starter`
6. App activates the plan locally + webhook `app_subscriptions/update` syncs

Plan prices (source of truth in code / seed):

| Plan | Price | Created by |
|------|-------|------------|
| Free | $0 | Local only (cancels paid sub) |
| Starter | $4.99/mo | `appSubscriptionCreate` |
| Professional | $9.99/mo | `appSubscriptionCreate` |
| Business | $19.99/mo | `appSubscriptionCreate` |
| Enterprise | Contact | Admin override / support |

## Steps to test Upgrade on a development store

1. Install the app on a **development store** (Partner Dashboard → Stores).
2. Open **Apps → CorePilot AI → Settings → Billing**.
3. Click **Upgrade to Starter** (or Pro / Business).
4. You should leave the iframe and see Shopify’s **Approve charge** page  
   (test charge — no real money in `NODE_ENV=development`).
5. Click **Approve**.
6. You return to Billing with “Subscription confirmed” and the new plan badge.

### If Upgrade does nothing / errors

| Symptom | Fix |
|---------|-----|
| Click does nothing | Hard-refresh the app; use the “click here to approve” link in the banner |
| `confirmationUrl` missing | Ensure store is a **dev store** for test charges; app must be installed |
| Return URL wrong | App uses the **current request origin** (live tunnel), not a stale `.env` tunnel |
| Still on Free after approve | Check webhook `app_subscriptions/update` in `shopify.app.toml`; reopen Billing |
| Need plan without paying (QA) | Admin Core → Installs → store → **Plan override** |

## Partner Dashboard — required for Upgrade (Billing API)

Shopify returns errors like *“Apps without a public distribution cannot use the
Billing API”* until you do this once:

1. Open [partners.shopify.com](https://partners.shopify.com) → Apps → **CorePilot AI**
2. Left menu → **Distribution**
3. Choose **Public distribution** → Select  
   (You do **not** need to submit to the App Store yet.)
4. Retry **Upgrade** in the app (dev stores use `test: true` charges)

Until Distribution is Public, Upgrade will fail. Use **Admin → Plan override**
for QA without Shopify billing.

## Admin override (no Shopify charge)

For demos / Enterprise:

**Admin** → Installs → store → Plan override → choose plan → Update plan  

This sets `planSource=admin` so sync will not wipe it.

## App Store listing links

| Field | URL |
|-------|-----|
| App / homepage | `https://corepilotai.corewital.com` |
| Privacy policy | `https://corepilotai.corewital.com/privacy` |
