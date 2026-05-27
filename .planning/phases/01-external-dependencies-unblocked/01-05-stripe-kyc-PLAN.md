---
plan: "01-05-stripe-kyc"
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements:
  - OPS-01
  - INFRA-01
---

# Plan 01-05: Stripe Entity Decision & KYC Initiation

## Objective

Resolve which legal entity will register the Stripe live-mode account (Israel is not a directly supported Stripe country), then begin KYC on the existing test-mode account. Phase 1 only initiates KYC — Stripe Connect architecture (D-12) and payout configuration are Phase 5 work.

**Autonomous: false** — requires legal/business entity decision and access to Stripe Dashboard.

---

## Tasks

<task id="T1" name="Confirm Stripe entity path (BLOCKING — must resolve before KYC)">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 3.1: Israel not a supported Stripe country; Section 3.2: entity options — US LLC via Atlas, EU entity, or existing entity)
    - .planning/phases/01-external-dependencies-unblocked/01-CONTEXT.md (D-09: Israeli Stripe account; D-10: existing test-mode account)
  </read_first>
  <action>
    Determine which entity will register the Stripe live-mode account. The three viable paths are:

    Path A — Existing registered entity in a Stripe-supported country (US LLC, UK Ltd, EU GmbH, etc.):
      Required: Company registration certificate, director passport(s), bank account in company name, tax ID (EIN for US, VAT for EU)

    Path B — Form a new US LLC via Stripe Atlas (~$500 one-time fee):
      Required: Personal information for director, business description, payment of Atlas fee
      Timeline: 1–3 weeks for LLC formation before KYC can proceed

    Path C — Other workaround (consult accountant/lawyer for Israeli startup Stripe structure):
      Timeline: Unknown — flag as blocked until legal advice received

    DECISION: Record the chosen path in docs/runbooks/phase1-external-deps.md under "Open Questions → Stripe entity path".
    If Path A: proceed directly to T2.
    If Path B or C: record as BLOCKED in the Submission Tracker; no further action until entity is established.
  </action>
  <acceptance_criteria>
    - Entity path decision documented in docs/runbooks/phase1-external-deps.md
    - If Path A: entity details (company name, country, registration number) noted in runbook
    - If Path B/C: Submission Tracker row "Stripe entity path decision" updated to show chosen path and estimated timeline
  </acceptance_criteria>
</task>

<task id="T2" name="Initiate Stripe live-mode KYC on existing account">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 3.2: KYC documents required for chosen entity path; Section 3.4: what Phase 1 actually does for Stripe)
    - .planning/phases/01-external-dependencies-unblocked/01-CONTEXT.md (D-10: upgrade existing test-mode account, do not create new one; D-12: Connect architecture deferred to Phase 5)
  </read_first>
  <action>
    Prerequisites: Entity path confirmed as Path A (T1).

    1. Log in to Stripe Dashboard (existing test-mode account).
    2. Navigate to Activations → Activate your account (live mode).
    3. Complete the business information form:
       - Business type and registration number for chosen entity
       - Director/owner details and government-issued photo ID upload
       - Bank account details for the entity (routing + account number for US; IBAN for EU)
       - Business address
    4. Submit KYC. Stripe typically reviews within 1–3 business days.
    5. Record submission date in docs/runbooks/phase1-external-deps.md row "Stripe KYC initiation".
    6. Do NOT configure Stripe Connect, payout schedules, or webhook endpoints for live mode — those are Phase 5 tasks.
  </action>
  <acceptance_criteria>
    - Stripe Dashboard → Activations shows KYC submission in progress or completed
    - Submission date recorded in docs/runbooks/phase1-external-deps.md
    - Stripe test-mode keys remain active (no disruption to existing test/dev workflow)
  </acceptance_criteria>
</task>

---

## must_haves

- Stripe entity path decision documented (even if the decision is "blocked pending legal advice")
- If entity exists: KYC initiated in Stripe Dashboard and submission date recorded in ops runbook

---

<threat_model>
## Threat Model (ASVS L1)

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Live Stripe keys accidentally committed to git | HIGH | After KYC approval, live keys (sk_live_...) must go into production secrets only. .env.example has commented placeholder only (Plan 01-01 T4). |
| KYC identity fraud / account takeover | HIGH | Enable 2FA on Stripe account. Use official company documents only. Stripe will verify document authenticity. |
| Connect architecture chosen prematurely | MEDIUM | D-12 explicitly defers Connect decision to Phase 5. Phase 1 only initiates KYC; do not configure Connect Express or Standard accounts yet. |
| Test-mode keys disrupted during live-mode activation | LOW | Activating live mode does not invalidate test keys. Both coexist. Confirm test suite still uses sk_test_... after activation. |
| Israel entity unavailability delays launch | HIGH | Identified as Risk 1 in RESEARCH.md. Mitigated by choosing an existing Stripe-supported entity. If none exists, document timeline for Path B (US LLC) and adjust Phase 5 planning accordingly. |
</threat_model>
