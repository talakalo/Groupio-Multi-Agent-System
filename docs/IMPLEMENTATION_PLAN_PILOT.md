# Groupio — Pilot Launch Implementation Plan

**Date:** 2026-02-27
**Based on:** `docs/PILOT_READINESS_AUDIT.md`
**Target:** Raise pilot readiness from 62% → 82%+
**Branch:** `claude/pilot-readiness-audit-5pxtS`

---

## Overview

This plan addresses the **5 launch blockers** identified in the audit, plus the **4 highest-value conditional improvements** needed before pilot start. Tasks are broken into three phases with exact file paths, function names, and complexity estimates.

```
Phase 1 — Launch Blockers      (5 tasks, must complete before any real resident)
Phase 2 — Conditional Polish   (4 tasks, complete before pilot kickoff day)
Phase 3 — Post-Pilot Hardening (future work, after first building cycle)
```

**Total Phase 1+2 effort estimate: ~8–12 engineering days**

---

## Phase 1 — Launch Blockers

### Blocker 1: Real Payment Provider (Stripe)

**Current state:** `MockPaymentProvider` is active by default. `StripePaymentProvider` class exists in `src/services/payment.py` with a `TODO` comment on every method. All transactions return fake `txn_<uuid>` IDs.

**Complexity:** M

#### 1.1 Complete `StripePaymentProvider` in `src/services/payment.py`

Implement the 4 abstract methods. Stripe `stripe>=7.0.0` package must be added to `pyproject.toml`.

```python
# File: src/services/payment.py
# Methods to implement on class StripePaymentProvider:

async def create_charge(self, amount, currency, customer_id, metadata) -> dict:
    """
    Use self._stripe.PaymentIntent.create():
      - amount: int(amount * 100)  # Stripe uses smallest currency unit (agorot)
      - currency: currency.lower()
      - customer: customer_id
      - metadata: metadata or {}
      - confirm: True  # auto-confirm for pilot
      - payment_method: metadata.get("payment_method_id")
    Return: {transaction_id: pi.id, status: pi.status, amount, currency, ...}
    """

async def refund(self, transaction_id, amount=None) -> dict:
    """
    Use self._stripe.Refund.create():
      - payment_intent: transaction_id
      - amount: int(amount * 100) if amount else None (full refund if None)
    Return: {refund_id: r.id, status: r.status, amount, transaction_id}
    """

async def get_status(self, transaction_id) -> dict:
    """
    Use self._stripe.PaymentIntent.retrieve(transaction_id)
    Return: {transaction_id, status: pi.status, amount: pi.amount / 100}
    """

async def create_customer(self, user_id, email) -> str:
    """
    Use self._stripe.Customer.create(email=email, metadata={"user_id": user_id})
    Return: customer.id (string)
    """
```

#### 1.2 Add Stripe webhook handler in `src/api/routes/payments.py`

