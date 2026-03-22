"use client";

/**
 * Checkout page — handles both mock (dev) and Stripe (prod) payment flows.
 *
 * Flow:
 *  1. Page mounts and calls POST /payments/initiate with offerId from query string.
 *  2. Backend returns a Payment object:
 *     - Mock mode: status = "succeeded", no client_secret → show success immediately.
 *     - Stripe mode: status = "requires_payment_method" or "requires_confirmation",
 *       client_secret present → mount Stripe PaymentElement for card capture.
 *  3. After Stripe confirmation, poll backend for final status or rely on Stripe redirect.
 *
 * IMPORTANT: Do NOT persist any payment card data in state, localStorage, or cookies.
 * All sensitive card data is handled exclusively by Stripe.js in a sandboxed iframe.
 */

import { Loader2, CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, Share2, CreditCard, Receipt } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";

// ---- Types ----

interface PaymentResult {
  id: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;        // Total including VAT
  currency: string;
  client_secret?: string | null;
  offer_id?: string;
}

// ---- Stripe Elements (dynamically imported; only loaded when client_secret present) ----

const StripeCheckoutForm = dynamic(
  () => import("@/components/payments/StripeCheckoutForm"),
  {
    loading: () => (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
        <span className="mr-3 text-gray-500 text-sm">טוען טופס תשלום מאובטח...</span>
      </div>
    ),
    ssr: false,
  }
);

// ---- Sub-components ----

function EscrowBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
      <ShieldCheck className="h-4 w-4 text-indigo-500 flex-shrink-0" aria-hidden="true" />
      <span>
        התשלום מוגן בנאמנות (Escrow) — הכסף ישוחרר לקבלן רק לאחר אישורך על השלמת העבודה.
      </span>
    </div>
  );
}

