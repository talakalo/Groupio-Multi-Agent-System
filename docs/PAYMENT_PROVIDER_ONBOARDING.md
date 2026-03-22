# Payment Provider Onboarding Guide

This document describes how to complete onboarding for each payment provider
supported by Groupio and the exact steps required before enabling them in
production.

---

## Current Payment Provider Status

| Provider | Status | Env var | Notes |
|---|---|---|---|
| **Mock** | ✅ Dev only | `PAYMENT_PROVIDER=mock` | Blocked in production/staging |
| **Stripe** | ✅ Implemented | `PAYMENT_PROVIDER=stripe` | Requires Stripe credentials |
| **bit** | 🔧 Architecture-ready, NOT live | `PAYMENT_PROVIDER=bit` | Requires merchant onboarding |
| **PayBox** | 🔧 Architecture-ready, NOT live | `PAYMENT_PROVIDER=paybox` | Requires merchant onboarding |

---

## Stripe (Credit Card)

### What is implemented

- `StripePaymentProvider` class in `src/services/payment.py`
- `POST /payments/initiate` creates a Stripe `PaymentIntent` and returns `client_secret`
- Frontend `apps/web/components/payments/StripeCheckoutForm.tsx` uses Stripe.js Elements
- `POST /payments/webhook/stripe` verifies Stripe signature and updates payment status
- Full refund support via `POST /payments/{id}/refund`
- Invoice/escrow status automatically updated on webhook events

### Required setup

1. **Create a Stripe account** at https://dashboard.stripe.com/register
2. **Obtain API keys** from https://dashboard.stripe.com/apikeys
3. **Set environment variables:**
   ```
   PAYMENT_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_live_...           # backend only
   STRIPE_PUBLISHABLE_KEY=pk_live_...      # backend (used in settings for reference)
   STRIPE_WEBHOOK_SECRET=whsec_...         # from Stripe Dashboard → Webhooks
   ```
4. **Set frontend env var** in `apps/web/.env`:
   ```
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```
5. **Register the webhook endpoint** in Stripe Dashboard → Webhooks:
   - URL: `https://your-domain.com/api/v1/payments/webhook/stripe`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `payment_intent.canceled`
     - `payment_intent.processing`
     - `charge.refunded`
     - `charge.dispute.created`

### Testing

Use Stripe test cards: https://stripe.com/docs/testing#cards
- Success: `4242 4242 4242 4242`
- Requires authentication: `4000 0025 0000 3155`
- Decline: `4000 0000 0000 9995`

---

## bit (Israeli Mobile Payment)

### What is implemented (architecture-ready)

- `BitPaymentProvider` class in `src/services/payment.py`
- Provider is registered in `get_payment_provider()` factory
- Feature flags: `ENABLE_BIT_PAYMENT`, `BIT_API_KEY`, `BIT_MERCHANT_ID`, `BIT_ENVIRONMENT`
- Frontend feature flag: `NEXT_PUBLIC_BIT_ENABLED`

### What is NOT yet implemented

The `create_charge`, `refund`, and `get_status` methods all raise `NotImplementedError`.
Real bit API calls must be implemented after onboarding.

### What is bit

bit is Israel's most popular mobile payment platform, operated by Bank Hapoalim.
It supports P2P and merchant payments via mobile deep-link, QR code, and payment links.
Most Israeli smartphone users have bit installed.

### Onboarding steps

1. **Register as a bit merchant** at https://www.bitpay.co.il/merchant
   - Business registration in Israel required (ח.פ. / ע.מ.)
   - Estimated onboarding time: 1–2 weeks
2. **Obtain credentials:**
   - `BIT_MERCHANT_ID` — your merchant identifier
   - `BIT_API_KEY` — your API key / secret
3. **Confirm API details** with bit support:
   - REST API base URL (sandbox and production)
   - Authentication scheme (Bearer token, HMAC, etc.)
   - Payment request payload structure
   - Webhook/callback structure and signature verification
4. **Set environment variables:**
   ```
   PAYMENT_PROVIDER=bit
   ENABLE_BIT_PAYMENT=true
   BIT_MERCHANT_ID=your_merchant_id
   BIT_API_KEY=your_api_key
   BIT_ENVIRONMENT=sandbox   # or production
   ```
5. **Implement the API calls** in `src/services/payment.py` → `BitPaymentProvider`:
   - `create_charge()` — POST to bit API, return `payment_link` + `transaction_id`
   - `refund()` — POST refund request to bit API
   - `get_status()` — GET payment status from bit API
6. **Implement webhook signature verification** in `POST /payments/webhook`
7. **Add bit payment link / QR display** in checkout UI
   - The checkout page (`apps/web/app/(resident)/checkout/page.tsx`) currently
     handles `client_secret` (Stripe) and `succeeded` (mock) flows.
   - For bit, add a `payment_link` phase that shows a QR code and deep-link button.
8. **Enable frontend** in `apps/web/.env`:
   ```
   NEXT_PUBLIC_BIT_ENABLED=true
   ```
9. **Test full round-trip** in bit sandbox
10. **Register webhook callback URL** in bit merchant dashboard

### Expected bit payment flow in Groupio

```
Resident clicks "Pay with bit"
  → Backend: POST /payments/initiate {offer_id, payment_method: "bit"}
  → BitPaymentProvider.create_charge() → returns {payment_link, transaction_id}
  → Frontend: shows QR code + deep-link button for bit app
  → Resident: opens bit app, approves payment
  → bit: POSTs webhook to POST /payments/webhook
  → Backend: updates payment status to "succeeded"
  → Frontend: polls or receives success signal → shows success page
```

### Security requirements