Stripe sends async events (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`). Add a new endpoint:

```python
# File: src/api/routes/payments.py
# New endpoint (add after existing routes):

@router.post("/webhook/stripe")
async def stripe_webhook(request: Request) -> Response:
    """
    Handle Stripe webhook events.
    1. Verify signature: stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    2. Handle event types:
       - "payment_intent.succeeded" → update payments table: status="completed"
       - "payment_intent.payment_failed" → update: status="failed"
       - "charge.refunded" → update: status="refunded"
    3. Return 200 OK (Stripe retries on non-200)
    """
```

New env vars to add to `src/config/settings.py` and `docker/.env.example`:
```
STRIPE_WEBHOOK_SECRET=whsec_...   # For webhook signature verification
```

#### 1.3 Add `stripe>=7.0.0` to dependencies

```toml
# File: pyproject.toml
# Under [project] dependencies, add:
"stripe>=7.0.0",
```

#### 1.4 Update `docker/.env.example`

```bash
# Payment (set PAYMENT_PROVIDER=stripe for real pilot)
PAYMENT_PROVIDER=mock          # Change to "stripe" for pilot
STRIPE_SECRET_KEY=sk_live_...  # Get from Stripe dashboard
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_... # From Stripe webhook settings
```

#### 1.5 Add integration test

```
# File: tests/integration/test_stripe_payment.py (NEW)
# Tests:
# - test_create_charge_stripe(): mock stripe SDK, assert PaymentIntent.create called
# - test_refund_stripe(): mock Refund.create, assert correct amount conversion
# - test_stripe_webhook_succeeded(): POST to /webhook/stripe, assert DB updated
# - test_stripe_webhook_failed(): assert status set to "failed"
```

**Dependencies:** None (self-contained)
**Verification:** Set `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY=sk_test_...` → run test charge → confirm real `pi_` transaction ID returned

---

### Blocker 2: Offer Lifecycle Notifications

**Current state:** `src/api/routes/offers.py` has zero calls to any notification service across all 6 lifecycle-changing endpoints. `EmailService.send_email()` is fully functional.

**Complexity:** M

#### 2.1 Add offer notification helpers to `src/services/email.py`

Add 6 new methods to the `EmailService` class (after the existing `send_password_reset_email` method):

```python
# File: src/services/email.py
# New methods to add to class EmailService:

async def send_offer_joined(self, to_email: str, user_name: str,
                             offer_title: str, current_participants: int,
                             min_participants: int, offer_id: str) -> bool:
    """Notify resident they successfully joined an offer."""
    # Subject: f"הצטרפת להצעה: {offer_title}"
    # Body: confirmation + current/min count + link to offer
    # include: "ניתן לעזוב את ההצעה בכל עת עד לשלב ההתאמה"

async def send_offer_left(self, to_email: str, user_name: str,
                           offer_title: str, offer_id: str) -> bool:
    """Notify resident they left an offer."""
    # Subject: f"עזבת את ההצעה: {offer_title}"
    # Body: confirmation + re-join info (can rejoin if offer still open)

async def send_offer_threshold_reached(self, to_email: str, user_name: str,
                                        offer_title: str, participants: int,
                                        discount_percent: int) -> bool:
    """Notify all participants when minimum threshold is reached."""
    # Subject: f"🎉 ההצעה {offer_title} הגיעה למינימום!"
    # Body: "{participants} דיירים הצטרפו! הנחה: {discount_percent}%"

async def send_offer_cancelled(self, to_email: str, user_name: str,
                                offer_title: str, reason: str | None = None) -> bool:
    """Notify participants that an offer was cancelled."""
    # Subject: f"ההצעה {offer_title} בוטלה"
    # Body: reason (if provided) + refund info if applicable

async def send_offer_matched(self, to_email: str, user_name: str,
                              offer_title: str, contractor_name: str,
                              final_price: float, offer_id: str) -> bool:
    """Notify participants when offer is matched to a contractor."""
    # Subject: f"קבלן נמצא להצעה: {offer_title}"
    # Body: contractor name + trust score + final price + payment link

async def send_offer_approved(self, to_email: str, user_name: str,
                               offer_title: str, offer_id: str) -> bool:
    """Notify offer creator when admin approves their offer."""
    # Subject: f"ההצעה שלך אושרה: {offer_title}"
    # Body: "ההצעה שלך פורסמה ופתוחה להצטרפות"
```

#### 2.2 Wire notifications into `src/api/routes/offers.py`

Add `from src.services.email import get_email_service` import and trigger after each state change. Pattern for every endpoint:

```python
# File: src/api/routes/offers.py

# --- ADD to imports (top of file) ---
from src.services.email import get_email_service

# --- In join_offer(), after: await db.join_offer(...) ---
email_svc = get_email_service()
asyncio.create_task(email_svc.send_offer_joined(
    to_email=current_user.email,
    user_name=current_user.full_name,
    offer_title=offer.get("title", ""),
    current_participants=offer.get("current_participants", 0) + 1,
    min_participants=offer.get("min_participants", 0),
    offer_id=offer_id,
))
# Check threshold and notify all participants if newly reached:
new_count = offer.get("current_participants", 0) + 1
if new_count == offer.get("min_participants"):
    participants = await db.get_offer_participants(offer_id)
    for p in participants:
        asyncio.create_task(email_svc.send_offer_threshold_reached(
            to_email=p["email"], user_name=p["full_name"],
            offer_title=offer.get("title", ""),
            participants=new_count,
            discount_percent=_get_discount_for_tier(offer, new_count),
        ))

# --- In leave_offer(), after: await db.leave_offer(...) ---
asyncio.create_task(email_svc.send_offer_left(
    to_email=current_user.email,
    user_name=current_user.full_name,
    offer_title=offer.get("title", ""),
    offer_id=offer_id,
))

# --- In delete_offer() [cancel], after: await db.update_offer(... CANCELLED) ---
participants = await db.get_offer_participants(offer_id)
for p in participants:
    asyncio.create_task(email_svc.send_offer_cancelled(
        to_email=p["email"], user_name=p["full_name"],
        offer_title=offer.get("title", ""),
    ))

# --- In match_contractor(), after: await db.update_offer(... MATCHED) ---
participants = await db.get_offer_participants(offer_id)
for p in participants:
    asyncio.create_task(email_svc.send_offer_matched(
        to_email=p["email"], user_name=p["full_name"],
        offer_title=offer.get("title", ""),
        contractor_name=contractor.get("business_name", ""),
        final_price=offer.get("base_price", 0),
        offer_id=offer_id,
    ))
```

**Note:** Use FastAPI's `BackgroundTasks` (preferred) or `asyncio.create_task()` (fire-and-forget) — notification failure must never block the API response. Add `background_tasks: BackgroundTasks` to each endpoint signature.

**Important finding:** `src/agents/notification.py` `NotificationAgent._dispatch()` currently **only logs** — it never calls `EmailService.send_email()` or `WhatsAppBotService.send_notification()`. Fix this method in parallel:

```python
# File: src/agents/notification.py
# In NotificationAgent._dispatch(), after the existing log statement, add:
from src.services.email import get_email_service
from src.services.whatsapp_bot import get_whatsapp_bot

if channel == "email" and user_profile.get("email"):
    email_svc = get_email_service()
    await email_svc.send_email(
        to_email=user_profile["email"],
        subject=message.get("subject", "Groupio Update"),
        html_content=f"<p dir='rtl'>{message.get('body', '')}</p>",
    )
elif channel == "whatsapp" and user_profile.get("phone"):
    wa = get_whatsapp_bot()
    await wa._send_text_message(to=user_profile["phone"], text=message.get("body", ""))
```

#### 2.3 Wire notifications into `src/api/routes/admin.py`

```python
# File: src/api/routes/admin.py

# --- In approve_offer(), after DB update ---
offer_creator = await db.get_user(offer.get("created_by"))
if offer_creator:
    asyncio.create_task(email_svc.send_offer_approved(
        to_email=offer_creator.email,
        user_name=offer_creator.full_name,
        offer_title=offer.get("title", ""),
        offer_id=offer_id,
    ))

# --- In cancel_offer(), after DB update ---
participants = await db.get_offer_participants(offer_id)
for p in participants:
    asyncio.create_task(email_svc.send_offer_cancelled(
        to_email=p["email"], user_name=p["full_name"],
        offer_title=offer.get("title", ""),
        reason=request.reason if hasattr(request, "reason") else None,
    ))
```

#### 2.4 Add `_get_discount_for_tier()` helper in `src/api/routes/offers.py`

```python
# File: src/api/routes/offers.py
# New private helper function:

def _get_discount_for_tier(offer: dict, participants: int) -> int:
    """Return discount percentage for current participant count."""
    tiers = offer.get("pricing_tiers", [])
    for tier in sorted(tiers, key=lambda t: t.get("min", 0), reverse=True):
        if participants >= tier.get("min", 0):
            return int(tier.get("discount_percent", 0))
    return 0
```

#### 2.5 Add tests

```
# File: tests/unit/test_offer_notifications.py (NEW)
# Tests:
# - test_join_sends_email(): mock email_svc, call join_offer, assert send_offer_joined called
# - test_join_at_threshold_notifies_all(): mock db.get_offer_participants, assert broadcast
# - test_leave_sends_email(): assert send_offer_left called
# - test_cancel_notifies_participants(): assert all participants notified
# - test_match_notifies_participants(): assert send_offer_matched called with contractor name
# - test_notification_failure_doesnt_block_join(): email_svc raises exception, join still returns 200
```

**Dependencies:** Blocker 2 has no dependencies on other blockers.

---

### Blocker 3: Cancellation Policy Shown to Residents

**Current state:** Terms page (`apps/web/app/terms/page.tsx`) has real content. Privacy page has real content. But no cancellation-specific policy is shown at the critical moment — when a resident clicks "Join".

**Complexity:** S

#### 3.1 Create `JoinConfirmationModal` component

```
# File: apps/web/components/offers/JoinConfirmationModal.tsx (NEW)
```

```tsx
// Component props:
interface JoinConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  offer: { title: string; min_participants: number; base_price: number };
  isLoading: boolean;
}

