# Publish CorePilot AI on the Shopify App Store (plans & billing)

Production app URL: `https://corepilotai.corewital.com`

## 1. Partner Dashboard app

1. Go to [Shopify Partners](https://partners.shopify.com) → Apps → **CorePilot AI**.
2. Set **App URL** = `https://corepilotai.corewital.com`
3. **Allowed redirection URLs**:
   - `https://corepilotai.corewital.com/auth/callback`
   - `https://corepilotai.corewital.com/auth/shopify/callback`
   - `https://corepilotai.corewital.com/api/auth/callback`
4. Run locally once with production URLs: `npm run deploy` (`shopify app deploy`).

## 2. Billing (Managed Pricing / App Subscriptions)

Shopify charges merchants via **AppSubscription** GraphQL (already used in
`createSubscription`). For a **public** listing:

1. Partners → App → **Distribution** → choose **Public** (App Store).
2. Under **Pricing**, define recurring plans that match CorePilot:
   - Free — $0
   - Starter — $4.99 / month
   - Professional — $9.99 / month
   - Business — $19.99 / month
   - Enterprise — “Contact us” (no self-serve charge; use Admin → Plan override)
3. Ensure **Embedded app** + required scopes match `shopify.app.toml`.
4. Test charges with a **development store** first (`test: true` in
   `appSubscriptionCreate` while `NODE_ENV !== production`).

## 3. Development testing (before public)

| Step | Action |
|------|--------|
| A | Install app on a dev store from Partner Dashboard |
| B | In Admin Core → Installs → store → **Plan override** → Starter/Pro/Business |
| C | Open embedded app → Settings → Billing — usage/limits should match |
| D | Queue Scan — Free allows 3 manual scans; higher plans unlock cadence |
| E | For real Shopify money flow, click **Upgrade** on Billing (opens Shopify confirm) |

Admin **Plan override** updates the app immediately and is **not wiped** by
Shopify sync (`planSource=admin`). Merchant self-serve upgrades still create a
real Shopify subscription (`planSource=shopify`).

## 4. Enterprise / custom deals

1. Agree price offline.
2. Admin → Installs → store → Plan override → **Enterprise**.
3. Optionally create a custom AppSubscription in Partner Dashboard / Billing API
   with a one-off price, or invoice outside Shopify.
4. Limits: set Unlimited on Admin → Billing plans → Enterprise features.

## 5. App Store listing checklist

- [ ] Privacy policy + GDPR webhooks live
- [ ] Screenshots / demo video
- [ ] Support email / in-app Support tickets
- [ ] Vercel env: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`,
      `TURSO_*`, `CRON_SECRET`, `ADMIN_SESSION_SECRET`
- [ ] Submit for review under Distribution → App Store

## 6. Cron note (Hobby)

Vercel Hobby runs crons **once per day**. Merchant “Queue Scan” processes
immediately. Scheduled cadence (monthly / weekly / daily) is evaluated inside
`/api/cron/daily-scan` using each shop’s plan `scan_cadence`.
