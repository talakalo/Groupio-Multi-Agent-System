# Phase 1: External Dependencies Unblocked - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 1-External Dependencies Unblocked
**Areas discussed:** Domain & Cloudflare scope, WhatsApp template wording, Stripe Israel payout setup, Existing Stripe account migration

---

## Domain & Cloudflare Scope

| Option | Description | Selected |
|--------|-------------|----------|
| groupio.co.il only | Single domain for all services | ✓ |
| Both .co.il and .com | Register both, redirect .com → .co.il | |
| Domain already owned | Domain already registered | |

**Domain choice:** groupio.co.il only

| Option | Description | Selected |
|--------|-------------|----------|
| Separate subdomains per service | app., admin., api. subdomains | |
| Web on apex, API subdomain | groupio.co.il + api.groupio.co.il | |
| Path-based, no subdomains | All on one domain, /api /admin paths | ✓ |

**Subdomain choice:** Path-based routing, no subdomains

| Option | Description | Selected |
|--------|-------------|----------|
| Full proxy (Recommended) | Cloudflare proxies all traffic, WAF on webhooks | |
| DNS-only, no proxy | Cloudflare DNS only, Vercel/Hetzner direct | |
| CDN for web only | Cloudflare for Next.js, API direct | |
| (Freeform) | "Can all be at vercel" | ✓ |

**Cloudflare choice:** Everything on Vercel for frontends; no Cloudflare proxy in Phase 1. Cloudflare CDN deferred to Phase 3.
**Notes:** User indicated Vercel handles all fronted hosting. FastAPI backend requires separate VPS hosting (can't run on Vercel). Cloudflare proxy/WAF moved to Phase 3 Infrastructure work.

---

## WhatsApp Template Wording

| Option | Description | Selected |
|--------|-------------|----------|
| Hebrew only | Templates in Hebrew — primary language | |
| Hebrew + English | Both language variants submitted to Meta | ✓ |
| English first | English now, Hebrew later | |

**Language choice:** Hebrew + English

| Option | Description | Selected |
|--------|-------------|----------|
| Formal (פורמלי) | Formal Hebrew (אתה, שלום) | |
| Casual (יומיומי) | Casual Israeli Hebrew (אתה, היי) | ✓ |
| Neutral | Factual and clear, no register | |

**Tone choice:** Casual (יומיומי)

| Option | Description | Selected |
|--------|-------------|----------|
| Draft in planning phase | Planning agent drafts all 5 templates for review | ✓ |
| I'll write them | User writes template text before submission | |
| Placeholders first | Submit generic placeholders for business account approval | |

**Template authoring:** Planning agent drafts 5 templates (offer_expiry, payment_reminder, payment_confirmation, offer_joined, contractor_matched) in Hebrew + English for user review.
**Notes:** Templates must use Utility category (not Marketing) to avoid higher rejection rates. Hebrew tone should be friendly/emoji-ok.

---

## Stripe Israel Payout Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Israeli Stripe account | Register under Israeli entity for native ILS payouts | ✓ |
| EU Stripe account | Ireland entity, ILS conversions handled | |
| TBD | Need legal/accountant input | |

**Entity choice:** Israeli Stripe account

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate on approval | Instant payout after admin approval | |
| Weekly batched | Fixed weekly payout schedule | |
| 7-day hold post-release | 7-day dispute window after escrow release | ✓ |

**Payout timing:** 7-day hold after escrow release before contractor receives funds.

---

## Existing Stripe Account Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Starting fresh | No account exists, register new Israeli account | |
| Test account exists | Test-mode account exists, KYC for live mode | ✓ |
| Live account exists | Live account under different entity, needs migration | |

**Account status:** Test-mode account exists — upgrade via KYC for Israeli live mode.

| Option | Description | Selected |
|--------|-------------|----------|
| Platform model (Connect Express) | Groupio platform, contractors connect via Stripe Connect | |
| Direct charges, no Connect | Groupio collects and remits | |
| TBD — need legal input | Architecture decision needs legal/accountant | ✓ |

**Connect architecture:** TBD — legal input required. Decision needed before Phase 5 planning.

---

## Claude's Discretion

- Template variable format: Use `{{1}}` Meta-standard placeholders in template bodies
- Template category selection: Utility category recommended (lower rejection rate vs Marketing)
- Supabase upgrade: Proceed immediately without further discussion

## Deferred Ideas

- Cloudflare WAF and proxy — Phase 3 Infrastructure & Secrets
- Stripe Connect architecture decision — before Phase 5 planning (external legal input)
- Business entity verification — assumed handled offline