// Modal content must include:
// 1. Offer title + price summary
// 2. "Joining is non-binding — no payment is taken now"
// 3. Cancellation policy block:
//    "ניתן לעזוב את ההצעה בכל עת עד שלב ההתאמה (Matching).
//     לאחר שנמצא קבלן, ניתן לבטל רק דרך תמיכת לקוחות.
//     לאחר ביצוע תשלום, ביטולים כפופים למדיניות ההחזרים."
// 4. Link to full Terms page: <Link href="/terms">תנאי שימוש מלאים</Link>
// 5. Checkbox: "קראתי ומסכים/ה לתנאים" (required to enable Confirm button)
// 6. "אישור הצטרפות" button (primary) + "ביטול" button (ghost)
```

#### 3.2 Wire modal into offer detail page

```tsx
// File: apps/web/app/(resident)/offers/[offerId]/page.tsx
// Changes:
// 1. Add state: const [showJoinModal, setShowJoinModal] = useState(false)
// 2. Change "Join" button onClick from direct mutation to: setShowJoinModal(true)
// 3. Render <JoinConfirmationModal> with onConfirm triggering the existing joinMutation
// 4. On successful join: close modal, show success toast
```

#### 3.3 Add cancellation policy section to offer detail page

```tsx
// File: apps/web/app/(resident)/offers/[offerId]/page.tsx
// Add a new section (between contractor info and participants list):

