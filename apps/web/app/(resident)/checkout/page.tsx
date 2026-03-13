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

import { Loader2, CheckCircle2, AlertCircle, ShieldCheck, ArrowRight, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { apiClient, ApiError } from "@/lib/api/client";

// ---- Types ----

interface PaymentResult {
  id: string;
  status: string;
  amount: number;
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

function SuccessState({ amount, currency, offerId }: { amount: number; currency: string; offerId?: string }) {
  const formatted = new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: currency || "ILS",
    minimumFractionDigits: 0,
  }).format(amount);

  return (
    <div className="text-center space-y-4 py-8">
      <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" aria-hidden="true" />
      <h2 className="text-xl font-bold text-gray-900">התשלום בוצע בהצלחה!</h2>
      <p className="text-gray-600">
        <span className="font-semibold">{formatted}</span> נשמרו בנאמנות. תקבלו אישור במייל בקרוב.
      </p>
      <EscrowBadge />
      <p className="text-sm text-gray-500">
        💡 עוד שכנים = הנחה גדולה יותר לכולם!
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
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
        // Mock mode: payment already succeeded
        setPhase("success");
      } else if (result.client_secret) {
        // Stripe mode: need card capture
        setPhase("stripe");
      } else {
        // Unexpected state — treat as success (backend processed it)
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
    initiatePayment();
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
        amount={payment.amount}
        currency={payment.currency}
        offerId={payment.offer_id || offerId}
      />
    );
  }

  if (phase === "stripe" && payment?.client_secret) {
    return (
      <div className="space-y-4">
        <div className="text-center pb-2">
          <h2 className="text-lg font-semibold text-gray-900">השלמת תשלום</h2>
          <p className="text-sm text-gray-500 mt-1">
            {new Intl.NumberFormat("he-IL", {
              style: "currency",
              currency: payment.currency || "ILS",
              minimumFractionDigits: 0,
            }).format(payment.amount)}
          </p>
        </div>
        <EscrowBadge />
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
        <span>מאובטח עם Stripe — פרטי כרטיס לא נשמרים בשרתי Groupio</span>
      </div>
    </div>
  );
}
