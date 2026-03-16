# Lessons learned

Record patterns and rules here after user corrections or recurring mistakes. Review at session start.

## Format

For each lesson:

- **What happened**: Brief description of the mistake or correction.
- **Rule**: What to do (or avoid) next time.
- **When**: Optional date or context.

---

## Open PRs snapshot (2026-02-21)

Transcribed from screenshot:

| # | Title | Status |
|---|-------|--------|
| #76 | fix: handle pulls.create errors gracefully in dev-to-main-pr workflow (#75) | ✗ Checks failing, 1 comment |
| #72 | feat: production-readiness overhaul — scrub secrets, remove mock data, add validation | Open, 9h |

- **PR #76** is an auto-generated dev→main PR (created by `.github/workflows/dev-to-main-pr.yml` after PRs #73–#75 merged into dev). Do NOT delete it — fix the failing checks, then merge to promote dev→main.
- **PR #72** is a large feature branch (15 commits). Merge conflicts with dev were resolved in this session. Merge it into dev to land production-readiness improvements.

## Lessons

### Design system and frontend

- **Design token changes are high-blast-radius** — Always verify on key pages first before rolling out token updates.
- **RTL requires logical CSS properties** — Use `start`/`end` (and `margin-inline-start`, `padding-inline-end`, etc.) not `left`/`right`.
- **Hebrew typography needs line-height >= 1.4** — Improves readability for Hebrew text.
- **Skeleton loading is better UX than spinners** — Use skeleton placeholders for content-heavy loading states.
- **Trust badges above the fold increase checkout conversion** — Position trust indicators prominently in checkout flows.
- **window.prompt() and window.location.reload() are anti-patterns** — Use modals and state invalidation instead.

<!-- Add entries below as corrections and patterns emerge -->