// <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
//   <h3 className="font-semibold text-amber-900 mb-2">מדיניות ביטול</h3>
//   <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
//     <li>ניתן לעזוב חופשית עד לשלב ההתאמה</li>
//     <li>לאחר אישור קבלן – ביטול דרך תמיכת לקוחות בלבד</li>
//     <li>לאחר תשלום – כפוף למדיניות ההחזרים</li>
//   </ul>
//   <Link href="/terms" className="text-xs text-amber-700 underline mt-2 inline-block">
//     קרא את תנאי השימוש המלאים ←
//   </Link>
// </section>
```

#### 3.4 Add cancellation policy section to Terms page

```tsx
// File: apps/web/app/terms/page.tsx
// Add a new <section> (after existing section 2 "תיאור השירות"):

// <section>
//   <h2>3. מדיניות ביטול והחזרים</h2>
//   <h3>ביטול לפני התאמת קבלן</h3>
//   <p>דייר רשאי לעזוב הצעה פעילה בכל עת לפני שלב ההתאמה, ללא חיוב.</p>
//   <h3>ביטול לאחר התאמת קבלן</h3>
//   <p>ביטול לאחר שנמצא קבלן כפוף לאישור מנהל. יש ליצור קשר עם תמיכת לקוחות.</p>
//   <h3>ביטול לאחר תשלום</h3>
//   <p>החזרים יינתנו בהתאם לשלב העבודה. עמלת פלטפורמה אינה מוחזרת.</p>
//   <h3>ביטול על ידי מנהל המערכת</h3>
//   <p>Groupio רשאית לבטל הצעה בכל עת. כל המשתתפים יקבלו הודעה והחזר מלא.</p>
// </section>
```

**Dependencies:** None (self-contained UI work)
**Note:** Terms page already has real legal content — Blocker 5 is effectively resolved. The missing piece was the cancellation-specific section.

---

### Blocker 4: Admin CSV Data Export

**Current state:** `src/api/routes/admin.py` has no export endpoints. The admin frontend (`apps/admin/app/offers/page.tsx`) has no export buttons.

**Complexity:** M

#### 4.1 Add export endpoints to `src/api/routes/admin.py`

```python
# File: src/api/routes/admin.py
# New imports to add:
import csv
import io
from fastapi.responses import StreamingResponse
from datetime import date

# New endpoints (add after existing /audit-logs route):

