# Production Rollout Checklist — AI Governance Patch 2

**Patch scope:** Four critical AI governance defects remediated across auth middleware,
admin approval workflow, agent mode persistence, and WhatsApp verification gate.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/api/middleware/auth.py` | `get_current_user` now raises HTTP 403 for unverified users when `ENFORCE_EMAIL_VERIFICATION=True` |
| `src/api/routes/admin.py` | Approve route executes `provider.refund()` (idempotent); both approve/reject write `audit_log` entries; `GET /admin/agents/autonomy` reads from `system_settings` DB first |
| `src/agents/payment.py` | `_handle_refund_request` reads `PAYMENT_AGENT_MODE` from `system_settings` DB at call time |
| `src/api/routes/webhooks.py` | WhatsApp webhook calls `get_user_by_phone`; unverified registered users are blocked with a Hebrew degrade message |

---

## PRE-DEPLOY VALIDATION

### Environment configuration checks

```bash
# Required in non-development environments
echo "ENFORCE_EMAIL_VERIFICATION should be true:"
grep ENFORCE_EMAIL_VERIFICATION .env

echo "PAYMENT_PROVIDER should NOT be 'mock':"
grep PAYMENT_PROVIDER .env

echo "PAYMENT_WEBHOOK_SECRET must be set:"
grep PAYMENT_WEBHOOK_SECRET .env

echo "SMTP must be configured for verification emails:"
grep SMTP_HOST .env
grep SMTP_USER .env

echo "Redis must be authenticated:"
grep REDIS_PASSWORD .env
```

### System settings seed check

Before deploying, confirm the `system_settings` table contains valid mode entries.
If the table is empty, `GET /admin/agents/autonomy` will fall back to env values —
which is safe, but means changes via the admin UI will start working immediately
after deploy without pre-seeding.

```sql
SELECT key, value FROM system_settings
WHERE key IN (
  'MATCHING_AGENT_MODE',
  'PRICING_AGENT_MODE',
  'VETTING_AGENT_MODE',
  'OUTREACH_AGENT_MODE',
  'PAYMENT_AGENT_MODE'
);
```

Expected valid values per key: `auto`, `recommend`, `gated`.

### Database migration status

```bash
alembic current          # Confirm HEAD is applied
alembic history --verbose | head -5
```

The following tables must exist:
- `users` (with `is_verified` column)
- `system_settings`
- `audit_logs`
- `pending_agent_decisions`
- `payments` (with `status` column)
- `invoices` (with `status` column)

### Stripe / payment provider check

```bash
# Verify Stripe is configured (not mock)
grep STRIPE_SECRET_KEY .env
grep STRIPE_WEBHOOK_SECRET .env

# Test Stripe connectivity (staging only)
python -c "
import stripe, os
stripe.api_key = os.environ['STRIPE_SECRET_KEY']
stripe.Account.retrieve()
print('Stripe OK')
"
```

---

## STAGING VALIDATION

Run the following manual scenarios on staging before production deploy.

### Scenario 1: Email verification enforcement

```
1. Register a new user (resident)
2. Do NOT click the verification link
3. Attempt to call GET /api/v1/payments/my with the user's token
4. Expected: HTTP 403, detail contains "verif"
5. Click the verification link
6. Retry the request
7. Expected: HTTP 200
```

### Scenario 2: Full refund governance flow

```
1. Set PAYMENT_AGENT_MODE = "gated" via PUT /api/v1/admin/settings
2. Verify GET /api/v1/admin/agents/autonomy shows payment = "gated"
3. As resident, send refund request message via POST /api/v1/message
4. Verify response contains needs_human = true
5. As admin, call GET /api/v1/admin/agents/pending-decisions?status=pending
6. Verify refund_request decision appears
7. Call POST /api/v1/admin/agents/pending-decisions/{id}/approve?note="approved"
8. Verify response status 200
9. Call GET /api/v1/admin/audit-logs — verify entries:
   - action = "approve_pending_decision"
   - action = "refund_executed"
10. Check Stripe dashboard (or mock logs) for refund record
11. Verify payment record in DB shows status = "refunded"
12. Verify invoice record shows status = "refunded"
```

### Scenario 3: Reject flow

```
1. Create a refund pending decision (as in Scenario 2 steps 1-6)
2. Call POST /api/v1/admin/agents/pending-decisions/{id}/reject?note="not eligible"
3. Verify response 200
4. Verify audit_logs contains action = "reject_pending_decision"
5. Attempt to approve the same decision
6. Expected: HTTP 409
7. Verify no Stripe refund was issued
```

### Scenario 4: Agent mode change persistence

```
1. Call PUT /api/v1/admin/settings with body {"PAYMENT_AGENT_MODE": "auto"}
2. Immediately call GET /api/v1/admin/agents/autonomy
3. Expected: payment = "auto" (no restart required)
4. Send a refund request as resident
5. Expected: refund executes automatically (auto mode), no pending decision created
```

### Scenario 5: WhatsApp verification gate

```
1. Register a user with a known phone number, do NOT verify
2. Send a WhatsApp webhook POST to /api/v1/webhooks/whatsapp from that phone
3. Expected: response = {"status": "unverified"}
4. Expected: WhatsApp reply sent with Hebrew verification prompt
5. Expected: orchestrator NOT invoked (no agent activity)
6. Verify the user, repeat step 2
7. Expected: response = {"status": "processed"}, orchestrator invoked
```

---

## PRODUCTION DEPLOY

### Deploy sequence

```bash
# 1. Deploy new backend version
docker pull groupio/api:patch2
docker-compose up -d api

