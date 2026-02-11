# GitHub Actions

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI** | Push to `main`/`dev`, PRs targeting `main`/`dev` | Lint, test, build, security scan, Docker build. Gate for merge (use **CI Success** in branch protection). |
| **Deploy** | After CI succeeds on `main`/`dev`, or manual dispatch | Deploy backend (Docker), web/admin (Vercel), mobile (EAS). Migrations run after backend deploy. |
| **Auto Merge** | On CI completion, PR events | Auto-merge PRs (e.g. feature→dev, dev→main) when CI passes and checks are green. |

## Branch protection

- **main** / **dev**: Require status check **CI Success** before merge.
- Optional: Require PR reviews, up-to-date branch.

## Deploy behavior

- **Automatic**: Pushing to `main` or `dev` runs CI; when CI completes successfully, Deploy runs for that branch (`main`→production, `dev`→staging).
- **Manual**: Actions → Deploy → Run workflow → choose environment (staging/production).

## Secrets / variables

- **CI**: `CODECOV_TOKEN` (optional, for coverage).
- **Deploy**: `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `VERCEL_TOKEN`, `EXPO_TOKEN`, `DATABASE_URL`, `SLACK_WEBHOOK_URL` (optional). Variables: `DOCKER_REGISTRY`.