@router.get("/export/offers")
async def export_offers_csv(
    status: str | None = None,
    building_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
) -> StreamingResponse:
    """Export all offers to CSV. Admin only."""
    db = get_postgres_client()

    filters = {}
    if status:
        filters["status"] = status
    if building_id:
        filters["building_id"] = building_id

    offers, _ = await db.get_all_offers_admin(
        page=1, page_size=10000,
        **{k: v for k, v in filters.items() if v}
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "title", "category", "status", "building_id",
        "base_price", "current_participants", "min_participants",
        "max_participants", "matched_contractor_id", "created_by",
        "created_at", "deadline",
    ])
    writer.writeheader()
    for offer in offers:
        writer.writerow({k: offer.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    filename = f"groupio_offers_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/participants")
async def export_participants_csv(
    offer_id: str | None = None,
    building_id: str | None = None,
) -> StreamingResponse:
    """Export offer participants to CSV. Admin only."""
    db = get_postgres_client()

    # Fetch all participants (with offer + user join)
    participants = await db.get_all_participants_admin(
        offer_id=offer_id,
        building_id=building_id,
    )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "participant_id", "offer_id", "offer_title",
        "user_id", "user_name", "user_email",
        "unit_count", "joined_at",
    ])
    writer.writeheader()
    for p in participants:
        writer.writerow({k: p.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    filename = f"groupio_participants_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/payments")
async def export_payments_csv() -> StreamingResponse:
    """Export all payments to CSV. Admin only."""
    db = get_postgres_client()
    payments = await db.list_all_payments_admin()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "offer_id", "user_id", "amount", "currency",
        "status", "payment_type", "provider", "transaction_id", "created_at",
    ])
    writer.writeheader()
    for p in payments:
        writer.writerow({k: p.get(k, "") for k in writer.fieldnames})

    output.seek(0)
    filename = f"groupio_payments_{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
```

#### 4.2 Add `get_all_participants_admin()` to `src/databases/postgres.py`

```python
# File: src/databases/postgres.py
# New method to add to PostgresClient class:

async def get_all_participants_admin(
    self,
    offer_id: str | None = None,
    building_id: str | None = None,
) -> list[dict]:
    """Fetch all participants with offer + user details for admin export."""
    # JOIN offer_participants → offers → users
    # Filter by offer_id or building_id if provided
    # Return: participant_id, offer_id, offer_title, user_id,
    #         user_name, user_email, unit_count, joined_at
    ...

async def list_all_payments_admin(self) -> list[dict]:
    """Fetch all payments for admin CSV export."""
    # SELECT all from payments JOIN invoices for offer_id
    ...
```

#### 4.3 Add export buttons to admin offers page

```tsx
// File: apps/admin/app/offers/page.tsx
// Add export toolbar above the offers table:

// <div className="flex justify-end gap-3 mb-4">
//   <Button variant="outline" size="sm" onClick={() => downloadCsv('/api/v1/admin/export/offers')}>
//     <Download className="h-4 w-4 mr-2" />
//     ייצוא הצעות CSV
//   </Button>
//   <Button variant="outline" size="sm" onClick={() => downloadCsv('/api/v1/admin/export/participants')}>
//     <Download className="h-4 w-4 mr-2" />
//     ייצוא משתתפים CSV
//   </Button>
// </div>

// Helper function (add to page or lib/utils):
// async function downloadCsv(url: string) {
//   const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
//   const blob = await res.blob();
//   const a = document.createElement('a');
//   a.href = URL.createObjectURL(blob);
//   a.download = res.headers.get('content-disposition')?.split('filename=')[1] || 'export.csv';
//   a.click();
// }
```

#### 4.4 Add to admin payments page

```tsx
// File: apps/admin/app/payments/page.tsx
// Add export button: downloadCsv('/api/v1/admin/export/payments')
```

#### 4.5 Add tests

```
# File: tests/unit/test_admin_export.py (NEW)
# Tests:
# - test_export_offers_csv_returns_csv(): assert content-type=text/csv, header row correct
# - test_export_participants_csv(): assert joined_at field present
# - test_export_payments_csv(): assert amount, status fields present
# - test_export_requires_admin_auth(): assert 403 for non-admin user
```

**Dependencies:** Requires `get_all_participants_admin()` DB method to be added before endpoint tests pass.

---

### Blocker 5: Terms & Privacy Pages — Legal Disclaimer Removal

**Current state (confirmed by code inspection):** Both `apps/web/app/terms/page.tsx` and `apps/web/app/privacy/page.tsx` have **real, substantive content** dated 2026-02-27 across 8–10 sections each. **HOWEVER** — both pages contain an identical disclaimer at the bottom:

```
⚠️ מסמך זה הינו טיוטה המיועדת לבדיקה פנימית בלבד ואינה מייצגת
ייעוץ משפטי. יש להביאה לסקירת עורך דין לפני פרסום לציבור.
```

**("This document is an internal draft only and does not constitute legal advice. It must be reviewed by a lawyer before publication.")**

This disclaimer makes Blocker 5 a real blocker. The pages exist, but cannot be shown to real users in their current state.

**Additional gap found:** Platform fee inconsistency — Terms page section 6 states "עמלת פלטפורמה של עד 3%", but `src/api/routes/payments.py` `_platform_fee_rate()` returns `0.05` (5%). These must be aligned as a business decision before legal sign-off.

**Complexity:** S (code) + External (legal review)

#### 5.1 Obtain legal review (non-code, blocks everything)

Have a licensed Israeli attorney review both pages for compliance with:
- Israeli Consumer Protection Law 5741-1981
- Privacy Protection Law 5741-1981
- Israeli Payment Services Law 5779-2019 (relevant to escrow)

**This is a process blocker. Code changes in steps 5.2–5.4 can be prepared in parallel.**

#### 5.2 Remove the draft disclaimer after legal sign-off

```tsx
// File: apps/web/app/terms/page.tsx
// Remove: the <p> block containing "מסמך זה הינו טיוטה..."