# 2. Verify health
curl https://api.groupio.co.il/health

# 3. Confirm migration status
docker exec api alembic current

# 4. Deploy admin UI (if applicable)
# [frontend deploy steps here]

# 5. Workers: restart only if environment variables changed
# (business logic workers do NOT need restart for this patch —
#  mode changes are now read from DB at call time)
```

### Workers restart decision table

| Changed? | Restart workers? |
|----------|-----------------|
| ENV vars changed | Yes |
| Only code deployed | No — DB-first mode reads handle it |
| JWT_SECRET_KEY changed | Yes — all active sessions invalidated |

---

## POST-DEPLOY MONITORING

### Immediate checks (first 15 minutes)

```bash
# Watch for refund execution logs
docker logs api --tail=200 -f | grep "refund executed\|refund_execution_failed"

# Watch for auth rejections (should be non-zero for unverified accounts)
docker logs api --tail=200 -f | grep "Email not verified"

# Check for approval/rejection audit trail
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.groupio.co.il/api/v1/admin/audit-logs?action=approve_pending_decision"
```

### Metrics to monitor (first 24 hours)

| Metric | Expected change | Alarm threshold |
|--------|----------------|-----------------|
| HTTP 403 rate | Slight increase (unverified users now blocked) | > 5% of all requests |
| `/admin/agents/pending-decisions` queue depth | No change unless refund approvals were backlogged | > 100 pending |
| Refund execution errors (`refund_execution_failed` in audit_log) | Should be 0 | Any occurrence |
| WhatsApp `unverified` responses | Proportional to unverified user base | Monitor for spikes |
| Payment `status=refunded` transitions | Only when admin explicitly approves | Any without approval |

### Audit log query templates

```sql
-- All refund executions since deploy
SELECT * FROM audit_logs
WHERE action = 'refund_executed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Any refund failures
SELECT * FROM audit_logs
WHERE action = 'refund_execution_failed'
ORDER BY created_at DESC;

-- Pending decision backlog
SELECT agent_name, action_type, COUNT(*) as count
FROM pending_agent_decisions
WHERE status = 'pending'
GROUP BY agent_name, action_type;
```

---

## ROLLBACK PLAN

### Scenario A: Refund execution anomaly detected

If unexpected refunds are being executed:

```bash
# 1. Force payment mode to gated via admin API (no restart required)
curl -X PUT https://api.groupio.co.il/api/v1/admin/settings \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"PAYMENT_AGENT_MODE": "gated"}'

# 2. Verify mode changed
curl https://api.groupio.co.il/api/v1/admin/agents/autonomy \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: {"payment": "gated", ...}
```

This takes effect immediately on the next request — no restart needed.

### Scenario B: Auth 403 regression (users locked out unexpectedly)

If verified users are being incorrectly blocked:

```bash
# 1. Temporarily disable enforcement (emergency only)
curl -X PUT https://api.groupio.co.il/api/v1/admin/settings \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"ENFORCE_EMAIL_VERIFICATION": false}'
# NOTE: This requires restarting the API since ENFORCE_EMAIL_VERIFICATION
# is read from the env-based Settings singleton, not system_settings DB.
# Correct fix: set ENFORCE_EMAIL_VERIFICATION=false in .env and restart.
```

### Scenario C: Full code rollback

```bash
docker pull groupio/api:patch1  # previous stable image
docker-compose up -d api
# Verify health
curl https://api.groupio.co.il/health
```

**Data safety:** All DB changes (audit_logs, pending_decision status updates)
are forward-compatible. Rolling back the code does NOT require DB rollback.
Pending decisions created during Patch 2 will remain in the DB and will be
visible in the admin UI after rollback — they just won't auto-execute on approval.

---

## REMAINING RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| `ENFORCE_EMAIL_VERIFICATION` reads from env, not DB — cannot be toggled live | Medium | Document as known limitation; plan future migration to DB-controlled flag |
| Other agents (matching, pricing, vetting, outreach) still read mode from env `@lru_cache` | Medium | Next patch cycle; lowest risk as those agents perform no irreversible financial actions |
| WhatsApp `get_user_by_phone` adds one DB query per message | Low | Add Redis caching if volume warrants; current risk is negligible at <1000 messages/day |
| Refund without `payment_id` in payload (legacy queued decisions) | Low | Logged as warning; no action taken; admin must handle manually |
| No automated test for the email verification email SMTP path | Low | Out of scope for Patch 2; SMTP config validation is pre-deploy manual step |

---

## GO / NO-GO CRITERIA

| Criterion | Check | Status |
|-----------|-------|--------|
| All 3 test files pass (`pytest tests/unit/test_governance_patch2_unit.py tests/integration/test_governance_patch2_integration.py tests/e2e/test_governance_patch2_e2e.py`) | Automated CI | Required |
| `ENFORCE_EMAIL_VERIFICATION=True` in production env | Manual | Required |
| `PAYMENT_PROVIDER` != "mock" in production env | Manual | Required |
| `PAYMENT_WEBHOOK_SECRET` set | Manual | Required |
| Stripe webhook URL configured and verified | Manual | Required |
| Staging full refund flow completed without error | Manual | Required |
| Staging WhatsApp verification gate validated | Manual | Required |
| Rollback plan tested on staging | Manual | Recommended |
| SMTP verified (test verification email received) | Manual | Required |

**Recommendation: GO when all "Required" criteria are met.**