function fmt(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Order summary showing subtotal, מע"מ (18%), and total.
 * Displayed before the Stripe card form.
 */
function OrderSummary({
  subtotal,
  taxRate,
  taxAmount,
  total,
  currency,
}: {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
}) {
  const vatPct = Math.round(taxRate * 100);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <Receipt className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-900">סיכום הזמנה</span>
      </div>
      <dl className="px-4 py-3 space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <dt>מחיר לפני מע&quot;מ</dt>
          <dd dir="ltr">{fmt(subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between text-gray-600">
          <dt>מע&quot;מ {vatPct}%</dt>
          <dd dir="ltr">{fmt(taxAmount, currency)}</dd>
        </div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 text-base">
          <dt>סה&quot;כ לתשלום</dt>
          <dd dir="ltr">{fmt(total, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Badge showing that payment is by credit card via Stripe. */
function CreditCardBadge() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <CreditCard className="h-5 w-5 text-indigo-600 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-indigo-800">תשלום בכרטיס אשראי</p>
        <p className="text-xs text-indigo-600">Visa · Mastercard · American Express · Diners</p>
      </div>
      <div className="ms-auto flex gap-1.5 text-gray-400" aria-hidden="true">
        {/* Card network mini-icons (text placeholders) */}
        {["VISA", "MC"].map((n) => (
          <span key={n} className="text-[10px] font-bold border border-gray-300 rounded px-1 bg-white">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShareButton({ offerId }: { offerId?: string }) {
  const [copied, setCopied] = useState(false);
  if (!offerId) return null;

  const handleShare = async () => {
    const url = `${window.location.origin}/offers/${offerId}`;
    const shareData = { title: "Groupio — הצטרפו להצעה הקבוצתית!", url };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="btn-secondary flex items-center gap-2 justify-center"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {copied ? "הקישור הועתק!" : "שתפו עם השכנים"}
    </button>
  );
}

function SuccessState({
  subtotal,
  taxAmount,
  taxRate,
  amount,
  currency,
  offerId,
  simulatedPayment,
}: {
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  amount: number;
  currency: string;
  offerId?: string;
  /** True when checkout completed without Stripe `client_secret` (e.g. mock provider). */
  simulatedPayment?: boolean;
}) {
  const vatPct = Math.round((taxRate ?? 0.18) * 100);
  const sub = subtotal ?? Math.round(amount / 1.18 * 100) / 100;
  const tax = taxAmount ?? Math.round(sub * 0.18 * 100) / 100;

  return (
    <div className="space-y-4 py-6">
      {simulatedPayment && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 text-start"
        >
          <strong>מצב תשלום לבדיקות:</strong> הושלם ללא חיוב כרטיס חיצוני (למשל ספק mock). אין כסף אמיתי. לייצור יש להגדיר
          ספק תשלום אמיתי בשרת.
          <span className="mt-1 block text-xs opacity-90" dir="ltr" lang="en">
            Test / simulated path: no Stripe PaymentElement — confirm PAYMENT_PROVIDER before real users.
          </span>
        </div>
      )}
      <div className="text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900">התשלום בוצע בהצלחה!</h2>
        <p className="text-sm text-gray-500 mt-1">תקבלו אישור במייל בקרוב.</p>
      </div>
      {/* VAT receipt */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm space-y-1.5">
        <div className="flex justify-between text-gray-600">
          <span>מחיר לפני מע&quot;מ</span>
          <span dir="ltr">{fmt(sub, currency)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>מע&quot;מ {vatPct}%</span>
          <span dir="ltr">{fmt(tax, currency)}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-emerald-200 pt-1.5">
          <span>שולם</span>
          <span dir="ltr">{fmt(amount, currency)}</span>
        </div>
      </div>
      <EscrowBadge />
      <p className="text-sm text-gray-500 text-center">💡 עוד שכנים = הנחה גדולה יותר לכולם!</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
        <Link href="/orders" className="btn-primary">
          להזמנות שלי
        </Link>
        <ShareButton offerId={offerId} />
        {offerId && (
          <Link href={`/offers/${offerId}`} className="btn-secondary">
            חזרה להצעה
          </Link>
        )}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center space-y-4 py-8">
      <AlertCircle className="h-12 w-12 text-red-400 mx-auto" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-gray-900">שגיאה בעיבוד התשלום</h2>
      <p className="text-sm text-gray-600 max-w-sm mx-auto">{message}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onRetry && (
          <button onClick={onRetry} className="btn-primary">
            נסה שוב
          </button>
        )}
        <Link href="/payments" className="btn-secondary">
          לתשלומים שלי
        </Link>
      </div>
    </div>
  );
}

// ---- Main checkout content (uses searchParams → must be wrapped in Suspense) ----

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offerId");

  const [phase, setPhase] = useState<"loading" | "stripe" | "success" | "error">("loading");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [simulatedPayment, setSimulatedPayment] = useState(false);

  const initiatePayment = useCallback(async () => {
    if (!offerId) {
      setErrorMessage("מזהה הצעה חסר. חזרו לדף ההצעה ונסו שוב.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    try {
      const result = await apiClient.initiatePayment(offerId) as unknown as PaymentResult;
      setPayment(result);

      if (result.status === "succeeded" || result.status === "paid") {
        // Mock (or non-Stripe) path: no client_secret — show non-production notice
        setSimulatedPayment(!result.client_secret);
        setPhase("success");
      } else if (result.client_secret) {
        setSimulatedPayment(false);
        setPhase("stripe");
      } else {
        setSimulatedPayment(true);
        setPhase("success");
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
      if (status === 400 && msg.toLowerCase().includes("already")) {
        setErrorMessage("כבר ביצעת תשלום עבור הצעה זו. ניתן לצפות בה בהיסטוריית התשלומים.");
      } else if (status === 404) {
        setErrorMessage("ההצעה לא נמצאה. ייתכן שהיא הסתיימה.");
      } else if (status === 401) {
        router.push("/login");
        return;
      } else {
        setErrorMessage(msg || "לא ניתן לעבד את התשלום. נסו שוב.");
      }
      setPhase("error");
    }
  }, [offerId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initiatePayment();
  }, [initiatePayment]);

  if (!offerId) {
    return (
      <ErrorState
        message="לא צוין מזהה הצעה. חזרו לדף ההצעות ובחרו הצעה."
      />
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" aria-hidden="true" />
        <p className="text-gray-600 text-sm">מכין תשלום מאובטח...</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        message={errorMessage || "אירעה שגיאה בלתי צפויה."}
        onRetry={initiatePayment}
      />
    );
  }

  if (phase === "success" && payment) {
    return (
      <SuccessState
        subtotal={payment.subtotal}
        taxAmount={payment.tax_amount}
        taxRate={payment.tax_rate}
        amount={payment.amount}
        currency={payment.currency}
        offerId={payment.offer_id || offerId}
        simulatedPayment={simulatedPayment}
      />
    );
  }

  if (phase === "stripe" && payment?.client_secret) {
    return (
      <div className="space-y-4">
        <div className="text-center pb-2">
          <h2 className="text-lg font-semibold text-gray-900">השלמת תשלום</h2>
        </div>
        {/* VAT order summary */}
        <OrderSummary
          subtotal={payment.subtotal ?? Math.round(payment.amount / 1.18 * 100) / 100}
          taxRate={payment.tax_rate ?? 0.18}
          taxAmount={payment.tax_amount ?? Math.round(payment.amount / 1.18 * 0.18 * 100) / 100}
          total={payment.amount}
          currency={payment.currency || "ILS"}
        />
        <EscrowBadge />
        {/* Credit card method indicator */}
        <CreditCardBadge />
        <StripeCheckoutForm
          clientSecret={payment.client_secret}
          onSuccess={() => setPhase("success")}
          onError={(msg) => {
            setErrorMessage(msg);
            setPhase("error");
          }}
        />
      </div>
    );
  }

  return null;
}

// ---- Page ----

export default function CheckoutPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-8" dir="rtl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6" aria-label="ניווט">
        <Link href="/offers" className="hover:text-gray-700">הצעות</Link>
        <ArrowRight className="h-3.5 w-3.5 rtl-flip" aria-hidden="true" />
        <span className="text-gray-900 font-medium" aria-current="page">תשלום</span>
      </nav>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden="true" />
            </div>
          }
        >
          <CheckoutContent />
        </Suspense>
      </div>

      {/* Security footer */}
      <div className="mt-4 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <span>
          כאשר מופעל תשלום בכרטיס (Stripe), פרטי הכרטיס מטופלים ע&quot;י Stripe ואינם נשמרים בשרתי Groupio.
        </span>
      </div>
    </div>
  );
}
