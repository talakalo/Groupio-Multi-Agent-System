---
plan: "01-04-meta-whatsapp-setup"
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements:
  - OPS-01
---

# Plan 01-04: Meta Business Verification & WhatsApp Template Submission

## Objective

Create (or verify) the Meta Business Manager account, initiate business verification, and submit all 10 WhatsApp message template variants (5 templates × Hebrew + English) in UTILITY category. Templates are pre-drafted in RESEARCH.md; user must review before submission.

**Autonomous: false** — requires access to business.facebook.com and official business documents.

---

## Tasks

<task id="T1" name="Create or verify Meta Business Manager account">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 2.1: Meta Business account pre-requisite, verification steps, documents required, timeline up to 14 business days)
  </read_first>
  <action>
    1. Go to business.facebook.com. Log in or create a new account under the company name.
    2. Navigate to Security Center → Start Verification (if not already verified).
    3. Upload required documents — ALL must show the exact same business name and address:
       - Primary: business license (רישיון עסק) OR certificate of incorporation (תעודת התאגדות) OR tax registration certificate
       - Address proof: utility bill / bank statement in company name showing business address
    4. Submit and record the ticket/reference number in docs/runbooks/phase1-external-deps.md row "Meta Business Verification".
    5. Set a calendar reminder to follow up after 24 hours (if no confirmation email received).
  </action>
  <acceptance_criteria>
    - Meta Business Manager account exists under Groupio company name
    - Verification submission confirmed with reference number or confirmation email
    - Reference number recorded in docs/runbooks/phase1-external-deps.md
  </acceptance_criteria>
</task>

<task id="T2" name="Review pre-drafted WhatsApp templates before submission">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 2.4: all 5 template drafts in Hebrew and English; Section 2.2: rejection causes to avoid — no variable as first/last char, no promotional language, UTILITY category)
  </read_first>
  <action>
    Review the 5 pre-drafted template pairs from RESEARCH.md Section 2.4. For each template confirm:
    1. Category is UTILITY (not Marketing) — no pricing, discounts, or sales language in body
    2. Variables use {{1}}, {{2}}, {{3}} format (double curly braces, sequential integers)
    3. Variables are NOT the first or last characters in the body
    4. Hebrew text uses casual Israeli tone (יומיומי) — see D-06
    5. groupio.co.il URL is informational only (not a call-to-action / promotional link)
    6. Body length under 1024 characters

    Templates to review:
    - groupio_offer_expiry (he + en): vars {{1}}=offer title, {{2}}=hours remaining
    - groupio_payment_reminder (he + en): vars {{1}}=offer title, {{2}}=ILS amount, {{3}}=deadline
    - groupio_payment_confirmation (he + en): vars {{1}}=offer title, {{2}}=ILS amount
    - groupio_offer_joined (he + en): vars {{1}}=offer title, {{2}}=participant count, {{3}}=price per unit
    - groupio_contractor_matched (he + en): vars {{1}}=offer title, {{2}}=contractor name

    Approve or modify. Document any changes made to template content before submission.
  </action>
  <acceptance_criteria>
    - All 5 template pairs reviewed and confirmed as UTILITY-compliant (no promotional language)
    - Variable placeholders are in {{N}} format and not at start/end of body text
    - Hebrew templates confirmed by a native Hebrew speaker or the user (D-06 tone requirement)
  </acceptance_criteria>
</task>

<task id="T3" name="Submit all 10 WhatsApp message template variants to Meta">
  <read_first>
    - .planning/phases/01-external-dependencies-unblocked/01-RESEARCH.md (Section 2.3: Submission steps via Meta Business Manager UI; Section 2.2: language code he and en)
  </read_first>
  <action>
    After Meta Business account is created (T1) and templates are reviewed (T2):
    1. Go to business.facebook.com → WhatsApp Manager → Message Templates → Create template.
    2. For each of the 5 templates, submit both language variants separately:
       - Select category: Utility
       - Enter template name (e.g., groupio_offer_expiry)
       - Select language: he (for Hebrew variant) or en (for English variant)
       - Enter body with {{N}} variables; fill in example values for each variable
       - Submit for review
    3. Total submissions: 10 (5 templates × 2 languages).
    4. For each submission: record the submission timestamp and any reference number in docs/runbooks/phase1-external-deps.md Submission Tracker (rows for each template/language).
  </action>
  <acceptance_criteria>
    - Meta Business Manager → Message Templates shows 10 templates in "Pending" or "Approved" state
    - All 10 template names follow format: groupio_{name} with language variants he and en
    - Submission timestamps recorded for all 10 in docs/runbooks/phase1-external-deps.md
    - Confirmation email(s) received from Meta with reference IDs
  </acceptance_criteria>
</task>

---

## must_haves

- Meta Business Manager account verified (or verification in progress with ticket ID)
- All 10 WhatsApp template variants submitted (OPS-01 requires approval; submission starts the clock)
- Submission dates and ticket IDs recorded in ops runbook

---

<threat_model>
## Threat Model (ASVS L1)

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Template reclassified as MARKETING by Meta | MEDIUM | Keep all bodies strictly transactional (no pricing, discounts, sales language). See RESEARCH.md Section 2.2 rejection causes. |
| Business verification documents mismatch | HIGH | ALL documents must show the exact same business name and address as entered in the form. Mismatch restarts the 14-day clock. |
| Meta Business account compromised | HIGH | Enable 2FA on the Meta Business Manager account immediately after creation. |
| Template variable format error ({{1}} vs {1}) | MEDIUM | Double-check: double curly braces {{1}}, sequential integers starting at 1, not first/last char. Review T2 before submitting. |
| WhatsApp PHONE_ID / API_TOKEN exposed in code | HIGH | Credentials are stored as env vars only (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_ID). Never hardcode in source. Plan 01-01 T4 adds .env.example documentation only — no real values. |
</threat_model>
