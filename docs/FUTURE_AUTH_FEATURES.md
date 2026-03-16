# Future Auth Features — Design Notes

## 2FA (Two-Factor Authentication)
- `users.totp_secret` column already exists (migration 004)
- Backend: add `POST /auth/2fa/enable`, `POST /auth/2fa/verify`, `POST /auth/2fa/disable`
- Use `pyotp` library for TOTP generation/verification
- Frontend: QR code setup page, 6-digit entry during login
- Priority: Beta+

## Email Change Flow
- Backend: `POST /auth/email/change` → sends verification to NEW email
- Requires current password confirmation
- Token-based dual verification (old email + new email)
- Priority: Public launch

## Social OAuth (Google)
- Backend: `GET /auth/oauth/google` → redirect to Google
- Callback: `GET /auth/oauth/google/callback` → create/link user
- Use `authlib` or `python-social-auth`
- Frontend: "Sign in with Google" button on login/signup
- Priority: Public launch
