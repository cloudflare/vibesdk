# Razorpay Setup — Operator Runbook

## 1. Get API keys (Razorpay Dashboard)

1. Log in → Dashboard → Account Settings → API Keys → Generate Test/Live keys.
2. Save `key_id` (public, safe to ship to browser) and `key_secret` (server-only).

## 2. Create Plans (one per tier × cycle)

Dashboard → Subscriptions → Plans → Create Plan.

| Plan name          | Amount (paise) | Interval | Total billing cycles |
|--------------------|----------------|----------|----------------------|
| VibeSDK Pro Monthly| 169_900 (₹1699)| monthly  | 12                   |
| VibeSDK Pro Annual | 1_699_000 (₹16,990)| yearly | 1                   |
| VibeSDK Team Monthly| 499_900 (₹4999)| monthly | 12                   |
| VibeSDK Team Annual| 4_999_000 (₹49,990)| yearly| 1                   |

Copy each `plan_id` (format `plan_xxx`).

## 3. Configure Webhook

Dashboard → Settings → Webhooks → Add New Webhook.

- **URL:** `https://your-domain.example/api/billing/webhook`
- **Secret:** generate a random ≥32-char string; set same value in Worker env as `RAZORPAY_WEBHOOK_SECRET`.
- **Active Events** (minimum):
  - `subscription.activated`
  - `subscription.charged`
  - `subscription.cancelled`
  - `subscription.halted`
  - `subscription.paused`
  - `payment.captured` (only if using one-time credit top-ups)

## 4. Set Worker secrets (server-only)

```bash
npx wrangler secret put RAZORPAY_KEY_SECRET       # from step 1
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET   # from step 3
```

## 5. Set Worker vars (public, in `wrangler.jsonc`)

```
RAZORPAY_KEY_ID                   # public key, from step 1
RAZORPAY_PRO_MONTHLY_PLAN_ID      # from step 2
RAZORPAY_PRO_ANNUAL_PLAN_ID
RAZORPAY_TEAM_MONTHLY_PLAN_ID
RAZORPAY_TEAM_ANNUAL_PLAN_ID
```

## 6. Smoke-test end-to-end (Test mode)

```
Test card: 4111 1111 1111 1111
CVV: any 3 digits
Expiry: any future date
OTP on test bank page: anything
```

Flow to verify (per Production Readiness Gate):

- [ ] Free user → /pricing → click "Start Pro" → Razorpay Checkout loads
- [ ] Complete payment w/ test card → redirect back to success
- [ ] Webhook fires `subscription.activated` → `subscription_tiers.tier` = 'pro'
- [ ] /billing shows Pro, correct renewal date, 100 generations limit
- [ ] Run 5 generations → usage counter increments
- [ ] Click "Cancel subscription" → `subscription.cancelled` fires → row marks `active=0`
- [ ] Idempotency: replay same webhook → second request is a no-op (row in `razorpay_events`)

## 7. Going live

1. Complete KYC on Razorpay Dashboard → activate live mode.
2. Regenerate live `key_id` + `key_secret` → update secrets.
3. Recreate Plans in live mode (ids differ) → update plan IDs.
4. Add live Webhook URL (same path) with new secret.
5. Switch `CUSTOM_DOMAIN` in `wrangler.jsonc` to production domain.
6. Monitor Razorpay Dashboard → Payments for first few transactions.
