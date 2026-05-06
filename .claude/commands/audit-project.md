---
description: Full project audit — scans for missing features, broken flows, UI↔backend gaps, role coverage, payment safety, and launch readiness. Run periodically or before milestones.
---

You are performing a comprehensive audit of the Groupio codebase. This is a systematic, end-to-end review. Be thorough. The goal is to surface anything that would prevent a production launch.

## Audit sections

### 1. Feature Completeness

For each core flow, verify that both a UI and a backend exist and are connected:

- [ ] Offer creation (contractor) — UI form + POST /offers endpoint
- [ ] Offer browsing (resident) — UI list + GET /offers endpoint
- [ ] Offer joining (resident) — UI button + POST /offers/{id}/join endpoint
- [ ] Tier pricing display — UI shows current tier + real-time price update
- [ ] Payment flow (resident) — Stripe checkout UI + POST /payments endpoint
- [ ] Escrow release — Admin UI + backend escrow release logic
- [ ] Contractor payout — Admin UI + POST /payouts endpoint
- [ ] Contractor verification — Upload UI + verification status display
- [ ] Chat / messaging — UI thread + WebSocket endpoint
- [ ] Escalation flow — Resident UI + admin escalation management

For each item: COMPLETE | PARTIAL (describe what's missing) | MISSING

### 2. Role Coverage

For each role, verify they can complete their primary flows:
- **Resident**: browse → join → pay → review
- **Contractor**: create offer → set tiers → view participants → receive payout
- **Buildings Manager**: view residents → invite → view analytics
- **Admin**: approve payouts → resolve escalations → manage users
- **Super Admin**: all admin actions + system config

For each role: COVERED | GAP (describe)

### 3. Payment Safety

- [ ] Payment lifecycle enforced (no status skips)
- [ ] Escrow release requires offer completion + all participants paid
- [ ] Stripe webhook signature verification in place
- [ ] All payment transitions logged in audit_logs
- [ ] Refund flow implemented
- [ ] Partial refund does not exceed original amount

### 4. Security & RLS

- [ ] All tables have RLS enabled (check alembic migrations)
- [ ] All FastAPI routes have auth middleware
- [ ] Role guards on admin-only endpoints
- [ ] Stripe webhook endpoint validates signature
- [ ] File uploads validate type and size

### 5. Test Coverage

- [ ] Playwright E2E specs exist for critical flows
- [ ] Both English AND Hebrew Playwright projects pass
- [ ] Python tests cover payment service
- [ ] Python test coverage >= 50%

### 6. Data Integrity

- [ ] No orphan offer_participants risk
- [ ] No orphan payment_splits risk
- [ ] pricing_tiers JSONB validated before write
- [ ] Contractor payout requires completed offer

## Output format

Produce a structured report:

```
## AUDIT REPORT — Groupio

### Feature Completeness
[status per feature]

### Role Coverage
[status per role]

### Payment Safety
[pass/fail per check]

### Security
[pass/fail per check]

### Test Coverage
[pass/fail per check]

### Data Integrity
[pass/fail per check]

### LAUNCH READINESS
READY | NOT READY

### Critical blockers (if NOT READY)
[list of must-fix items]

### Recommended next steps
[prioritized list]
```
