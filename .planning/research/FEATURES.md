# Groupio — Feature Research: Israeli Proptech Marketplace

**Research Date:** 2026-05-06  
**Scope:** Israeli multi-city MVP, 10 active buildings target  
**Methodology:** Codebase analysis + Israeli consumer/proptech market context

---

## Table of Contents

1. [Table Stakes — Must Have at Launch](#1-table-stakes--must-have-at-launch)
2. [Differentiators — Competitive Advantage](#2-differentiators--competitive-advantage)
3. [Anti-features — Deliberately Exclude](#3-anti-features--deliberately-exclude)
4. [Israeli Market Specifics](#4-israeli-market-specifics)
5. [Feature Dependencies](#5-feature-dependencies)

---

## 1. Table Stakes — Must Have at Launch

Users leave (or never trust the platform) without these. Ordered by criticality.

---

### 1.1 WhatsApp-First Communication
**Status:** Partially built — `src/services/whatsapp_bot.py` exists with interactive lists, quick replies, and template notifications  
**Complexity:** Medium (scaffolding exists; templates need Meta approval pipeline)

Israel has ~97% WhatsApp penetration. A platform that requires email/app-only communication is fundamentally broken for Israeli users. WhatsApp is not a nice-to-have channel — it is where residents expect coordination to happen.

**What must work at launch:**
- Residents receive offer updates and join reminders via WhatsApp
- Contractor confirms appointment and sends status updates via WhatsApp
- Payment receipts and escrow release notifications via WhatsApp
- AI bot can answer "what offers are in my building?" conversationally in Hebrew
- Template messages pre-approved by Meta (required for proactive outreach)

**Gap:** The bot handles inbound messages and interactive lists. Outbound proactive templates (notifications) need Meta pre-approval workflow. This is a blocking dependency — Meta approval takes 1–2 weeks.

---

### 1.2 Hebrew RTL UI — Complete, Not Partial
**Status:** Built — `next-intl`, Hebrew locale Playwright project, `hebrew_utils.py`  
**Complexity:** Low (framework in place; thoroughness is the risk)

Hebrew-speaking Israeli users will immediately abandon a product that has:
- Mixed LTR/RTL alignment
- English error messages in a Hebrew flow
- Numbers and currency formatted for Western conventions (should be ₪ right-aligned in RTL context)

**What must work at launch:**
- All resident-facing flows (onboarding, offer browsing, checkout) in Hebrew
- All contractor-facing flows in Hebrew
- Form validation errors in Hebrew
- WhatsApp responses auto-detected and replied in Hebrew (already in `whatsapp_bot.py`)
- Currency: ₪ (shekel symbol), Israeli number formatting
- Date format: DD/MM/YYYY (Israeli standard, not MM/DD/YYYY)
- Address input supports Hebrew street names, including diacritics stripped for search

---

### 1.3 Verified Israeli Phone Number as Primary Identity
**Status:** Phone stored on `Resident`, extracted via `extract_phone_number()` in `hebrew_utils.py`  
**Complexity:** Medium

Israeli users do not trust platforms that use email as primary identity. Phone number via SMS OTP or WhatsApp verification is the expected authentication pattern (see: Yad2, Airbnb IL, Bank apps). Email is secondary.

**What must work at launch:**
- Registration via Israeli mobile number (050x, 052x, 054x, 058x prefixes)
- OTP verification at signup (SMS or WhatsApp)
- Login via phone + OTP (not just email/password)
- Phone displayed on contractor profile for trust signaling
- Phone number format normalized to international (+972) for Stripe/WhatsApp but displayed in local format (05x-xxxxxxx)

**Gap:** Current auth is JWT/email-based (Supabase Auth). Phone OTP requires either Supabase Phone Auth or a separate SMS provider (Twilio / local Israeli SMS like Inforu). This is a meaningful integration gap.

---

### 1.4 Contractor License Verification (Israeli Specific)
**Status:** Partially built — `VettingAgent` calculates trust score, `datagov_provider.py` exists but noted as "does NOT verify contractor licenses"  
**Complexity:** High

Israeli residents are acutely aware of unlicensed contractor fraud (especially post-renovation disputes). The Ministry of Economy and Industry (משרד הכלכלה) maintains a registry of licensed contractors. A resident must be able to see that a contractor is verified — not just that "Groupio checked."

**What must work at launch:**
- Display contractor license number prominently
- Visual verification badge (מאושר, verified) with tooltip explaining what was checked
- Insurance expiry visible (and warned when < 60 days away)
- Years in business clearly stated
- Trust score breakdown visible to residents (not just an opaque number)
- Manual admin vetting workflow as fallback (since automated data.gov.il license check has limitations)

**Gap:** `datagov_provider.py` can look up addresses and company registration but cannot programmatically verify contractor trade licenses. Admin manual review is the real verification gate. This must be made explicit in the UI — "verified by Groupio team" with a badge, not "automatically verified by government registry."

---

### 1.5 Group Payment with Escrow (Trust-Critical)
**Status:** Built — full escrow lifecycle in `src/services/payment.py`, Stripe PaymentIntents  
**Complexity:** High (complete; must be fully tested end-to-end)

Israeli consumers are wary of paying upfront without guarantees, especially in construction/renovation services where disputes are common. The escrow model is a core trust mechanism.

**What must work at launch:**
- Clear explanation of escrow before payment (in Hebrew)
- Payment held until work is completed — visible status to resident
- Resident can see how much is held in escrow for their offer
- Release only happens when resident confirms completion
- Refund path: if offer doesn't reach minimum participants, full refund
- Payment receipts with VAT (חשבונית מס) — 18% VAT, required by Israeli law

**Must-have signals on checkout page:**
- "כספך מוגן" (Your money is protected) badge
- Padlock icon + SSL visible
- Stripe-branded payment form (residents recognize it as safe)

---

### 1.6 Offer Deadline and Countdown Visibility
**Status:** `expiresAt` on Offer model; lifecycle worker exists  
**Complexity:** Low

Group buying fundamentally depends on urgency. If residents cannot see "X residents joined, Y more needed, offer closes in 3 days," they have no motivation to act.

**What must work at launch:**
- Real-time participant counter on offer page (WebSocket via existing `useRealtimeOffers`)
- Clear countdown timer to offer expiry
- Current tier vs next tier shown: "Join now — 3 more residents get 15% off"
- WhatsApp notification when offer is 24h from closing with current participant count
- Email digest for buildings managers (weekly active offer summary)

---

### 1.7 Building-Scoped Offer Discovery
**Status:** Built — buildings model, building_id on offers, RLS scopes residents to their building  
**Complexity:** Low

Residents must only see offers relevant to their building. Seeing offers from other buildings creates confusion and violates privacy expectations.

**What must work at launch:**
- Resident sees only offers in their registered building
- Building address shown on offer (residents verify it's their building)
- Buildings manager sees all offers for their building with participant details
- New resident can join an existing building via invite code (not self-create address)

---

### 1.8 Transparent Pricing with Tier Logic Explained
**Status:** Built — `PricingTier`, dynamic pricing, `pricingRationale` field  
**Complexity:** Low (logic exists; UI explanation is the gap)

Israeli consumers are price-sensitive and comparison-shop aggressively. If a resident doesn't understand why the price is ₪2,400 today vs ₪1,900 at the next tier, they will not trust the platform.

**What must work at launch:**
- Tier table visible on offer: "1–5 residents: ₪2,400 | 6–10 residents: ₪2,000 | 11+: ₪1,800"
- "You are here" indicator on tier table
- Market price comparison: "Market rate: ₪3,200 | Your group price: ₪2,000 (37% savings)"
- AI-generated pricing rationale visible (already stored as `pricingRationale`)

---

### 1.9 Invitation-Only Building Onboarding (Controlled Growth)
**Status:** Invite system partially built (invite codes in models)  
**Complexity:** Medium

For MVP with 10 buildings, uncontrolled self-serve building creation would cause data quality problems (duplicate buildings, wrong addresses, spam contractors). The flow must be:
- Admin or buildings manager creates building in system
- Residents join via invite link/code
- Optional: residents can request their building be added

**What must work at launch:**
- Buildings manager sends WhatsApp invite link to residents
- Resident clicks link → confirms building address → completes profile
- Invalid invite codes handled gracefully with Hebrew error message
- Admin can see and manage all pending building join requests

---

### 1.10 Post-Work Review System
**Status:** `Review` model exists with `verified: boolean`  
**Complexity:** Low

Israeli word-of-mouth is powerful. Reviews from neighbors in the same building carry maximum trust. A contractor with 0 reviews is less trustworthy than one with 5 reviews from residents in similar buildings.

**What must work at launch:**
- Review flow triggered after offer status → `completed`
- Rating 1–5 stars + text comment
- Reviews verified (only participants in that offer can review)
- Contractor rating shown prominently on profile and offer card
- Residents can see review count and average before joining

---

## 2. Differentiators — Competitive Advantage

Features that are not expected by Israeli consumers but will create competitive moat when executed well.

---

### 2.1 AI Agent in Hebrew on WhatsApp (Conversational Commerce)
**Status:** Built — `whatsapp_bot.py` + LangGraph orchestrator + Hebrew detection  
**Complexity:** High (operational; quality and latency require tuning)

**Differentiation:** No Israeli proptech platform offers a conversational AI assistant in Hebrew via WhatsApp that can answer "מה ההצעות הזמינות בבנייה שלי?" (What offers are in my building?), explain pricing, and guide through joining. This is a genuine moat.

**What makes it differentiating:**
- Intent detection in Hebrew without requiring structured input
- Response in Hebrew within 3 seconds (latency SLA needed)
- Handles ambiguous queries: "אני רוצה לעשות שיפוץ" → asks clarifying questions
- Remembers conversation context (Redis session)
- Graceful handoff to human support when confidence is low

**Risk:** LLM quality in Hebrew is variable. Claude claude-sonnet-4-6 is strong but prompt engineering for Israeli construction vocabulary (מזגן, אינסטלציה, ריצוף) needs to be tested with real users.

---

### 2.2 Building-Level Social Proof (Neighbor Network Effect)
**Status:** Offer participant count visible; graph DB (Neo4j) exists for relationship data  
**Complexity:** Medium

Israeli apartment buildings have strong social dynamics (ועד הבית — building committee). Showing "5 of your neighbors already joined" is more compelling than any marketing message.

**What makes it differentiating:**
- "X neighbors joined" counter on offer (not just total participants)
- Anonymized neighbor activity: "Apartment 4B joined 2 days ago"
- Buildings manager can see and nudge non-participants via WhatsApp
- Cross-building comparison: "Buildings in Ramat Gan avg 78% participation for AC offers"

**Complexity note:** The anonymization and privacy balance is tricky in Israel — residents may not want neighbors knowing their payment status. Display participation count, not who paid.

---

### 2.3 Dynamic Tier Pricing with Real-Time Visual Feedback
**Status:** Built — pricing engine + WebSocket updates  
**Complexity:** Low (tech exists; UX execution is the differentiator)

Group-buying FOMO is real. Real-time visual feedback of "2 more residents and the price drops" creates urgency without manipulation.

**What makes it differentiating:**
- Price tier bar visually fills as participants join (live update)
- Sound/animation when a new tier is crossed
- WhatsApp message sent to all participants: "המחיר ירד! 10 שכנים הצטרפו — המחיר עכשיו ₪1,800"
- Countdown to offer deadline in building's WhatsApp group

---

### 2.4 Contractor Subscription Model (B2B Revenue Differentiation)
**Status:** Built — contractor membership with Stripe subscriptions, `contractor_membership.py`  
**Complexity:** Medium (payment logic built; sales motion not defined)

Israeli contractors currently pay per-lead on platforms like Fixdigital, GetFixit, Homely. Groupio's subscription + group-deal model gives contractors predictable pipeline without pay-per-lead cost.

**What makes it differentiating:**
- Tier-based contractor membership (basic → premium → enterprise)
- Premium: priority in AI matching algorithm, featured badge, more concurrent offers
- Trial period (already modeled: `trialing` membership status)
- Clear ROI calculator for contractors: "₪1 membership fee → avg ₪X in booked work"

---

### 2.5 Instant Price Estimate Before Joining
**Status:** AI pricing agent built with market data analysis  
**Complexity:** Medium

Israeli consumers comparison-shop before committing. An instant estimate ("AC installation for your building type in your city typically costs ₪X–₪Y") reduces abandonment.

**What makes it differentiating:**
- "Get estimate" flow before requiring signup
- Estimate factors in building type, city, apartment count
- Shown alongside group discount projection
- Stored as lead data for follow-up

---

### 2.6 Transparency Dashboard for Building Managers
**Status:** `buildings-manager` app exists; offer analytics in admin  
**Complexity:** Medium

Building committees (ועד בית) are influential and skeptical. Giving them a clear dashboard of offer status, participant count, and payment progress builds institutional trust.

**What makes it differentiating:**
- Buildings manager sees all active offers, participant count, and payment status
- Export to Excel/PDF for building committee meetings (Israeli bureaucracy expectation)
- Monthly summary report: offers completed, total group savings, contractor ratings
- Buildings manager can invite new residents via WhatsApp blast

---

### 2.7 Contractor Reputation Graph (Word-of-Mouth Amplification)
**Status:** Neo4j graph DB with reputation model built (`graph_features.py`)  
**Complexity:** High

Israeli construction market relies heavily on personal recommendations. A trust graph that surfaces "this contractor worked in 3 buildings near yours with 4.8 average rating" is deeply compelling.

**What makes it differentiating:**
- "Worked near you" signal on contractor profile
- Mutual connections: "2 people in buildings near you used this contractor"
- Track record in specific categories per region
- Visible in contractor matching results (already partially built)

---

## 3. Anti-features — Deliberately Exclude

Features that seem valuable but will hurt the product at this stage.

---

### 3.1 Open Self-Service Building Registration
**Why exclude:** Uncontrolled building creation leads to duplicates, wrong addresses, and support burden. With only 10 target buildings for MVP, curated onboarding is operationally manageable and produces higher data quality.  
**When to reconsider:** After 50+ buildings with automated address deduplication.

---

### 3.2 Bit / PayBox at MVP
**Why exclude:** Already noted in `PROJECT.md`. Stripe is sufficient. Bit/PayBox integrations require separate merchant onboarding (weeks), testing, and support. Splitting payment provider surface at launch increases failure modes.  
**When to reconsider:** After Stripe is fully validated in production and Israeli payment processor conversion data shows meaningful gap.

---

### 3.3 Public Contractor Marketplace (Anyone Can Browse)
**Why exclude:** Opening contractor discovery to unauthenticated users before trust signals are robust creates liability. A resident should be contextually matched to an offer in their building — not browsing a contractor catalogue independently.  
**Exception:** Contractor public profile page is fine (for SEO and social proof) but offer creation and payment must be authenticated.

---

### 3.4 In-App Chat (Web-Based)
**Why exclude:** The existing chat (`conversations` system, WebSocket) competes with WhatsApp. Israeli users will not check an in-app inbox — they expect WhatsApp. Building a parallel chat system splits attention and creates notification fatigue. Use WhatsApp as the primary communication channel and use in-app chat only for system/agent messages.  
**When to reconsider:** If regulatory requirements demand documented in-platform communication (e.g., for dispute resolution).

---

### 3.5 Influencer/Viral Invite Campaign System
**Why exclude:** Already out of scope in `PROJECT.md`. The outreach and influencer agents exist but group-buying platforms need quality depth (trusted buildings) before viral breadth. A viral invite that brings in buildings you can't service creates churn.  
**When to reconsider:** After 50 active buildings with demonstrated offer completion rate > 70%.

---

### 3.6 Mobile App (React Native) at MVP Launch
**Why exclude:** Already excluded in `PROJECT.md`. The web app with WhatsApp integration is sufficient for MVP. Maintaining a separate mobile release adds QA overhead, App Store review delays, and push notification infrastructure at a stage where focus matters.  
**Exception:** Mobile-responsive web (PWA) should work on mobile browsers — that is not optional.

---

### 3.7 ML Predictive Models
**Why exclude:** `ENABLE_PREDICTIVE_MODELS` flag is off. With 10 buildings and limited transaction history, there is not enough data to train meaningful predictions. Use the rule-based pricing engine until sufficient data accumulates.

---

### 3.8 Multi-Contractor Bidding on Same Offer
**Why exclude:** The current model is Groupio matches one contractor per offer. Allowing multiple contractors to bid on the same offer creates confusion, pricing complexity, and contractor cannibalisation. Stick with matched single contractor per offer lifecycle.

---

### 3.9 Resident-to-Resident Chat
**Why exclude:** This is WhatsApp's job. Neighbors already have WhatsApp groups. Building a separate resident-to-resident messaging layer in-app will be ignored and creates moderation burden.

---

## 4. Israeli Market Specifics

Localization requirements that go beyond language translation.

---

### 4.1 VAT (מע"מ) Compliance
**Status:** Invoice service hardcodes 18% VAT — correct for 2025  
**Complexity:** Low (implemented; needs surfacing in UI and receipts)

Every transaction must show:
- Subtotal (לפני מע"מ)
- VAT amount (מע"מ 18%)
- Total (כולל מע"מ)
- Invoice number in ח"פ/ע"מ format

Israeli law requires contractors to issue a tax invoice (חשבונית מס) for services over ₪100. The invoice generation in `src/services/invoice.py` exists — it must produce a legally-compliant PDF.

---

### 4.2 Israeli ID Verification for High-Value Transactions
**Status:** Not built  
**Complexity:** Medium

For transactions above a certain threshold (informally ₪5,000+), Israeli consumers and businesses expect identity verification. Israeli national ID (ת"ז, 9 digits with Luhn-style checksum) is the primary ID document.

**Minimum required:**
- Contractor provides ת"ז or business registration number (ח.פ.) at signup
- Validate ת"ז checksum algorithmically (simple computation)
- Display "business registered in Israel" with registration number on contractor profile
- Do not require resident ת"ז — overkill for this use case

---

### 4.3 Israeli Address Autocomplete
**Status:** `datagov_provider.py` integrates data.gov.il for address lookup  
**Complexity:** Medium

Israeli addresses have specific patterns that international autocomplete (Google Places) handles poorly:
- Street numbers come after street name: "רחוב הרצל 12" not "12 Herzl Street"
- Building/entrance/apartment numbering (בניין, כניסה, דירה)
- Some addresses in Hebrew script only with no Latin transliteration
- Moshavim, kibbutzim, and new developments with non-standard addressing

**Minimum required:**
- Address input uses Hebrew-first autocomplete (data.gov.il or similar)
- Apartment number field separate from street address
- "כניסה" (entrance) field for large buildings
- Geolocation coordinates stored for building (already on `Building` model)

---

### 4.4 Shabbat and Holiday Awareness
**Status:** Not built  
**Complexity:** Low

Scheduling work and sending notifications on Shabbat (Friday sunset to Saturday night) and on Jewish holidays creates negative impressions and may violate social norms for religious residents.

**Minimum required:**
- Do not schedule contractor visits on Shabbat or major Jewish holidays
- Suppress marketing WhatsApp messages on Shabbat
- Offer expiry dates should avoid ending on Shabbat (auto-adjust to Sunday)
- Israeli calendar integration (Hebcal API is free and accurate)

---

### 4.5 Israeli Payment Methods and Trust Signals
**Status:** Stripe primary; Bit/PayBox available but excluded from MVP  
**Complexity:** Low for trust signals; Medium for payment methods

Stripe is recognized by Israeli tech-savvy users but less so by older demographics. Key trust signals needed:
- "תשלום מאובטח" (secure payment) badge with padlock
- Credit card logos: Visa, Mastercard, AmEx (all accepted in Israel)
- Note: Israeli debit cards often work as credit cards on international processors
- Installment payments (תשלומים) are culturally expected in Israel for amounts > ₪1,000

**What to display on checkout:**
- "שלם ב-3 תשלומים" option (requires Stripe installment configuration or a note that this is not yet supported with clear expectation setting)
- No IBAN/bank transfer at MVP (used in B2B but not consumer)

---

### 4.6 Right-to-Left Document Generation
**Status:** Invoice service generates invoices; PDF generation not confirmed RTL  
**Complexity:** Medium

Invoices and receipts must be RTL with Hebrew text. Standard PDF libraries (WeasyPrint, ReportLab) require explicit RTL configuration. An LTR invoice is a red flag for Israeli accountants.

---

### 4.7 Consumer Protection Law Compliance (Israeli)
**Status:** Terms of Service and Privacy Policy pages exist as routes  
**Complexity:** Low (legal content; needs lawyer review)

Israeli Consumer Protection Law (חוק הגנת הצרכן, 1981) and the Amendment to the Consumer Protection Law (2010) impose specific requirements:
- Right to cancel within 14 days of service purchase (if work not started)
- Clear statement of cancellation policy before purchase
- Contractor's obligations to be stated in Hebrew
- Contact information (address + phone) of business on every communication

Israeli Privacy Protection Law (חוק הגנת הפרטיות, 1981 + 2023 amendments) requires:
- Hebrew privacy notice
- Data subject rights (access, correction, deletion)
- Purpose limitation for data collection

---

### 4.8 Dispute Resolution Path (ועד הבית Integration)
**Status:** Escalation system built (priority queue, admin assignment)  
**Complexity:** Medium

When disputes arise (and they will — Israeli construction disputes are common), there needs to be a clear path. Israeli residents may escalate to:
- The building committee (ועד בית)
- The contractor's licensing authority
- Small claims court (בית משפט לתביעות קטנות)

**Minimum required:**
- Clear dispute flow: resident reports issue → escrow held → admin mediates
- Admin can partially release escrow (already modeled as `partially_released`)
- Timeline: dispute resolution must happen within 14 days per Israeli law
- All dispute actions logged in `audit_logs` (already enforced)

---

## 5. Feature Dependencies

Critical dependency chains that determine implementation order.

```
Phone OTP Auth
  └─ Required by: Israeli Identity Trust (4.2), WhatsApp-linked Account, Resident Onboarding

WhatsApp Business API + Meta Template Approval
  └─ Required by: Offer Notifications, Countdown Alerts, Building Manager Invites
  └─ Required for: AI Bot proactive outreach (bot can receive without approval, cannot send without)
  └─ Unblocks: All WhatsApp-dependent group coordination features
  └─ External dependency: 1–2 week Meta approval timeline (start immediately)

Contractor Vetting (Manual + Admin)
  └─ Required by: Verified Badge on Profile, Resident Trust, Insurance Display
  └─ Blocks: Contractor going live on platform
  └─ Required before: Any offer can be created by contractor

Building + Invite Code Creation (Admin/BM)
  └─ Required by: Resident Onboarding, Building-Scoped Offers
  └─ Blocks: Any resident can join

Payment E2E Validation (Stripe Escrow Full Flow)
  └─ Required by: Resident Checkout, Tier Pricing Active
  └─ Blocks: Any real transaction
  └─ Required before: Contractor Payout, Invoice Generation

VAT Invoice Generation (Hebrew PDF)
  └─ Required by: Legal Compliance, Contractor Payout
  └─ Depends on: Payment completion, Offer completed status

Review System
  └─ Depends on: Offer status = completed
  └─ Required by: Contractor Rating, Trust Score update

Offer Countdown + Real-Time Participant Count
  └─ Depends on: WebSocket (existing), Offer model
  └─ Required by: FOMO mechanics, Tier crossing notifications

Israeli Address Autocomplete
  └─ Depends on: data.gov.il integration (partially built)
  └─ Required by: Building registration, Resident onboarding accuracy

Shabbat/Holiday Calendar
  └─ Depends on: Hebcal API or local calendar data
  └─ Required by: Notification scheduling, Offer expiry date auto-adjustment
  └─ Low effort, high cultural signal
```

### Dependency-Ordered Launch Sequence

**Week 1–2 (Blockers — must be resolved before any user can transact):**
1. Meta WhatsApp template approval (start immediately — external dependency)
2. Phone OTP auth integration
3. Payment E2E validation (Stripe full flow)
4. Admin contractor vetting workflow (manual, not automated)
5. Building + invite code creation for BM

**Week 3–4 (Core UX — must be complete before beta launch):**
6. Hebrew UI completeness audit (all flows, error messages)
7. Contractor verified badge + license display
8. Offer countdown + real-time participant counter
9. VAT invoice PDF (Hebrew, RTL)
10. Cancellation policy + T&C Hebrew content

**Week 5–6 (Trust and Retention — must be complete before broader launch):**
11. Review system post-completion
12. Dispute escalation flow
13. Building manager WhatsApp invite blast
14. Shabbat/holiday-aware notification scheduling
15. Post-transaction WhatsApp confirmation templates

---

## Summary Matrix

| Feature | Category | Complexity | Israeli-Specific | In Codebase |
|---------|----------|------------|-----------------|-------------|
| WhatsApp-first comms | Table Stakes | Medium | Yes (97% penetration) | Partial |
| Hebrew RTL UI complete | Table Stakes | Low | Yes | Partial |
| Phone OTP identity | Table Stakes | Medium | Yes (primary auth) | No |
| Contractor license verification | Table Stakes | High | Yes (Ministry registry) | Partial |
| Escrow group payment | Table Stakes | High | Yes (trust gap) | Yes |
| Offer countdown + tiers | Table Stakes | Low | No | Yes |
| Building-scoped discovery | Table Stakes | Low | No | Yes |
| Transparent tier pricing | Table Stakes | Low | No | Yes |
| Invite-only building onboarding | Table Stakes | Medium | No | Partial |
| Post-work verified reviews | Table Stakes | Low | No | Partial |
| AI WhatsApp bot in Hebrew | Differentiator | High | Yes | Yes |
| Building social proof | Differentiator | Medium | Yes (ועד הבית) | Partial |
| Real-time tier progress visual | Differentiator | Low | No | Yes |
| Contractor subscription model | Differentiator | Medium | No | Yes |
| Instant price estimate | Differentiator | Medium | No | Yes |
| Building manager dashboard | Differentiator | Medium | Yes (committee culture) | Partial |
| Contractor reputation graph | Differentiator | High | Yes (word-of-mouth) | Yes |
| VAT compliance + Hebrew invoice | Table Stakes | Low | Yes (legal) | Yes |
| Israeli ת"ז validation | Table Stakes | Low | Yes | No |
| Hebrew address autocomplete | Table Stakes | Medium | Yes | Partial |
| Shabbat/holiday awareness | Table Stakes | Low | Yes | No |
| Payment trust signals (UI) | Table Stakes | Low | Yes | No |
| Consumer protection compliance | Table Stakes | Low | Yes (legal) | Partial |
| Dispute resolution path | Table Stakes | Medium | Yes (legal) | Partial |
| Open self-service buildings | Anti-feature | — | — | — |
| Bit/PayBox at MVP | Anti-feature | — | — | Scaffolded |
| In-app resident chat | Anti-feature | — | — | Built (reconsider) |
| Viral invite campaign | Anti-feature | — | — | Scaffolded |
| Mobile app at MVP | Anti-feature | — | — | In-progress |
| ML predictive models | Anti-feature | — | — | Scaffolded |
| Multi-contractor bidding | Anti-feature | — | — | — |
| Resident-to-resident chat | Anti-feature | — | — | — |