// File: apps/web/app/privacy/page.tsx
// Remove: the identical <p> block containing "מסמך זה הינו טיוטה..."
```

#### 5.3 Align platform fee (business decision required first)

```python
# Option A: Lower code to match Terms (3%)
# File: src/api/routes/payments.py
# Change _platform_fee_rate() return from 0.05 to 0.03

# Option B: Update Terms to match code (5%)
# File: apps/web/app/terms/page.tsx — section 6
# Change "עד 3%" to "עד 5%"
```

#### 5.5 Add Terms acceptance at signup

```tsx
// File: apps/web/app/(auth)/signup/page.tsx (or equivalent signup form)
// Add before submit button:

// <label className="flex items-start gap-2 text-sm text-gray-600">
//   <input type="checkbox" required className="mt-0.5" />
//   <span>
//     קראתי ומסכים/ה ל<Link href="/terms" className="underline text-primary-600">תנאי השימוש</Link>
//     ול<Link href="/privacy" className="underline text-primary-600">מדיניות הפרטיות</Link>
//   </span>
// </label>
```

#### 5.3 Add `terms_accepted_at` field to users table

```python
# File: alembic/versions/ — create new migration file
# alembic revision --autogenerate -m "add_terms_accepted_at_to_users"

# In upgrade():
# op.add_column('users', sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True))

# Capture on signup in src/api/routes/auth.py:
# user_data["terms_accepted_at"] = datetime.now(UTC).isoformat()
```

**Dependencies:** None.

---

## Phase 2 — Conditional Improvements (Before Pilot Kickoff)

### Improvement A: Participant Anonymization

**Risk:** `GET /offers/{offer_id}/participants` may return full names and emails visible to all participants.

**Complexity:** S

#### A.1 Anonymize participant response in `src/api/routes/offers.py`

```python
# File: src/api/routes/offers.py
# In get_participants(), replace raw participant data with anonymized view:

def _anonymize_participant(p: dict, current_user_id: str) -> dict:
    """Return unit number only; expose full data only to self."""
    is_self = p.get("user_id") == current_user_id
    return {
        "participant_id": p.get("id"),
        "unit_number": p.get("unit_number", "דייר"),  # "Resident"
        "unit_count": p.get("unit_count", 1),
        "joined_at": p.get("joined_at"),
        # Only expose personal details to the participant themselves:
        "name": p.get("full_name") if is_self else None,
        "email": p.get("email") if is_self else None,
        "is_self": is_self,
    }

# In get_participants() route, change return to:
anonymized = [_anonymize_participant(p, current_user.id) for p in participants]
return {"participants": anonymized, "total": len(anonymized)}
```

---

### Improvement B: Offer Expiry Mechanism

**Risk:** Offers can sit in `PENDING` state indefinitely with no communication to participants.

**Complexity:** M

#### B.1 Add `deadline` enforcement to `src/workers/agent_worker.py`

```python
# File: src/workers/agent_worker.py
# Add new scheduled task (run every 6 hours):

