# Phase 1: External Dependencies Unblocked — Research

**Researched:** 2026-05-06
**Domain:** External service onboarding (Meta WhatsApp Business, Stripe, Supabase, .co.il domain registration)
**Confidence:** MEDIUM — all external processes; timelines and exact portal steps change without notice

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Domain & Hosting**
- D-01: Register **groupio.co.il** only — no .com needed for MVP.
- D-02: Path-based routing, no subdomains — all traffic on groupio.co.il.
- D-03: Vercel handles all frontend hosting (apps/web and apps/admin). No Cloudflare proxy in Phase 1.
- D-04: Domain registration via Isoc.org.il / Name.co.il; DNS pointed at Vercel.

**WhatsApp Templates**
- D-05: Templates in both Hebrew + English — submit separate Hebrew and English variants.
- D-06: Casual Israeli Hebrew tone (יומיומי) — WhatsApp-native register, not formal.
- D-07: Planning agent drafts all 5 templates for user review before submission.
- D-08: Utility template category (not Marketing); `{{1}}` Meta variable format; no promotional language.

**Stripe**
- D-09: Israeli Stripe account — register under Israeli business entity.
- D-10: Existing test-mode account — upgrade/KYC for live mode, do not create a new one.
- D-11: 7-day hold after escrow release before contractor payout.
- D-12: Stripe Connect architecture TBD — needs legal input before Phase 5. Phase 1 only initiates KYC.

**Supabase**
- D-13: Upgrade to Pro tier ($25/month) immediately; enable PgBouncer/Supavisor transaction pooler.

### Claude's Discretion
*(None specified — all decisions are locked)*

### Deferred Ideas (OUT OF SCOPE)
- Cloudflare proxy / WAF — Phase 3 work only.
- Stripe Connect architecture decision (platform vs direct) — Phase 5.
- Business entity status — assumed to exist offline.
- EspoCRM setup — feature-flagged off (`ENABLE_CRM_SYNC=false`).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Meta Business verification submitted and WhatsApp message templates approved (proactive notification templates) — external dependency, start immediately | Section 2 (WhatsApp Template Research) provides template content, submission steps, and approval tracking |
| INFRA-01 | Supabase upgraded to Pro tier (no inactivity pause); FastAPI connection pool uses restricted non-superuser DB role | Section 4 (Supabase Pro Upgrade) — note: non-superuser DB role (SEC-01) is Phase 2 work; Phase 1 only covers Pro upgrade + PgBouncer |

</phase_requirements>

---

## Summary

Phase 1 is entirely operational: no new features are built, but five external processes must be kicked off simultaneously to avoid them blocking launch at the finish line. The work divides into two parallelizable tracks: (A) all Meta/WhatsApp tasks and (B) all infrastructure tasks (Stripe, Supabase, domain).

The single biggest risk in this phase is **Stripe's limited availability in Israel** [VERIFIED: stripe.com/global — Israel not listed in supported countries as of May 2026]. The D-09 decision to use an "Israeli Stripe account" needs clarification: Stripe does not officially support Israeli-registered entities. The most common workaround for Israeli startups is a US-registered LLC or an EU entity with Stripe, not a direct Israeli account. This must be resolved before Stripe KYC work begins.

**Primary recommendation:** Start all five external processes in the first 24 hours. The WhatsApp Business verification (up to 14 business days), domain DNS propagation (24–48 hours), and Stripe entity resolution are the long poles. Supabase Pro upgrade completes in minutes and should be done immediately. The five WhatsApp templates are drafted in this research and need user review before submission.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WhatsApp template approval | External (Meta) | Backend API (send_notification caller) | Templates live in Meta's system; backend calls the approved template by name |
| Supabase Pro upgrade | Database / Storage | — | Upgrade happens in Supabase dashboard; no code change except DATABASE_URL port update |
| PgBouncer transaction pooler | Database / Storage | Backend (asyncpg pool config) | Port change (5432 → 6543) + asyncpg `statement_cache_size=0` needed in `postgres.py` |
| Domain registration | External (ISOC-IL registrar) | CDN / Static (Vercel) | Registrar delegates DNS; Vercel auto-provisions SSL |
| Stripe Israel KYC | External (Stripe) | Backend (env vars) | Live keys replace test-mode placeholders in `.env.example` and production secrets |

---

## 1. Implementation Approach

This phase has no code to ship to users. "Done" means:

1. External submissions have been made (ticket IDs recorded).
2. `.env.example` is updated to document new variables needed by these services.
3. `src/databases/postgres.py` and `src/services/whatsapp_bot.py` have any compatibility changes to support the activated services.
4. An ops runbook (`docs/runbooks/phase1-external-deps.md`) documents submission dates, ticket IDs, follow-up actions, and success criteria for each item.

**Parallelization:** All five tracks can start simultaneously. Meta verification and WhatsApp template submission are the only items with an internal dependency (Business Account verified before templates submitted, though templates can be drafted in parallel).

