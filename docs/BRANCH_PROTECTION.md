# Branch protection: block direct push to main, allow only PRs from dev

To enforce that **nothing is merged into `main` except via a PR from `dev`**:

## 1. GitHub branch protection for `main`

In the repo: **Settings → Branches → Add branch protection rule** (or edit the rule for `main`).

Configure:

| Setting | Value |
|--------|--------|
| **Branch name pattern** | `main` |
| **Require a pull request before merging** | ✅ Enabled. Optionally set "Require approvals" (e.g. 1). |
| **Require status checks to pass before merging** | ✅ Enabled. |
| **Require branches to be up to date before merging** | Optional (recommended). |
| **Status checks that are required** | Add: **`Require PR from dev`** (this is the job name from `.github/workflows/require-pr-from-dev.yml`). You can also require **`CI Success`** and other CI jobs. |
| **Do not allow bypassing the above settings** | ✅ Enabled (so admins also follow the rule). |
| **Restrict who can push to matching branches** | Leave empty so no one can push directly; merges happen only via PRs that pass the checks. |

Save the rule.

## 2. What this does

- **Direct pushes to `main`** are blocked (no one can push to `main`).
- **PRs into `main` from any branch other than `dev`** fail the status check **Require PR from dev** and cannot be merged.
- **Only a PR that has base `main` and head `dev`** passes the check and can be merged. Typically that is the auto-created “Release: merge dev into main” PR.

## 3. Workflow that enforces it

The workflow **Require PR from dev** (`.github/workflows/require-pr-from-dev.yml`) runs on every PR targeting `main` and:

- **Passes** when the PR’s **head branch is `dev`**.
- **Fails** when the PR’s head branch is anything else (e.g. a feature branch), and posts a comment on the PR explaining that only `dev` → `main` is allowed.

After you add the branch protection rule and the **Require PR from dev** status check, `main` will only accept merges from PRs that come from `dev`.
