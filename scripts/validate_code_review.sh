#!/usr/bin/env bash
# Validate codebase against docs/COMPREHENSIVE_CODE_REVIEW.md.
# Exit 0 if all checks pass, 1 otherwise.
# Usage: ./scripts/validate_code_review.sh [--live BASE_URL]
#   --live BASE_URL  Optional: run live HTTP checks against BASE_URL (e.g. http://localhost:8000).

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
FAIL=0

report() {
  if [ "$1" = "ok" ]; then
    echo "  OK: $2"
  else
    echo "  FAIL: $2"
    FAIL=1
  fi
}

echo "--- Code review validation ---"

# 1. Resident building page must call backend (not relative /api/v1/resident/building)
if grep -q "NEXT_PUBLIC_API_URL\|apiBase\|api/v1/buildings/me" "$REPO_ROOT/apps/web/app/(resident)/building/page.tsx" 2>/dev/null; then
  report "ok" "Resident building page uses backend URL and /buildings/me"
else
  report "fail" "Resident building page should use NEXT_PUBLIC_API_URL and /api/v1/buildings/me"
fi

# 2. Backend logout must clear refresh_token cookie with path=/
if grep -q 'delete_cookie.*refresh_token.*path="/"' "$REPO_ROOT/src/api/routes/auth.py" 2>/dev/null; then
  report "ok" "Backend logout clears refresh_token cookie with path=/"
else
  report "fail" "Backend logout should call delete_cookie('refresh_token', path='/')"
fi

# 3. Backend must have GET /buildings/me
if grep -q 'get_my_building\|/me"' "$REPO_ROOT/src/api/routes/buildings.py" 2>/dev/null; then
  report "ok" "Backend has GET /buildings/me"
else
  report "fail" "Backend should expose GET /buildings/me for resident building"
fi

# 4. Signup must set cookie and store (setAuthCookie / setAccessToken)
if grep -q "setAuthCookie\|setAccessToken" "$REPO_ROOT/apps/web/app/(auth)/signup/page.tsx" 2>/dev/null; then
  report "ok" "Signup sets auth cookie and store"
else
  report "fail" "Signup should call setAuthCookie and setAccessToken after success"
fi

# 5. Admin analytics should try backend first
if grep -q "admin/analytics\|backendUrl\|backend" "$REPO_ROOT/apps/admin/lib/hooks.ts" 2>/dev/null; then
  report "ok" "Admin analytics tries backend then fallback"
else
  report "fail" "Admin analytics should try GET /api/v1/admin/analytics first"
fi

# 6. Admin header must have logout wired (onClick or handleLogout)
if grep -q "handleLogout\|onClick.*logout\|LogOut" "$REPO_ROOT/apps/admin/app/layout.tsx" 2>/dev/null; then
  report "ok" "Admin header has logout action"
else
  report "fail" "Admin header should wire Sign out button to logout"
fi

# 7. Mobile buildUrl must preserve base path (/api/v1)
if grep -q 'base.*pathPart\|API_BASE_URL.*path' "$REPO_ROOT/apps/mobile/lib/api.ts" 2>/dev/null; then
  report "ok" "Mobile buildUrl preserves API base path"
else
  report "fail" "Mobile buildUrl should concatenate base + path so /api/v1 is preserved"
fi

# 8. Shared setAuthCookie exists for web auth
if [ -f "$REPO_ROOT/apps/web/lib/auth/setAuthCookie.ts" ]; then
  report "ok" "Shared setAuthCookie helper exists"
else
  report "fail" "apps/web/lib/auth/setAuthCookie.ts should exist for login/signup"
fi

# 9. Resident offers page uses backend URL (not relative /api/v1/offers)
if grep -q "apiBase\|NEXT_PUBLIC_API_URL" "$REPO_ROOT/apps/web/app/(resident)/offers/page.tsx" 2>/dev/null; then
  report "ok" "Resident offers page uses backend URL"
else
  report "fail" "Resident offers page should use NEXT_PUBLIC_API_URL"
fi

# 10. Resident offers page reads items (not offers) from response
if grep -q 'data?.items' "$REPO_ROOT/apps/web/app/(resident)/offers/page.tsx" 2>/dev/null; then
  report "ok" "Resident offers page reads items from response"
else
  report "fail" "Resident offers page should read .items (not .offers) from backend response"
fi

