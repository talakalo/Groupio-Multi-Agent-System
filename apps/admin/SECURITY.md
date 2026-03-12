# Admin App Security Notes

## Token Storage

The admin app stores the access token in `sessionStorage` (key: `auth_token`).

- **Why sessionStorage:** Tab-scoped; cleared when the browser tab is closed. Preferable to `localStorage` for sensitive tokens.
- **XSS exposure:** If the app is compromised by XSS, the token can be read from `sessionStorage`. Mitigations:
  - Never put the token in URLs, query params, or logs.
  - Ensure dependencies are kept up to date.
  - Consider migrating to HTTP-only cookies for the access token when backend supports it.

## Next Steps (Post-Pilot)

1. **Token storage:** Migrate access token to an HTTP-only cookie set by the backend (or a BFF) to remove it from JS-accessible storage.
2. **Middleware role check:** The login page sets `admin_role_verified` cookie after verifying admin role. Middleware could require this cookie (in addition to `refresh_token`) for protected routes once all users have re-logged.