- Verify HMAC signature on all bit webhook callbacks
- Use `PAYMENT_WEBHOOK_SECRET` or a bit-specific signing secret
- Never expose `BIT_API_KEY` in frontend code
- Idempotency: bit may retry webhooks; use `transaction_id` deduplication

---

## PayBox (Israeli Online Payment)

### What is implemented (architecture-ready)

- `PayBoxPaymentProvider` class in `src/services/payment.py`
- Provider is registered in `get_payment_provider()` factory
- Feature flags: `ENABLE_PAYBOX_PAYMENT`, `PAYBOX_TERMINAL`, `PAYBOX_API_KEY`, `PAYBOX_ENVIRONMENT`
- Frontend feature flag: `NEXT_PUBLIC_PAYBOX_ENABLED`

### What is NOT yet implemented

The `create_charge`, `refund`, and `get_status` methods all raise `NotImplementedError`.
Real PayBox API calls must be implemented after onboarding.

### What is PayBox

PayBox is an Israeli online payment gateway supporting credit card payments,
installments (תשלומים), recurring billing, and alternative payment methods.
It is commonly used by Israeli e-commerce and SaaS platforms.

### Onboarding steps

1. **Register as a PayBox merchant** at https://payboxpayments.com or https://paybox.co.il
   - Business registration in Israel required
   - Contact sales for pricing and onboarding
2. **Obtain credentials:**
   - `PAYBOX_TERMINAL` — your terminal ID
   - `PAYBOX_API_KEY` — your API secret key
3. **Confirm API details** with PayBox support:
   - REST API base URL (sandbox and production)
   - Authentication scheme
   - Hosted payment page parameters
   - Webhook/callback payload structure and signature
4. **Set environment variables:**
   ```
   PAYMENT_PROVIDER=paybox
   ENABLE_PAYBOX_PAYMENT=true
   PAYBOX_TERMINAL=your_terminal_id
   PAYBOX_API_KEY=your_api_key
   PAYBOX_ENVIRONMENT=sandbox   # or production
   ```
5. **Implement the API calls** in `src/services/payment.py` → `PayBoxPaymentProvider`:
   - `create_charge()` — POST to PayBox API, return `checkout_url` + `transaction_id`
   - `refund()` — POST refund to PayBox API
   - `get_status()` — GET transaction status from PayBox API
6. **Implement redirect handling** in the checkout page:
   - PayBox uses a redirect flow: user is sent to `checkout_url`
   - PayBox redirects back to `success_url` / `cancel_url` after payment
   - Add `success_url` and `cancel_url` query params to the PayBox charge request
7. **Add success/cancel return routes** (e.g., `/checkout/success?provider=paybox`)
8. **Implement webhook signature verification** in `POST /payments/webhook`
9. **Enable frontend** in `apps/web/.env`:
   ```
   NEXT_PUBLIC_PAYBOX_ENABLED=true
   ```
10. **Test full round-trip** in PayBox sandbox
11. **Register callback URLs** in PayBox merchant settings

### Expected PayBox payment flow in Groupio

```
Resident clicks "Pay with PayBox"
  → Backend: POST /payments/initiate {offer_id, payment_method: "paybox"}
  → PayBoxPaymentProvider.create_charge() → returns {checkout_url, transaction_id}
  → Frontend: redirects resident to checkout_url (PayBox hosted page)
  → Resident: completes payment on PayBox page
  → PayBox: redirects to success_url with transaction reference
  → PayBox: POSTs webhook to POST /payments/webhook
  → Backend: updates payment status to "succeeded"
  → Frontend: shows success page
```

### Security requirements

- Verify HMAC/signature on all PayBox webhook callbacks
- Use `PAYMENT_WEBHOOK_SECRET` or a PayBox-specific signing secret
- Never expose `PAYBOX_API_KEY` in frontend code
- Validate `transaction_id` on redirect return to prevent forgery
- Idempotency: PayBox may retry callbacks; deduplicate by `transaction_id`

---

## Adding a new payment provider

The `PaymentProvider` ABC in `src/services/payment.py` defines the interface
all providers must implement:

```python
class PaymentProvider(ABC):
    async def create_charge(self, amount, currency, customer_id, metadata) -> dict
    async def refund(self, transaction_id, amount=None) -> dict
    async def get_status(self, transaction_id) -> dict
    async def create_customer(self, user_id, email) -> str
```

Steps to add a new provider:
1. Implement the `PaymentProvider` subclass in `src/services/payment.py`
2. Add env vars to `src/config/settings.py`
3. Add env vars to `.env.example`, `docker/.env.example`, `apps/web/.env.example`
4. Register the provider in `get_payment_provider()` factory
5. Add webhook handling in `POST /payments/webhook` if needed
6. Add migration if new DB columns are needed
7. Update translations (`apps/web/messages/he.json` and `en.json`)
8. Write integration tests

---

## UI gating — preventing misleading payment options

Providers that are not yet live **must not** be shown as active options in the UI.
Use the feature flags:

| Provider | Backend flag | Frontend flag |
|---|---|---|
| Stripe | `PAYMENT_PROVIDER=stripe` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set |
| bit | `ENABLE_BIT_PAYMENT=true` | `NEXT_PUBLIC_BIT_ENABLED=true` |
| PayBox | `ENABLE_PAYBOX_PAYMENT=true` | `NEXT_PUBLIC_PAYBOX_ENABLED=true` |

The checkout page should only render a payment method button if the corresponding
frontend flag is `true`. This prevents residents from seeing and attempting to
pay with a provider that will return a 500/NotImplementedError.

When bit/PayBox frontend flags are enabled, add payment method selection to the
checkout page **before** calling `POST /payments/initiate`, and pass the selected
method in `payment_method` field of the request body.