# 11. Resident contractors page reads items (not contractors) from response
if grep -q 'data?.items' "$REPO_ROOT/apps/web/app/(resident)/contractors/page.tsx" 2>/dev/null; then
  report "ok" "Resident contractors page reads items from response"
else
  report "fail" "Resident contractors page should read .items (not .contractors) from backend response"
fi

# 12. Admin escalation page uses API_BASE not API_URL with double /api/v1
if grep -q 'API_BASE' "$REPO_ROOT/apps/admin/app/escalations/page.tsx" 2>/dev/null; then
  report "ok" "Admin escalation page uses correct API_BASE"
else
  report "fail" "Admin escalation page should use API_BASE (not API_URL with double /api/v1)"
fi

# 13. Contractor dashboard uses real backend URLs
if grep -q "NEXT_PUBLIC_API_URL\|apiBase\|api/v1" "$REPO_ROOT/apps/web/app/contractor/dashboard/page.tsx" 2>/dev/null; then
  report "ok" "Contractor dashboard uses backend URL"
else
  report "fail" "Contractor dashboard should use backend API URL"
fi

# 14. Contractor profile uses real backend URLs
if grep -q "NEXT_PUBLIC_API_URL\|apiBase\|api/v1" "$REPO_ROOT/apps/web/app/contractor/profile/page.tsx" 2>/dev/null; then
  report "ok" "Contractor profile uses backend URL"
else
  report "fail" "Contractor profile should use backend API URL"
fi

# 15. Resident profile uses /api/v1/auth/me (not /api/v1/resident/profile)
if grep -q "api/v1/auth/me" "$REPO_ROOT/apps/web/app/(resident)/profile/page.tsx" 2>/dev/null; then
  report "ok" "Resident profile uses /api/v1/auth/me"
else
  report "fail" "Resident profile should use /api/v1/auth/me (not /api/v1/resident/profile)"
fi

# 16. Resident dashboard uses /buildings/me (not /resident/dashboard/stats)
if grep -q "buildings/me" "$REPO_ROOT/apps/web/app/(resident)/dashboard/page.tsx" 2>/dev/null; then
  report "ok" "Resident dashboard uses /buildings/me for stats"
else
  report "fail" "Resident dashboard should use /api/v1/buildings/me"
fi

# 17. Admin dashboard uses useAdminAnalyticsDashboard for real data
if grep -q "useAdminAnalyticsDashboard\|analyticsData" "$REPO_ROOT/apps/admin/app/dashboard/page.tsx" 2>/dev/null; then
  report "ok" "Admin dashboard uses real analytics data"
else
  report "fail" "Admin dashboard should use useAdminAnalyticsDashboard for real contractor count"
fi

# 18. Admin resolve escalation URL includes /api/v1 prefix
if grep -q 'getAuthToken\|rawBase' "$REPO_ROOT/apps/admin/lib/hooks.ts" 2>/dev/null; then
  report "ok" "Admin resolve escalation URL properly constructed"
else
  report "fail" "Admin useResolveEscalation should use proper /api/v1 prefix"
fi

# 19. All PostgresClient methods implemented (buildings, contractors, offers, escalations, payments)
for method in create_building list_buildings update_building create_contractor list_contractors create_offer list_offers create_escalation list_escalations create_payment list_payments_for_user; do
  if grep -q "async def $method" "$REPO_ROOT/src/databases/postgres.py" 2>/dev/null; then
    report "ok" "PostgresClient.$method exists"
  else
    report "fail" "PostgresClient.$method is missing"
  fi
done

if [ "$FAIL" -eq 0 ]; then
  echo "All code review checks passed."
else
  echo "Some checks failed. See docs/COMPREHENSIVE_CODE_REVIEW.md."
fi

# Optional: live HTTP checks
if [ "${1:-}" = "--live" ] && [ -n "${2:-}" ]; then
  BASE="$2"
  echo "--- Live checks against $BASE ---"
  if curl -sf "$BASE/api/v1/health" >/dev/null 2>&1; then
    report "ok" "GET /api/v1/health returns 200"
  else
    report "fail" "GET /api/v1/health failed (is the API running?)"
  fi
  # Unauthenticated /buildings/me should return 401
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/v1/buildings/me" 2>/dev/null || echo "000")
  if [ "$STATUS" = "401" ] || [ "$STATUS" = "422" ]; then
    report "ok" "GET /api/v1/buildings/me without auth returns $STATUS"
  else
    report "fail" "GET /api/v1/buildings/me without auth should return 401 (got $STATUS)"
  fi
fi

exit "$FAIL"