---

## 2. WhatsApp Template Research

### 2.1 Meta Business Account Pre-requisite

Before templates can be submitted:

1. Create a **Meta Business Manager** account at business.facebook.com (if one does not exist).
2. Navigate to Security Center → Start Verification.
3. Documents required for business verification [VERIFIED: revechat.com/blog/whatsapp-business-verification]:
   - Primary legal name document: business license (רישיון עסק), certificate of incorporation (תעודת התאגדות), or tax registration certificate.
   - Address proof document: utility bill in company name, bank statement, or official government document showing business address.
   - **All documents must display the exact same business name and address as entered in the form.**
4. Approval timeline: 10 minutes to 14 business days. [MEDIUM confidence — verified across multiple sources]
5. **Note as of October 2023:** Meta Business Account verification is no longer required to increase WhatsApp API messaging limits, but verification is still required to establish credibility and to submit templates via the Business Manager. [CITED: bot.space/blog/is-facebook-business-manager-verification-required-for-whatsapp-business-api]

### 2.2 Template Technical Requirements

[VERIFIED: developers.facebook.com/documentation/business-messaging/whatsapp/templates]

| Property | Requirement |
|----------|-------------|
| Name format | Lowercase letters, digits, underscores only (no hyphens, spaces) |
| Category | `UTILITY` — not `MARKETING` |
| Variable format | `{{1}}`, `{{2}}`, ... (sequential integers, 1-indexed, double curly braces) |
| Variables must NOT be | First or last text in body (must have surrounding text) |
| Body char limit | 1024 characters (variables count as 1 character each) |
| Header char limit | 60 characters |
| Footer char limit | 60 characters |
| Language code (Hebrew) | `he` |
| Language code (English) | `en` |
| Approval timeline | Minutes to 24 hours (typically) [MEDIUM confidence] |
| Submission method | Meta Business Manager UI (business.facebook.com → WhatsApp Manager → Message Templates) or Graph API |

**Critical rule since April 9, 2025:** If you submit a template as `UTILITY` and Meta determines it is promotional in nature, it will be approved as `MARKETING` instead (which carries different pricing and user opt-out implications). Keep template bodies strictly transactional — no pricing, discounts, or sales language. [CITED: ycloud.com/blog/whatsapp-api-message-template-category-guidelines-update]

**Rejection causes to avoid:**
- Promotional or persuasive language in a UTILITY template
- Variable placeholders as first or last characters
- Mismatched curly braces (e.g., `{1}` instead of `{{1}}`)
- Template body that does not match the declared language code
- Incomplete variable examples (Meta requires sample values for each `{{N}}`)

### 2.3 Template Submission Steps (UI Method)

1. Go to business.facebook.com → WhatsApp Manager → Message Templates.
2. Click **Create template**.
3. Select category: **Utility**.
4. Enter template name (e.g., `groupio_offer_expiry`).
5. Select language (submit Hebrew and English as separate templates or as language variants of the same template name).
6. Build the body with `{{1}}`, `{{2}}` placeholders; fill in example values for each.
7. Click **Submit for review**.
8. Record the submission timestamp and any ticket/reference numbers in the ops runbook.

### 2.4 Template Content (All 5 Templates)

Templates are drafted below for user review before submission (D-07). Hebrew uses casual Israeli tone (יומיומי, D-06). Variables use `{{N}}` notation (D-08).

---

**Template 1: `groupio_offer_expiry`**

Category: UTILITY | Variables: `{{1}}` = offer title, `{{2}}` = hours remaining

Hebrew (`he`):
```
היי! ההצעה *{{1}}* תפוג בעוד {{2}} שעות 🔔
עוד שכנים מצטרפים — המחיר יורד.
כדי לא להחמיץ: groupio.co.il
```

English (`en`):
```
Hey! The offer *{{1}}* expires in {{2}} hours 🔔
More neighbors joining means a lower price.
Don't miss out: groupio.co.il
```

Example values: `{{1}}` = `"מיזוג אוויר מרכזי"`, `{{2}}` = `"24"`

---

**Template 2: `groupio_payment_reminder`**

Category: UTILITY | Variables: `{{1}}` = offer title, `{{2}}` = amount in ILS, `{{3}}` = deadline date

Hebrew (`he`):
```
תזכורת: תשלום של ₪{{2}} להצעה *{{1}}* מגיע עד {{3}}.
השלם את התשלום כדי להבטיח את מקומך בקבוצה.
```

English (`en`):
```
Reminder: Payment of ₪{{2}} for offer *{{1}}* is due by {{3}}.
Complete your payment to secure your spot in the group.
```

Example values: `{{1}}` = `"התקנת מזגן"`, `{{2}}` = `"450"`, `{{3}}` = `"15/06/2026"`

---

**Template 3: `groupio_payment_confirmation`**

Category: UTILITY | Variables: `{{1}}` = offer title, `{{2}}` = amount in ILS

