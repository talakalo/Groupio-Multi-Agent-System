#!/usr/bin/env bash
# Protect the main branch using GitHub Rulesets (require PR, 1 approval).
# Usage: GITHUB_TOKEN=<token> [OWNER=owner REPO=repo] ./scripts/protect-main-branch.sh
# If OWNER/REPO are unset, they are derived from git remote "origin".
# Note: Rulesets for private repos require GitHub Pro; public repos support Rulesets on Free.

set -e

if [[ -z "${GITHUB_TOKEN}" ]]; then
  echo "Error: GITHUB_TOKEN is required." >&2
  echo "Usage: GITHUB_TOKEN=<token> ./scripts/protect-main-branch.sh" >&2
  exit 1
fi

if [[ -z "${OWNER}" || -z "${REPO}" ]]; then
  ORIGIN="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "$ORIGIN" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
    OWNER="${OWNER:-${BASH_REMATCH[1]}}"
    REPO="${REPO:-${BASH_REMATCH[2]%.git}}"
  fi
fi

if [[ -z "${OWNER}" || -z "${REPO}" ]]; then
  echo "Error: Could not determine OWNER/REPO. Set OWNER and REPO or run from a repo with origin pointing to GitHub." >&2
  exit 1
fi

BRANCH="${BRANCH:-main}"
RULESETS_URL="https://api.github.com/repos/${OWNER}/${REPO}/rulesets"
RULESET_NAME="Protect ${BRANCH} (require PR + 1 approval)"

# Ruleset: target main, require pull request with 1 approval, dismiss stale reviews
BODY="{\"name\":\"${RULESET_NAME}\",\"target\":\"branch\",\"enforcement\":\"active\",\"conditions\":{\"ref_name\":{\"include\":[\"refs/heads/${BRANCH}\"],\"exclude\":[]}},\"rules\":[{\"type\":\"pull_request\",\"parameters\":{\"required_approving_review_count\":1,\"dismiss_stale_reviews_on_push\":true,\"require_code_owner_review\":false,\"require_last_push_approval\":false,\"required_review_thread_resolution\":false}}]}"

echo "Creating ruleset for ${OWNER}/${REPO} branch '${BRANCH}'..."
HTTP="$(curl -s -w '%{http_code}' -o /tmp/protect-main-response.json -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "X-GitHub-Api-Version: 2022-11-28" -d "$BODY" "$RULESETS_URL")"

if [[ "$HTTP" == "201" ]]; then
  echo "Ruleset created. Branch '${BRANCH}' now requires a PR with 1 approval."
  exit 0
fi

echo "Request failed (HTTP ${HTTP}). Response:" >&2
cat /tmp/protect-main-response.json 2>/dev/null | head -50 >&2
if [[ "$HTTP" == "403" ]]; then
  echo "" >&2
  echo "Note: Rulesets for private repos require GitHub Pro (or make the repo public)." >&2
fi
exit 1
