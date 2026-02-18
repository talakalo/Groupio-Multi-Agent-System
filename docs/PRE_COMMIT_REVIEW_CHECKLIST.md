# Pre-commit review checklist

Use this when you have uncommitted changes (e.g. auth, layouts, docker) and want a quick sanity-check before committing.

---

## Untracked files – what to do

| Path | Recommendation | Why |
|------|----------------|----------------|
| `.cursor/worktrees.json` | **Add to .gitignore** (already added) | Local worktree config; not shared. |
| `.cursor/rules/*.mdc` | **Track** (commit them) | Shared Cursor rules for the team. |
| `scripts/seed_user_accounts.py` | **Track** (commit) | Reproducible seeding; others need it. |
| New `page.tsx` under `app/` | **Track** (commit) | App code. |
| `.env`, `.env.local` | **Never commit** (already in .gitignore) | Secrets. |
| `*.log`, `node_modules/` | **Never commit** (already in .gitignore) | Generated / deps. |

---

## Modified files – what to check

### Auth (`authStore.ts`, `auth.py` routes, `auth.py` middleware, `user.py`)
- [ ] No secrets or tokens logged or in error messages.
- [ ] Cookie names/paths and CORS match between frontend and backend.
- [ ] Login/signup/logout still set/clear the same cookies and store.
- [ ] Any new role or permission is enforced in middleware/route, not only in UI.

### Layouts (`layout.tsx` under resident/contractor/admin)
- [ ] Nav links and redirects point to existing routes.
- [ ] Auth guard (if any) uses the same token/cookie as the rest of the app.
- [ ] No hardcoded user name/email; use auth state or `/me`.

### Docker (`docker-compose.yml`, `Dockerfile`, `.env.example`)
- [ ] No real secrets in `.env.example` (only placeholders).
- [ ] `docker-compose` env vars match what the app expects (e.g. `DATABASE_URL`, `NEXT_PUBLIC_*`).
- [ ] Build context and Dockerfile still work: `docker compose build --no-cache` (optional quick test).

### Web app (`page.tsx`, `en.json`, `he.json`)
- [ ] New/updated strings have both `en` and `he` (or fallback).
- [ ] `t('key', { ... })` has all variables the message expects (e.g. no FORMATTING_ERROR).
- [ ] API calls use `NEXT_PUBLIC_API_URL` (or equivalent) and auth headers where needed.

### Backend (`main.py`, routes)
- [ ] New routes are mounted and documented if needed.
- [ ] No debug `print()` or broad `except` that hides errors.

---

## Quick commands

```bash
# See what would be committed
git status -s
git diff --stat

# See diff for a specific area
git diff -- apps/web/lib/stores/authStore.ts
git diff -- src/api/routes/auth.py
git diff -- docker/
```
