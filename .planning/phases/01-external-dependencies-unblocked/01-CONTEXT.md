# Phase 1: External Dependencies Unblocked - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Kick off every external process that has a multi-week approval or procurement lead time — Meta WhatsApp Business verification, template submissions, domain registration, Supabase Pro upgrade, and Stripe Israeli account KYC. This phase is mostly operational (submitting forms, upgrading accounts) with minimal code changes. Goal: nothing blocks launch due to an external dependency that should have been started earlier.

</domain>

<decisions>
## Implementation Decisions

### Domain & Hosting
- **D-01:** Register **groupio.co.il** only — no .com needed for MVP.
- **D-02:** **Path-based routing, no subdomains** — all traffic on groupio.co.il (no api., admin., app. subdomains).
- **D-03:** **Vercel handles all frontend hosting** (apps/web and apps/admin) — already wired in deploy.yml. No additional Cloudflare proxy needed in Phase 1; Cloudflare CDN configuration is Phase 3 infra work.
- **D-04:** Domain registration via Isoc.org.il / Name.co.il for .co.il; DNS initially pointed at Vercel.

### WhatsApp Templates
- **D-05:** Templates in **both Hebrew + English** — submit separate Hebrew and English variants to Meta.
- **D-06:** **Casual Israeli Hebrew tone** (יומיומי) — friendly WhatsApp-native register, not formal.
- **D-07:** **Planning agent drafts all 5 templates** (offer_expiry, payment_reminder, payment_confirmation, offer_joined, contractor_matched) in Hebrew + English for user review before submission.
- **D-08:** Templates must avoid promotional language (Meta rejects sales copy). Focus on transactional / utility category. Include variable placeholders in `{{1}}` format per Meta spec.

### Stripe Setup
- **D-09:** **Israeli Stripe account** — register under Israeli business entity for native ILS payouts.
- **D-10:** **Test-mode account already exists** — upgrade/KYC the existing account for live mode, do not create a new one.
- **D-11:** **Payout timing: 7-day hold after escrow release** — dispute window before contractor receives funds.
- **D-12:** **Stripe Connect architecture TBD** — needs legal/accountant input before Phase 5 payment work. Platform model (Connect Express) vs direct charges to be decided externally. Phase 1 only initiates KYC; Connect architecture decision belongs in Phase 5 planning.

### Supabase
- **D-13:** Upgrade Supabase to **Pro tier** ($25/month) immediately — free tier pauses after 7 days inactivity and risks data loss. Enable PgBouncer transaction pooler on upgrade.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Project goals, core value, scope boundaries
- `.planning/REQUIREMENTS.md` — OPS-01 (WhatsApp templates) and INFRA-01 (Supabase Pro) are the v1 requirements for this phase

### Roadmap & Phase Plans
- `.planning/ROADMAP.md` — Phase 1 plans (5 concrete tasks) and success criteria

### Existing Integration Code
- `src/services/whatsapp_bot.py` — Existing WhatsApp bot handler; template submissions must be compatible with this integration
- `.github/workflows/deploy.yml` — Existing CI/CD deploy pipeline; Vercel config already wired
- `docker/staging-minimal.env` — Current env var placeholders; Phase 3 replaces with Doppler

### External Docs (reference during planning)
- Meta WhatsApp Business template guidelines: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
- Stripe Israel / Connect: https://stripe.com/docs/connect/express-accounts

No internal ADRs exist yet for this phase — first phase of planning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/whatsapp_bot.py` — WhatsApp bot already exists; template submissions should use the same `WHATSAPP_PHONE_ID` and `WHATSAPP_API_TOKEN` vars already defined in the codebase
- `.github/workflows/deploy.yml` — Deploy pipeline to Vercel + VPS already exists; no new pipeline needed for Phase 1

### Established Patterns
- All secrets are env vars — new accounts/keys from this phase go into the existing `.env.example` as documented placeholders
- `docker/staging-minimal.env` uses placeholder values — convention is to keep real values out of git

### Integration Points
- New Stripe live-mode keys (from KYC) replace `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` placeholders
- New `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_ID` from approved Meta Business account replace existing placeholders
- groupio.co.il domain DNS → Vercel project (already configured in Vercel dashboard per deploy.yml)

</code_context>

<specifics>
## Specific Ideas

- WhatsApp template names to submit: `groupio_offer_expiry`, `groupio_payment_reminder`, `groupio_payment_confirmation`, `groupio_offer_joined`, `groupio_contractor_matched`
- Template category: **Utility** (not Marketing) — avoids higher rejection rate and user opt-out requirements
- Hebrew tone example: "היי! ההצעה שהצטרפת אליה תפוג בעוד 24 שעות 🔔" (casual, emoji ok, direct)
- Stripe KYC docs needed: Israeli business registration certificate (אישור רישום חברה), bank account details, director ID

</specifics>

<deferred>
## Deferred Ideas

- **Cloudflare proxy / WAF** — discussed but deferred to Phase 3 (Infrastructure & Secrets). Phase 1 only handles domain registration and DNS to Vercel.
- **Stripe Connect architecture decision** (platform vs direct) — requires legal/accountant input; decision needed before Phase 5 planning, not Phase 1.
- **Business entity status** — not discussed; assumed entity exists or will be handled offline before Stripe KYC submission.
- **EspoCRM setup** — not a Phase 1 concern; CRM sync is feature-flagged off (`ENABLE_CRM_SYNC=false`) for MVP.

</deferred>

---

*Phase: 1-External Dependencies Unblocked*
*Context gathered: 2026-05-06*
