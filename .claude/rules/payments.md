# Payment Rules

## Lifecycle (STRICT — never skip steps)

### Payment Status
```
pending → processing → succeeded
                    ↘ failed
succeeded → refunded | partially_refunded
```

### Invoice Status
```
draft → pending → paid → released
              ↘ overdue → cancelled | refunded
```

### Escrow Status
```
collecting → held → released
                 ↘ partially_released
                 ↘ disputed → refunded
```

### Contractor Payout Status
```
pending → approved → processing → completed
                               ↘ failed → on_hold
```

## Rules

- **Never jump statuses** — e.g., do not go from `pending` directly to `released`
- **Never release escrow** without verifying all participants have paid and offer is `completed`
- **All payment transitions** must be written to `audit_logs` table with `user_id`, `action`, `old_status`, `new_status`, `timestamp`
- **Stripe webhooks** must verify signature via `stripe.Webhook.construct_event()` before processing
- **No direct payout** to contractor without `approved` status from admin or automated trust threshold check

## Stripe Integration
- Use PaymentIntents for all charges (not Charges API directly)
- Store `provider_customer_id` and `provider_subscription_id` on contractor record
- Membership webhooks handled in `src/services/stripe_contractor_webhooks.py`
- Payment webhooks handled in `src/services/payment.py`

## Escrow Config (from `EscrowConfig` type)
- `minEscrowParticipants` — below this count, use direct payment
- `minEscrowAmount` — below this amount, use direct payment
- `trustedContractorThreshold` — trust score above which direct payment allowed
- `highValueCategories` — always use escrow regardless of participant count
- `platformFeeRate` — deducted from gross payout before releasing to contractor

## Testing Payments
- Use Stripe test mode keys in `.env` — never use live keys in tests
- Test all status transitions including failure/refund paths
- Verify audit log entries are created for each transition