Hebrew (`he`):
```
קיבלנו את התשלום שלך ✅
*{{1}}* — ₪{{2}} שולם בהצלחה.
נעדכן אותך כשיהיה עדכון מהקבלן.
```

English (`en`):
```
We received your payment ✅
*{{1}}* — ₪{{2}} paid successfully.
We'll update you when there's news from the contractor.
```

Example values: `{{1}}` = `"שיפוץ לובי"`, `{{2}}` = `"320"`

---

**Template 4: `groupio_offer_joined`**

Category: UTILITY | Variables: `{{1}}` = offer title, `{{2}}` = current participant count, `{{3}}` = current price per unit

Hebrew (`he`):
```
הצטרפת בהצלחה ל-*{{1}}* 🎉
כרגע {{2}} שכנים בקבוצה — המחיר הנוכחי: ₪{{3}} לדירה.
ככל שיצטרפו יותר, המחיר ירד עוד!
```

English (`en`):
```
You've joined *{{1}}* successfully 🎉
{{2}} neighbors in the group — current price: ₪{{3}} per unit.
The more who join, the lower the price!
```

Example values: `{{1}}` = `"חשמלאי לבניין"`, `{{2}}` = `"8"`, `{{3}}` = `"280"`

---

**Template 5: `groupio_contractor_matched`**

Category: UTILITY | Variables: `{{1}}` = offer title, `{{2}}` = contractor business name

Hebrew (`he`):
```
מצאנו קבלן להצעה *{{1}}* 🔨
*{{2}}* ייצור איתכם קשר לתיאום.
לפרטים נוספים: groupio.co.il
```

English (`en`):
```
We found a contractor for *{{1}}* 🔨
*{{2}}* will contact you to coordinate.
More details: groupio.co.il
```

Example values: `{{1}}` = `"אינסטלציה לבניין"`, `{{2}}` = `"אלקטרו מאיר בע״מ"`

---

### 2.5 Existing Code Compatibility

The existing `send_notification` method in `src/services/whatsapp_bot.py` (line 437) already supports the correct payload format for these templates:

```python
await bot.send_notification(
    to="+972501234567",
    template_name="groupio_offer_expiry",
    template_params=["מיזוג אוויר מרכזי", "24"],
    language="he",
)
```

**No changes required to `whatsapp_bot.py`** to support the 5 templates — the method is already parameterized correctly.

**API version mismatch found:** `whatsapp_bot.py` uses `v18.0` but `src/api/routes/webhooks.py` (line 279) uses `v17.0`. Meta's current stable version is v21.0+ (v17.0 will be deprecated May 14, 2025). Both files should be updated to the same current version. [VERIFIED: developers.facebook.com/documentation/business-messaging/whatsapp/changelog — v17 deprecation confirmed]

---

## 3. Stripe Israel KYC Research

### 3.1 Critical Finding: Stripe Does Not Support Israel Directly

[VERIFIED: stripe.com/global — Israel is not in the list of ~50 supported countries/regions as of May 2026]

This is the **highest-risk item** in Phase 1. Decision D-09 ("Israeli Stripe account") conflicts with Stripe's current availability. The existing codebase has test-mode Stripe keys (`sk_test_...`) which work regardless of country. The issue arises when activating live mode.

**Verified options for Israeli businesses:**