async def expire_stale_offers():
    """Cancel offers past their deadline with no contractor match."""
    db = get_postgres_client()
    email_svc = get_email_service()

    expired = await db.get_expired_offers()  # deadline < now AND status in (pending, matching)
    for offer in expired:
        await db.update_offer(offer["id"], {"status": "cancelled"})
        participants = await db.get_offer_participants(offer["id"])
        for p in participants:
            await email_svc.send_offer_cancelled(
                to_email=p["email"],
                user_name=p["full_name"],
                offer_title=offer["title"],
                reason="ההצעה פגה - לא הושג מינימום משתתפים בזמן",
            )
        logger.info("Expired offer %s, notified %d participants", offer["id"], len(participants))
```

#### B.2 Add `get_expired_offers()` to `src/databases/postgres.py`

```python
# File: src/databases/postgres.py
async def get_expired_offers(self) -> list[dict]:
    """Return offers past deadline in pending/matching status."""
    # SELECT * FROM offers
    # WHERE deadline < NOW()
    # AND status IN ('pending', 'matching')
```

#### B.3 Surface deadline countdown in offer detail UI

```tsx
// File: apps/web/app/(resident)/offers/[offerId]/page.tsx
// Add to offer header section, below participant count:

// {offer.deadline && (
//   <div className="flex items-center gap-1.5 text-sm text-orange-600">
//     <Clock className="h-4 w-4" />
//     <span>
//       {daysUntil(offer.deadline) > 0
//         ? `${daysUntil(offer.deadline)} ימים נותרו`
//         : "ההצעה פגה"}
//     </span>
//   </div>
// )}
```

---

### Improvement C: Social Proof on Offer Cards

**Risk:** Residents see no contractor reputation before joining. Trust is built blind.

**Complexity:** S

#### C.1 Include contractor trust data in offer list response

```python
# File: src/api/routes/offers.py
# In list_offers() and get_offer(), enrich with contractor data when matched:

# After fetching offer from DB:
if offer.get("matched_contractor_id"):
    contractor = await db.get_contractor(offer["matched_contractor_id"])
    if contractor:
        offer["contractor_name"] = contractor.get("business_name")
        offer["contractor_trust_score"] = contractor.get("trust_score")
        offer["contractor_avg_rating"] = contractor.get("average_rating")
        offer["contractor_reviews_count"] = contractor.get("total_reviews")
        offer["contractor_verified"] = contractor.get("verification_status") == "verified"
```

#### C.2 Display on offer cards in `apps/web/components/offers/`

```tsx
// File: apps/web/components/offers/OfferCard.tsx (or equivalent card component)
// Add contractor trust badge when offer.contractor_trust_score is present:

// {offer.contractor_verified && (
//   <div className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
//     <Shield className="h-3 w-3" />
//     <span>קבלן מאומת</span>
//   </div>
// )}
// {offer.contractor_avg_rating && (
//   <div className="flex items-center gap-1 text-xs text-amber-700">
//     <Star className="h-3 w-3 fill-amber-400" />
//     <span>{offer.contractor_avg_rating.toFixed(1)} ({offer.contractor_reviews_count} ביקורות)</span>
//   </div>
// )}
```

---

### Improvement D: Vetting Pipeline Monitoring

**Risk:** Vetting Agent can fail silently, leaving contractors in limbo without trust scores.

**Complexity:** S

#### D.1 Add monitoring alert in `src/agents/vetting.py`

```python
# File: src/agents/vetting.py
# In the vetting execution, wrap the main scoring block:

try:
    trust_score = await self._calculate_trust_score(contractor_data)
    ...
except Exception as e:
    logger.error("Vetting pipeline failed for contractor %s: %s", contractor_id, e)
    # Alert admin via escalation system:
    await db.create_escalation({
        "source_agent": "vetting",
        "priority": "high",
        "reason": "vetting_failure",
        "details": {
            "contractor_id": contractor_id,
            "error": str(e),
            "action_required": "Manual vetting required",
        }
    })
    # Set contractor to manual_review status instead of leaving in limbo:
    await db.update_contractor(contractor_id, {
        "verification_status": "pending",
        "trust_score": None,  # Explicitly null = not yet scored
    })
```

#### D.2 Add "Pending Vetting" count to admin dashboard

```tsx
// File: apps/admin/app/dashboard/page.tsx
// Add KPI card alongside existing stats:

// {pendingVetting > 0 && (
//   <StatCard
//     title="ממתינים לאימות"
//     value={pendingVetting}
//     icon={Shield}
//     variant="warning"
//     href="/admin/contractors?status=pending"
//   />
// )}
```

```python
# File: src/api/routes/admin.py
# In get_analytics(), add:
try:
    pending_vetting_result = await db.count_contractors_by_status("pending")
    pending_vetting = pending_vetting_result
