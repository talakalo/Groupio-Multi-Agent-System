# Admin App Security Notes

## Token Storage

The admin app uses HTTP-only cookies for authentication (no token in JavaScript).

- **access_token** and **refresh_token** are set as HTTP-only cookies by the backend on login.
- **admin_role_verified** is set by the admin login page after role verification (used by middleware).
- No token is stored in `sessionStorage` or `localStorage` — reduces XSS exposure.
- All API calls use `credentials: "include"` so cookies are sent automatically.

## Middleware

The admin middleware requires both `refresh_token` and `admin_role_verified` cookies for protected routes.