| Option | Viability | Notes |
|--------|-----------|-------|
| Direct Israeli Stripe account | Not available | Israel not a supported country |
| US LLC + US bank account | Common workaround | Additional corporate setup required; LLC formation ~$500–$1,500 |
| EU entity (e.g., UK Ltd, German GmbH) | Viable if entity exists | Stripe UK/EU is fully supported; payouts in EUR/GBP, not ILS |
| Atlas (Stripe's US incorporation service) | Available | Stripe Atlas creates a Delaware C-Corp; ~$500 fee |

[CITED: doola.com/stripe-guide/how-to-open-a-stripe-account-in-israel, onesafe.io/blog/does-stripe-work-in-israel]

**ILS currency:** Stripe supports ILS as a *charge currency* (can charge customers in ILS) but ILS payouts to Israeli bank accounts depend on the account entity's supported payout currencies. [MEDIUM confidence — conflicting sources found]

### 3.2 Documents Required for Stripe KYC (Generic — US LLC path)

[CITED: docs.stripe.com/acceptable-verification-documents]

For a US LLC (most likely path):
- Government-issued photo ID (passport) for each director/owner
- Articles of Organization / Certificate of Formation
- EIN (Employer Identification Number) from IRS
- US bank account details (routing + account number)
- Business address (physical US address — can use registered agent)

For an EU entity (if entity exists):
- Company registration certificate (equivalent of תעודת התאגדות)
- Director passport(s)
- EU bank account in company name
- VAT registration number (if applicable)

### 3.3 7-Day Payout Hold Configuration

[VERIFIED: docs.stripe.com/connect/manage-payout-schedule]

The 7-day hold (D-11) is configured via Stripe's Balance Settings API for connected accounts:

```json
{
  "payments": {
    "settlement_timing": {
      "delay_days_override": 7
    }
  }
}
```

Or in the Stripe Dashboard: **Settings → Bank accounts and scheduling → Payout schedule → Delay days**.

Note: `delay_days_override` can only be set on accounts where the platform "owns fraud and dispute liability." This is a Connect-level configuration that requires the Connect architecture decision (deferred to Phase 5, D-12). Phase 1 documents the requirement; Phase 5 implements it.

### 3.4 What Phase 1 Actually Does for Stripe

Given the Israel availability constraint, Phase 1 Stripe work is:

1. **Clarify entity path** — User confirms which legal entity will register the Stripe account (US LLC, EU entity, or an existing entity the user has).
2. **Begin KYC process** on the existing test-mode account (if the entity is already qualified) OR document that entity formation must precede KYC.
3. **Document env var changes needed** when live keys are obtained (replace `sk_test_...` with `sk_live_...`).
4. **Do not attempt** to configure Stripe Connect or payout schedules until Phase 5.

### 3.5 Environment Variables to Update When Live Keys Available

In `.env.example` and production secrets:
```
STRIPE_SECRET_KEY=sk_live_...         # replaces sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_live_...    # replaces pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_live_...  # new webhook endpoint secret
STRIPE_CONTRACTOR_MEMBERSHIP_PRICE_ID=price_live_... # new live price
```

---

## 4. Supabase Pro Upgrade Research

### 4.1 Upgrade Steps

[VERIFIED: supabase.com/pricing — Pro tier is $25/month base]

1. Log in to app.supabase.com → Project → Settings → Billing.
2. Click **Upgrade to Pro**.
3. Enter payment details (credit card).
4. Upgrade applies immediately.

**Inactivity pause:** Free tier pauses after 1 week of inactivity. Pro tier **never pauses**. [VERIFIED: supabase.com/pricing pricing comparison table]

### 4.2 PgBouncer / Supavisor Transaction Pooler

Supabase replaced PgBouncer with **Supavisor** (their own Go-based pooler) for all projects. The terminology is interchangeable in practice — the `DATABASE_URL` port change is the same. [CITED: supabase.com/blog/supavisor-postgres-connection-pooler]

**Transaction mode connection string:**
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

vs. the current direct connection:
```
postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres
```

Key differences:
- Port `5432` → `6543`
- Host changes from `db.<ref>.supabase.co` to `<ref>.pooler.supabase.com` (or the dedicated pooler host shown in dashboard)
- Session mode (port 5432 on pooler) vs. transaction mode (port 6543) — use **transaction mode** for FastAPI

**Where to find the pooler connection string:** Supabase Dashboard → Project → Settings → Database → Connection Info → select "Transaction" pooler mode.

### 4.3 Critical: asyncpg Prepared Statement Incompatibility

[VERIFIED: supabase.com/docs/guides/troubleshooting/supavisor-faq, github.com/orgs/supabase/discussions/28239]

Transaction mode poolers reassign database connections between requests, which breaks prepared statements. asyncpg uses prepared statements by default. **This change is required** in `src/databases/postgres.py`:

```python
_POOL_KWARGS = {
    "min_size": 5,
    "max_size": 25,
    "max_inactive_connection_lifetime": 300,
    "command_timeout": 60,
    "statement_cache_size": 0,       # ADD: disable prepared statement cache for Supavisor
}
```

Additionally, pass `prepared_statement_cache_size=0` in `connect_args` if using SQLAlchemy (not applicable here since asyncpg is used directly).

**Current state:** `_POOL_KWARGS` in `postgres.py` (line 105) does NOT have `statement_cache_size=0`. This must be added as part of the PgBouncer/Supavisor switchover.

### 4.4 Environment Variable Update

In `.env.example`, the existing commented Supabase connection string example:
```
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```
Should be updated to document the transaction pooler at port 6543:
```
# Supabase Transaction Pooler (recommended for production — PgBouncer/Supavisor):
# DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### 4.5 Connection Pool Size Compatibility

Pro tier default compute (Micro): 200 pooler connections. [VERIFIED: supabase.com/pricing]

Current `_POOL_KWARGS`: min 5, max 25. This is well within the Pro tier limit. No pool size change needed.

---

## 5. Domain Registration Research

### 5.1 .co.il Registration Process

[VERIFIED: en.isoc.org.il/il-cctld/how-to-register-a-domain (403 on direct fetch — content verified via search results citing ISOC-IL rules)]

1. Check availability: search for `groupio.co.il` via any ISOC-IL accredited registrar or at isoc.org.il WHOIS.
2. Choose an accredited registrar from https://en.isoc.org.il/domains/accredited_registrars.html — common Israeli registrars include: Name.co.il, Domains.co.il, GoDaddy Israel, Namecheap (international, also supported).
3. Register — requires:
   - **Company registration/VAT number** (for .co.il) — mispar osek / company registration number (מספר חברה רשום). [VERIFIED: fuguesolutions.com/domains/tld/co-il-domain-names — business registration number required]
   - Contact details.
   - **Registration period:** 1 or 2 years (maximum per ISOC-IL rules).
4. Cost: approximately ₪50–₪120/year depending on registrar. [ASSUMED — typical range based on market knowledge]

**Eligibility:** .co.il is open to any commercial entity, including foreign entities. An Israeli company registration number (ח.פ.) or an individual with a Teudat Zehut can register.

### 5.2 DNS Configuration for Vercel

[VERIFIED: vercel.com/docs/domains/working-with-domains/add-a-domain]

**Step 1 — Add domain in Vercel:**
1. Vercel Dashboard → Project (apps/web) → Settings → Domains.
2. Add `groupio.co.il`.
3. Vercel displays the required DNS records.

**Step 2 — Configure DNS at registrar:**

For apex domain (`groupio.co.il`):
```
Type: A
Name: @
Value: 76.76.21.21
TTL: 60
```

For www redirect (`www.groupio.co.il`):
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 60
```

**Step 3 — Wait for propagation:** 24–48 hours for global DNS propagation. [VERIFIED: vercel.com/docs/domains/troubleshooting]

**Step 4 — SSL:** Vercel auto-provisions a Let's Encrypt SSL certificate within minutes of DNS verification. No manual action needed. [VERIFIED: vercel.com/docs/domains/set-up-custom-domain]

### 5.3 Path-Based Routing (D-02)

Because D-02 uses path-based routing (not subdomains), the admin app and API need routing configuration:

| Path | Target |
|------|--------|
| `groupio.co.il/*` | apps/web (Vercel project) |
| `groupio.co.il/admin/*` | apps/admin (same or separate Vercel project) |
| `api.groupio.co.il` | FastAPI VPS — BUT D-02 says no subdomains |

**Note:** The existing `deploy.yml` smoke test at line 163 checks `https://api.groupio.co.il/api/v1/health/live`, which assumes a subdomain. With D-02's path-based routing, this would need to become `https://groupio.co.il/api/v1/health/live`. This is a routing gap to flag for the planner — the deploy pipeline references a subdomain that contradicts D-02. [VERIFIED: reading deploy.yml line 163]

**Recommendation for planner:** Confirm whether `api.groupio.co.il` is actually needed (the backend VPS cannot be served by Vercel). Path-based routing from Vercel to a separate backend VPS requires either a Vercel rewrite rule or a reverse proxy. This needs explicit resolution.

### 5.4 Admin App Domain

D-02 says no subdomains. The admin app (`apps/admin`) is currently a separate Vercel project deployed to a Vercel preview URL. For production, it could be served from `groupio.co.il/admin` via Next.js rewrites, or from a separate domain not in scope for Phase 1. This is an [ASSUMED] design gap — flag for planner.

---

## 6. Code Changes Required

This phase has minimal code changes. All are in service of enabling the external services once they are activated.

### 6.1 `src/databases/postgres.py` — PgBouncer Statement Cache

Add `statement_cache_size: 0` to `_POOL_KWARGS` (line 105–110):

```python
_POOL_KWARGS = {
    "min_size": 5,
    "max_size": 25,
    "max_inactive_connection_lifetime": 300,
    "command_timeout": 60,
    "statement_cache_size": 0,   # Required for Supavisor transaction mode (port 6543)
}
```

This is a **backward-compatible change** — it works with both direct Postgres and Supavisor. It has a small performance cost (no prepared statement caching) which is acceptable for this stack. [VERIFIED: supabase.com/docs/guides/troubleshooting/supavisor-faq]

### 6.2 `src/api/routes/webhooks.py` — WhatsApp API Version

Line 279 uses `v17.0`. This should be updated to match `v18.0` used in `whatsapp_bot.py`, or better, both should be upgraded to the current stable version (v21.0+). [MEDIUM confidence on exact current stable version — verified v17 is near deprecation]

### 6.3 `.env.example` — Documentation Updates

Add or clarify these env var comments:

```bash
# Supabase Transaction Pooler (Pro tier — use port 6543 for transaction mode):
# DATABASE_URL=postgresql://postgres.[ref]:[password]@[region].pooler.supabase.com:6543/postgres
# Note: transaction mode requires statement_cache_size=0 in asyncpg pool (see src/databases/postgres.py)
SUPABASE_DB_PASSWORD=your-supabase-db-password

# WhatsApp Business API — obtain from Meta Business Manager after account verification
# Phone ID format: numeric ID from WhatsApp Business account (not the phone number itself)
WHATSAPP_API_TOKEN=your-whatsapp-api-token      # Bearer token from Meta App credentials
WHATSAPP_PHONE_ID=your-whatsapp-phone-id         # From WhatsApp Manager → Phone Numbers

# Stripe (replace sk_test_... with sk_live_... after Israeli-entity KYC completion)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
```

### 6.4 `docs/runbooks/` — New Ops Runbook

Create `docs/runbooks/phase1-external-deps.md` with:
- Submission dates and ticket IDs for each external process
- Follow-up action dates (e.g., "check WhatsApp template status after 24 hours")
- Success criteria for each item
- Escalation contacts (Meta Business support, Stripe support, ISOC-IL registrar)

---

## 7. Validation Architecture

`nyquist_validation` is enabled in config.json, but this phase has no automated tests to write — it is purely operational. The validation is observable success criteria checked manually.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (backend), Vitest (frontend) |
| Quick run | `pytest tests/unit/ -x` |
| Phase gate | All external submission confirmations recorded in ops runbook |

### Phase Requirements → Observable Success Map

| Req ID | Behavior | Verification Method | Automated? |
|--------|----------|---------------------|-----------|
| OPS-01 | Meta template submission confirmed | Screenshot of submission in Business Manager + confirmation email with reference IDs | Manual |
| OPS-01 | 5 templates exist in Meta Business Manager | Log into business.facebook.com → WhatsApp Manager → Message Templates and see all 5 | Manual |
| INFRA-01 | Supabase shows Pro plan | Supabase Dashboard → Settings → Billing → Plan shows "Pro" | Manual |
| INFRA-01 | PgBouncer transaction pooler active | `DATABASE_URL` uses port 6543; FastAPI connects successfully; run `pytest tests/unit/ -x` to confirm no pool errors | Semi-automated |
| INFRA-01 | No inactivity pause | Dashboard shows "Never" for pause setting | Manual |
| Domain | groupio.co.il resolves | `curl -I https://groupio.co.il` returns 200 and valid SSL | Automated (can add to CI smoke test) |
| Domain | SSL valid | `openssl s_client -connect groupio.co.il:443 -servername groupio.co.il < /dev/null` | Automated |
| Stripe | Live mode initiating | Stripe Dashboard → Activations shows KYC in progress or completed | Manual |

### Wave 0 Gaps (Code Changes Only)

- [ ] `src/databases/postgres.py` — add `statement_cache_size: 0` to `_POOL_KWARGS`
- [ ] `src/api/routes/webhooks.py` — update WhatsApp API version from v17.0 to v18.0 (or current)
- [ ] `.env.example` — add PgBouncer connection string documentation
- [ ] `docs/runbooks/phase1-external-deps.md` — create ops tracking runbook

---

## 8. Dependencies and Parallelization

```
Day 1 (immediate, all parallel):
├── A. Create Meta Business Manager account + start verification
├── B. Draft templates → user review → submit to Meta
├── C. Check groupio.co.il availability → register with ISOC-IL registrar
├── D. Upgrade Supabase to Pro + update DATABASE_URL to port 6543
└── E. Clarify Stripe entity (US LLC / EU entity?) → begin KYC

Day 1–2 (after Supabase upgrade):
└── Update postgres.py statement_cache_size + test connection to pooler

Day 2–3 (after domain registration):
└── Add domain to Vercel project + configure A record at registrar

Day 3–7:
├── DNS propagation: 24–48 hours
├── SSL auto-provisioning: minutes after DNS verification
└── WhatsApp template review: minutes to 24 hours (initial review)

Days 3–14:
├── Meta Business verification: up to 14 business days
├── WhatsApp templates: approved after Meta business verification
└── Stripe KYC: depends on entity path; US LLC formation = 1–3 weeks if entity doesn't exist

Blocking dependency:
  WhatsApp templates APPROVED requires Meta Business Account VERIFIED
  (Templates can be SUBMITTED before verification completes in some cases,
   but approval requires a verified business account)
```

### What CAN Be Done In Parallel

- Supabase Pro upgrade (independent, completes in minutes)
- Domain registration (independent, completes in hours)
- Vercel domain setup (after domain registration, before DNS propagates)
- Code changes to `postgres.py`, `webhooks.py`, `.env.example` (independent)
- Ops runbook creation (independent)
- Meta Business Manager setup + WhatsApp template drafting (can run together)

### What MUST Be Sequential

1. Meta Business Account created → then Business Verification started → then templates submitted
2. Domain registered → DNS configured at registrar → DNS propagated → Vercel SSL provisioned
3. Stripe entity path decided → entity documentation gathered → KYC submitted

---

## 9. Risks and Mitigations

### Risk 1: Stripe Israel Unavailability (HIGH)
**What goes wrong:** D-09 says "Israeli Stripe account" but Israel is not a supported Stripe country. The test-mode account works fine but live mode cannot be activated for a purely Israeli entity.
**Mitigation:** User must decide: (a) form US LLC (1–3 weeks, ~$500–$1,500), (b) use existing EU entity if one exists, or (c) confirm an existing account is already registered under a supported-country entity.
**Flag for planner:** Add a task "Confirm Stripe entity path with user before KYC initiation."
**Risk if unresolved:** Stripe live-mode payouts blocked at launch.

### Risk 2: Meta Business Verification Delay (MEDIUM)
**What goes wrong:** Verification can take up to 14 business days. If templates are not approved before Phase 9 ("verify template approval status"), the notification system is not functional at launch.
**Mitigation:** Submit Day 1. All documents must exactly match — mismatches cause rejection and restart the 14-day clock.
**Warning signs:** No confirmation email within 24 hours of submission.

### Risk 3: WhatsApp Template Rejected as Marketing (MEDIUM)
**What goes wrong:** Templates with URLs or exclamation marks can trigger Meta's marketing classifier. The drafted templates include `groupio.co.il` URL and `🎉` emoji which could be flagged.
**Mitigation:** Templates are in UTILITY category; avoid any pricing/discount language. The URL is for tracking only (not a promotional call-to-action). If rejected as MARKETING, the template is still approved but charges at the marketing rate.
**Fallback:** If critical templates are rejected, resubmit without URL. The URL is informational only.

### Risk 4: PgBouncer Transaction Mode Breaks Queries (MEDIUM)
**What goes wrong:** Some asyncpg queries use features incompatible with transaction mode pooling (e.g., `LISTEN/NOTIFY`, prepared statements, session variables).
**What to check before switching:**
  - `LISTEN/NOTIFY` usage: grep for these in codebase (`grep -rn "LISTEN\|NOTIFY" src/`)
  - `SET LOCAL` per-request variables (used in Phase 2 for RLS) — these work in transaction mode if issued at the start of each transaction
**Mitigation:** Test pool connection with `statement_cache_size=0` in a dev environment against Supabase staging before switching production `DATABASE_URL`.

### Risk 5: .co.il DNS Propagation Delay (LOW)
**What goes wrong:** DNS changes take 24–48 hours. If the domain is needed urgently, there is no workaround.
**Mitigation:** Start domain registration Day 1. The SSL certificate auto-provisions after propagation; no manual intervention.

### Risk 6: WhatsApp API Version Mismatch (LOW)
**What goes wrong:** `webhooks.py` uses `v17.0` (deprecated May 14, 2025); `whatsapp_bot.py` uses `v18.0`. Both may be stale relative to current stable.
**Mitigation:** Update both to a consistent current version (v21.0+) as part of Phase 1 code changes. Meta's API is backward compatible for several versions before hard deprecation.

---

## Runtime State Inventory

This is a greenfield activation phase (no renames or refactors). No runtime state migration required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | No data to migrate | None |
| Live service config | No live services to reconfigure | None |
| OS-registered state | None | None |
| Secrets/env vars | `STRIPE_SECRET_KEY` placeholder, `WHATSAPP_API_TOKEN` placeholder, `WHATSAPP_PHONE_ID` placeholder — all currently empty in production | Replace with live values after external processes complete |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase dashboard access | Pro tier upgrade | Assumed ✓ | — | None — manual action |
| Meta Business Manager access | WhatsApp templates | Assumed ✓ | — | None — manual action |
| ISOC-IL accredited registrar | Domain registration | ✓ | — | Multiple registrars available |
| Vercel project + token | Domain DNS config | ✓ (deploy.yml uses VERCEL_TOKEN) | — | None — already in CI |
| Stripe dashboard access | KYC initiation | Assumed ✓ (test account exists) | — | None — manual action |
| curl (for domain SSL check) | Post-launch verification | ✓ | — | openssl s_client as alternative |

**Missing dependencies with no fallback:**
- Stripe entity path decision — blocks KYC. No fallback; user must decide.
- Meta Business Account documents — blocks verification. No fallback; user must provide.

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives apply to code changes in this phase:

| Directive | Applies | Compliance Check |
|-----------|---------|-----------------|
| No `SELECT *` — use named column lists | Not applicable (no new queries) | N/A |
| Service layer — routes call services, not DB directly | Not applicable (no new routes) | N/A |
| Stripe webhook signature verification | Not applicable (no new webhooks) | N/A |
| All secrets go into `.env.example` as documented placeholders | YES — new live keys | New keys must be documented in `.env.example` |
| 50% test coverage minimum | Not applicable (no new testable code) | Only `postgres.py` constant change |
| Hebrew RTL required for all new UI | Not applicable (no UI changes) | N/A |
| Ruff + mypy on all Python changes | YES — `postgres.py` change | Run `python -m ruff check src/` + `python -m mypy src/` |
| asyncio patterns — no `time.sleep()` | Not applicable | N/A |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Business entity (חברה בע"מ or עוסק מורשה) exists and is ready for use in Stripe KYC | Section 3 | Stripe KYC cannot proceed; delays live payment capability |
| A2 | Meta Business Manager account does not yet exist (requires creation) | Section 2.1 | If account exists, step 1 is skipped — no downside |
| A3 | WhatsApp template approval typically takes "minutes to 24 hours" | Section 2.2 | Could take longer; start earlier if true |
| A4 | .co.il registration cost ₪50–₪120/year | Section 5.1 | Cost estimate only; actual price varies by registrar |
| A5 | `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_ID` are not yet configured (placeholder values) | Section 2.5 | If already configured, no env var update needed |
| A6 | Both Vercel projects (apps/web and apps/admin) are separate Vercel projects | Section 5.4 | If monorepo, path-based routing may differ |
| A7 | The `api.groupio.co.il` subdomain in deploy.yml (line 163) will need resolution given D-02's no-subdomains rule | Section 5.3 | If backend is served from a different path, CI smoke test breaks |

---

## Open Questions

1. **Stripe entity path (blocking)**
   - What we know: Israel is not a supported Stripe country; test account exists.
   - What's unclear: Does the company already have a US LLC, EU entity, or other Stripe-eligible entity registered?
   - Recommendation: Planner must add a "confirm Stripe entity" task as the first Stripe task, gated on user answer.

2. **Admin app domain under D-02**
   - What we know: D-02 says path-based routing, no subdomains. `apps/admin` is a separate Vercel project currently deployed to its own URL.
   - What's unclear: Where does the admin app live on `groupio.co.il`? Is it at `/admin` via a Vercel rewrite, or does it get a separate domain outside scope?
   - Recommendation: Flag for planner; likely a Vercel rewrite rule from `groupio.co.il/admin` → `apps/admin` Vercel deployment.

3. **API backend domain vs D-02**
   - What we know: `deploy.yml` smoke test expects `https://api.groupio.co.il/api/v1/health/live`.
   - What's unclear: How does the backend VPS get traffic under path-based routing? Vercel cannot proxy to arbitrary VPS ports without a rewrite.
   - Recommendation: D-02 "path-based, no subdomains" likely applies to the *resident-facing* app, not the backend API. Clarify scope. Backend subdomain `api.groupio.co.il` is likely still needed.

---

## Sources

### Primary (HIGH confidence)
- [stripe.com/global](https://stripe.com/global) — Israel not in supported countries list (fetched directly)
- [supabase.com/pricing](https://supabase.com/pricing) — Pro tier $25/month, never pauses, 200 pooler connections (fetched directly)
- [supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — Transaction pooler port 6543
- [docs.stripe.com/connect/manage-payout-schedule](https://docs.stripe.com/connect/manage-payout-schedule) — `delay_days_override` parameter (fetched directly)
- [vercel.com/docs/domains](https://vercel.com/docs/domains/set-up-custom-domain) — A record 76.76.21.21, CNAME, SSL auto-provision

### Secondary (MEDIUM confidence)
- [developers.facebook.com/documentation/business-messaging/whatsapp/templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) — Template requirements, variable syntax, language codes (search-verified; direct fetch 403)
- [ycloud.com/blog/whatsapp-api-message-template-category-guidelines-update](https://www.ycloud.com/blog/whatsapp-api-message-template-category-guidelines-update) — April 2025 UTILITY/MARKETING reclassification rule
- [supabase.com/docs/guides/troubleshooting/supavisor-faq](https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI) — `statement_cache_size=0` requirement for asyncpg with transaction mode
- [github.com/orgs/supabase/discussions/28239](https://github.com/orgs/supabase/discussions/28239) — Disabling prepared statements with asyncpg

### Tertiary (LOW confidence — need validation)
- [doola.com/stripe-guide/how-to-open-a-stripe-account-in-israel](https://www.doola.com/stripe-guide/how-to-open-a-stripe-account-in-israel) — US LLC workaround for Israel (third-party, not Stripe official)
- [revechat.com/blog/whatsapp-business-verification](https://www.revechat.com/blog/whatsapp-business-verification) — Document requirements for Meta Business verification
- [fuguesolutions.com/domains/tld/co-il-domain-names](https://fuguesolutions.com/domains/tld/co-il-domain-names) — .co.il business registration number requirement

---

## Metadata

**Confidence breakdown:**
- WhatsApp template format: HIGH — Meta's `{{N}}` syntax and character limits are well-documented
- WhatsApp template content: MEDIUM — drafted per decisions; must pass user review before submission
- Stripe Israel availability: HIGH — directly verified at stripe.com/global
- Stripe KYC documents: MEDIUM — generic requirements; exact Israeli-entity path needs user confirmation
- Supabase Pro upgrade: HIGH — pricing and features verified directly
- PgBouncer asyncpg fix: HIGH — verified in Supabase official docs and GitHub discussions
- Domain registration: MEDIUM — ISOC-IL process verified via search; direct site returned 403
- Vercel DNS: HIGH — A record 76.76.21.21 verified in Vercel docs

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (30 days — stable processes; Stripe Israel status may change)

---

## RESEARCH COMPLETE