except Exception:
    pending_vetting = 0
# Include in return dict: "pending_vetting_contractors": pending_vetting
```

---

## Phase 3 — Post-Pilot Hardening (After First Building Cycle)

These items are not blockers for the pilot but should be completed before expanding to additional buildings.

| # | Item | File(s) | Complexity |
|---|------|---------|------------|
| P3-1 | Admin manual payment status override | `src/api/routes/admin.py` + `apps/admin/app/payments/` | M |
| P3-2 | Force-cancel offers in any status (admin override) | `src/api/routes/admin.py` | S |
| P3-3 | Post-leave threshold check (auto-detect collapse) | `src/api/routes/offers.py` leave_offer() | S |
| P3-4 | WhatsApp notification channel | `src/services/whatsapp_bot.py` + `src/api/routes/offers.py` | M |
| P3-5 | In-app messaging (resident ↔ contractor) | New `apps/web/app/(resident)/chat/` + WebSocket route | L |
| P3-6 | Mobile app pilot (iOS TestFlight) | `apps/mobile/` | L |
| P3-7 | Real-time savings calculator on offer join | `apps/web/app/(resident)/offers/[offerId]/page.tsx` | S |
| P3-8 | Two-factor authentication (TOTP) | `src/api/routes/auth.py` + `apps/web/app/(auth)/` | M |
| P3-9 | Load testing (200+ concurrent residents) | `tests/load/` (new, use locust) | M |
| P3-10 | Penetration test | External engagement | L |

---

## Implementation Order & Dependencies

```
Week 1 (Days 1–5):
  Day 1–2:  Blocker 2 (Notifications) — highest trust impact, independent
  Day 3:    Blocker 3 (Cancellation policy + JoinModal) — UI-only, independent
  Day 4–5:  Blocker 4 (CSV Export) — backend + frontend

Week 2 (Days 6–10):
  Day 6–8:  Blocker 1 (Stripe integration) — needs Stripe test account
  Day 9:    Blocker 5 (Terms acceptance at signup + migration)
  Day 10:   Phase 2 improvements A + C (anonymization + social proof) — small

Pre-Pilot (Days 11–12):
  Day 11:   Phase 2 improvement B (offer expiry worker)
  Day 12:   Phase 2 improvement D (vetting monitoring)
            Integration testing across all 5 blockers
            Staging deploy + smoke test with test accounts
```

---

## Environment Changes Required Before Pilot

```bash
# docker/.env (production/staging)
PAYMENT_PROVIDER=stripe              # was: mock
STRIPE_SECRET_KEY=sk_live_...        # from Stripe dashboard
STRIPE_PUBLISHABLE_KEY=pk_live_...   # from Stripe dashboard
STRIPE_WEBHOOK_SECRET=whsec_...      # from Stripe webhook settings

SENTRY_DSN=https://...@sentry.io/... # MANDATORY for pilot (was optional)
ENVIRONMENT=production               # triggers MockPaymentProvider warning

SMTP_HOST=smtp.gmail.com             # must be configured
SMTP_USER=noreply@groupio.co.il      # real account
SMTP_PASSWORD=app-password-here      # app password
```

---

## Definition of Done (Pilot-Ready Checklist)

- [ ] Stripe test charge succeeds and returns real `pi_` transaction ID
- [ ] Stripe webhook updates payment status in DB
- [ ] Join offer → resident receives email within 60 seconds
- [ ] Offer reaches minimum → all participants receive email
- [ ] Offer cancelled → all participants receive email
- [ ] `GET /admin/export/offers` returns valid CSV with all rows
- [ ] `GET /admin/export/participants` returns valid CSV
- [ ] JoinConfirmationModal displays with cancellation policy + checkbox
- [ ] Terms page section 3 includes cancellation policy
- [ ] Terms acceptance checkbox present and required at signup
- [ ] `terms_accepted_at` saved to DB on signup
- [ ] `GET /offers/{id}/participants` returns unit numbers, not full names
- [ ] All new tests passing (`pytest tests/unit/ -v`)
- [ ] Staging deploy smoke test: full join → notify → export → cancel flow
- [ ] Sentry `SENTRY_DSN` configured and test error captured

---

*Plan written 2026-02-27. Implementation targets `claude/pilot-readiness-audit-5pxtS` branch.*
