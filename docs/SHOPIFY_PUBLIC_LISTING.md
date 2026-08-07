# Shopify plans & billing — Shopify App Pricing (Managed Pricing)

Production: `https://corepilotai.corewital.com`  
Billing: Settings → Billing in the embedded app

## Important

This app uses **Shopify App Pricing** (plans in Partner Dashboard).  
Managed Pricing **blocks** the Billing API (`appSubscriptionCreate`).  
Do **not** call GraphQL to create charges — redirect to Shopify’s plan page.

## Flow

1. Merchant opens **Settings → Billing**
2. Clicks **Change plan on Shopify** (or Upgrade / Switch on any plan card)
3. App opens (top-level):  
   `https://admin.shopify.com/store/{store}/charges/corepilot-ai/pricing_plans`
4. Merchant picks Free / Starter / Professional / Business / **Enterprise** and approves
5. Shopify redirects to app Redirect URL with `plan_handle=…` (set each plan’s Redirect URL to `/app/settings/billing`)
6. App activates plan locally + `syncSubscription` reads active subscriptions

## Partner Dashboard checklist

| Setting | Value |
|---------|--------|
| Pricing mode | Shopify App Pricing (enabled) |
| App handle | `corepilot-ai` (env `SHOPIFY_APP_HANDLE`) |
| Every plan Redirect URL | `/app/settings/billing` |
| Enterprise | $99.99/mo · handle `enterprise` · self-serve (not “contact support”) |

Public plans must match app cards: free, starter, professional, business, enterprise.

## Test on a development store

1. Install app → Settings → Billing  
2. Click **Upgrade to Enterprise** (or Change plan on Shopify)  
3. Select Enterprise on Shopify’s page → Approve  
4. Return to Billing — plan badge updates  
5. Charge appears in Shopify admin → Settings → Bills  

## Admin override (QA only)

Admin → Installs → store → Plan override (sets `planSource=admin`)

## Listing URLs

| Field | URL |
|-------|-----|
| App | https://corepilotai.corewital.com |
| Privacy | https://corepilotai.corewital.com/privacy |
