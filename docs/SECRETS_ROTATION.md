# Secrets Rotation Guide

This document describes how to rotate sensitive secrets in production without downtime where possible.

## JWT_SECRET_KEY

**Impact:** Rotating invalidates all active sessions. Users must log in again.

1. Generate new secret:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

2. Update `JWT_SECRET_KEY` in your deployment config (e.g. Kubernetes Secret, env file).

3. Restart the API server. All existing access and refresh tokens become invalid.

4. Communicate to users that they may need to log in again.

**Recommendation:** Rotate during low-traffic window. Consider gradual rollout if running multiple API replicas (not supported by default — all instances share the secret).

---

## API_KEYS (Service-to-Service)

These are used for server-to-server authentication. Rotate by:

1. Generate new key(s):
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. Add new key to `API_KEYS` JSON array (append, do not remove old yet):
   ```json
   ["old_key_here", "new_key_here"]
   ```

3. Update all clients to use the new key.

4. Remove the old key from `API_KEYS`.

5. Restart API server (or deploy config change).

---

## Database (PostgreSQL)

**DATABASE_URL** contains the DB password. Rotating it requires:

1. Create new DB user with new password.
2. Update `DATABASE_URL` in deployment.
3. Restart API server.
4. Revoke old user (after confirming new connection works).

---

## Redis

**REDIS_URL** may include credentials. Similar to database: create new credential, update URL, restart, then revoke old.

---

## SMTP

**SMTP_PASSWORD** — update in env and restart. No session impact; only affects new emails.

---

## Stripe / Payment

- **STRIPE_SECRET_KEY**: Create new key in Stripe Dashboard (Restricted key or new Secret key). Update env and restart. Old key can be revoked after cutover.
- **STRIPE_WEBHOOK_SECRET**: Create new webhook endpoint in Stripe, get new signing secret. Update endpoint URL if needed. Update `STRIPE_WEBHOOK_SECRET` and restart.
- **PAYMENT_WEBHOOK_SECRET**: Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. Update in both API and payment provider config.

---

## Production Checklist (Secrets)

- [ ] All secrets are in secure secret store (e.g. Vault, Kubernetes Secrets), not in repo
- [ ] `JWT_SECRET_KEY` is at least 64 characters and not a default
- [ ] Rotation procedure documented for your deployment
- [ ] Incident runbook includes "rotate compromised secret" steps
