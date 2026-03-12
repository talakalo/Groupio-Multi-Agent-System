# Broader Launch Deployment Checklist

This document covers deployment configuration required for post-pilot broader beta launch. See `docs/deployment.md` for general production deployment.

## Email Verification

When ready to enforce email verification for new signups:

### 1. Configure SMTP

Set these environment variables (see `docker/.env.example` for full list):

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=noreply@groupio.co.il
SMTP_FROM_NAME=Groupio
```

Without SMTP configured, signup still works but verification emails are not sent. Users remain unverified.

### 2. Set FRONTEND_URL

Required for verification links in emails. Must match your web app URL:

```bash
FRONTEND_URL=https://groupio.co.il
# or https://app.groupio.co.il for subdomain
```

### 3. Enable Enforcement

```bash
ENFORCE_EMAIL_VERIFICATION=true
```

When `true`:
- Login rejects unverified users with 403
- Unverified users see a banner with resend verification option
- Signup sends verification email (if SMTP configured)

**Deployment order:**
1. Deploy with `ENFORCE_EMAIL_VERIFICATION=false` initially
2. Configure SMTP and `FRONTEND_URL`
3. Test verification flow (signup → email → verify-email link)
4. Set `ENFORCE_EMAIL_VERIFICATION=true`

---

## CORS — Include Admin Origin

Admin uses cookie-based auth. API requests include `credentials: "include"`, so the backend **must** allow the admin frontend origin in CORS.

### CORS_ORIGINS

Set via environment (JSON array or comma-separated):

```bash
CORS_ORIGINS=["https://groupio.co.il","https://admin.groupio.co.il"]
```

**Required:** Include both web and admin origins:

| App    | Typical origin                    |
|--------|-----------------------------------|
| Web    | `https://groupio.co.il`           |
| Admin  | `https://admin.groupio.co.il` or `http://localhost:3001` for dev |

In development, `http://localhost:3000` and `http://localhost:3001` are auto-added. In production, you must explicitly add every origin.

---

## Admin Cookie Auth

Admin uses HTTP-only cookies (`refresh_token`, `access_token`) set by the backend. No token in `sessionStorage`. Ensure:

- Backend and admin run on same domain or properly configured cross-origin
- `CORS_ORIGINS` includes admin origin
- `allow_credentials=True` in CORS (already configured in `src/api/main.py`)

---

## Quick Reference

| Variable                    | When to set    | Purpose                              |
|----------------------------|----------------|--------------------------------------|
| `ENFORCE_EMAIL_VERIFICATION` | Broader launch | Gates login for unverified users     |
| `FRONTEND_URL`             | With SMTP      | Base URL for verification links      |
| `SMTP_*`                   | With verification | Send verification emails          |
| `CORS_ORIGINS`             | Production     | Must include web + admin origins     |

---

## WebSocket / Real-time

The backend exposes:

- **Admin:** `ws://host/api/v1/ws/admin` — admin notifications (escalations, etc.)
- **Offers:** `ws://host/ws/offers` — real-time offer updates (if configured)

**Validation:** Unit tests in `tests/unit/test_error_scenarios.py` (WebSocketValidation) and integration tests in `tests/integration/test_websocket.py` cover the admin WebSocket.

**Production:** Use `wss://` (TLS). Ensure your reverse proxy (nginx, Cloudflare) supports WebSocket upgrades.

---

## Mobile / Responsive

Critical routes (signup, login, dashboard, chat) use responsive layouts. For production:

- [ ] Test on real devices or Chrome DevTools device emulation (iPhone, Android)
- [ ] Verify viewport meta: `width=device-width, initial-scale=1`
- [ ] Check touch targets ≥ 44×44px for primary actions
- [ ] RTL layout tested for Hebrew
