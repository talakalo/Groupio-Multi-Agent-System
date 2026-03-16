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

import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Share2,
  CreditCard,
  ChevronDown,
  Mail,
  Phone,
  CalendarCheck,
  RefreshCw,
  CreditCard as CreditCardAlt,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { EscrowBadge } from "@/components/features/payments/EscrowBadge";
import { PriceBreakdown } from "@/components/features/payments/PriceBreakdown";
import { TrustBadgeCluster } from "@/components/shared/TrustBadgeCluster";
import { apiClient, ApiError } from "@/lib/api/client";

// ---- Types ----

interface PaymentResult {
  id: string;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;
  currency: string;
  client_secret?: string | null;
  offer_id?: string;
  original_price?: number;
  group_discount?: number;
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

// ---- Helpers ----

function fmt(amount: number, currency = "ILS") {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function buildPriceItems(payment: PaymentResult) {
  const items: { label: string; amount: number; type?: "regular" | "discount" | "subtotal" | "tax" | "total" }[] = [];

  if (payment.original_price && payment.group_discount) {
    items.push({ label: "מחיר מקורי", amount: payment.original_price, type: "regular" });
    items.push({ label: "הנחה קבוצתית", amount: -payment.group_discount, type: "discount" });
    items.push({ label: "סכום ביניים", amount: payment.subtotal, type: "subtotal" });
  } else {
    items.push({ label: "מחיר לפני מע\"מ", amount: payment.subtotal, type: "regular" });
  }

  const vatPct = Math.round((payment.tax_rate ?? 0.18) * 100);
  if (payment.tax_amount > 0) {
    items.push({ label: `מע"מ ${vatPct}%`, amount: payment.tax_amount, type: "tax" });
  }

  items.push({ label: "סה\"כ לתשלום", amount: payment.amount, type: "total" });
  return items;
}

// ---- Sub-components ----

function CreditCardBadge() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <CreditCard className="h-5 w-5 text-indigo-600 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-indigo-800">תשלום בכרטיס אשראי</p>
        <p className="text-xs text-indigo-600">Visa · Mastercard · American Express · Diners</p>
      </div>
      <div className="ms-auto flex gap-1.5 text-gray-400" aria-hidden="true">
        {["VISA", "MC"].map((n) => (
          <span key={n} className="text-[10px] font-bold border border-gray-300 rounded px-1 bg-white">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrustSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);

  return (
    <div className="space-y-4">
      {/* Mobile: accordion toggle */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 lg:hidden"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            למה בטוח לשלם כאן?
          </span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}

      <div className={collapsed && !open ? "hidden lg:block" : ""}>
        <div className="space-y-4">
          <EscrowBadge variant="block" />

          <TrustBadgeCluster
            badges={["verified", "escrow", "licensed"]}
            layout="vertical"
            size="sm"
          />

          <p className="text-xs text-gray-500 text-center leading-relaxed">
            הכסף שלך מאובטח עד להשלמת העבודה
          </p>

          {/* Security footer */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 pt-2 border-t border-gray-100">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>מאובטח עם Stripe — פרטי כרטיס לא נשמרים בשרתי Groupio</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 text-center px-6">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          <ShieldCheck className="absolute inset-0 m-auto h-6 w-6 text-indigo-600" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">מעבד תשלום...</h2>
        <p className="text-sm text-gray-500">התשלום שלך מוגן בנאמנות</p>
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

const nextSteps = [
  {
    icon: Mail,
    title: "אישור במייל",
    description: "תקבלו אישור הזמנה למייל תוך דקות",
  },
  {
    icon: Phone,
    title: "הקבלן ייצור קשר",
    description: "הקבלן יתאם איתכם את פרטי ההגעה",
  },
  {
    icon: CalendarCheck,
    title: "תיאום מועד",
    description: "תקבעו יחד מועד נוח לביצוע העבודה",
  },
] as const;

function SuccessState({
  payment,
  offerId,
}: {
  payment: PaymentResult;
  offerId: string;
}) {
  const items = buildPriceItems(payment);

  return (
    <div className="space-y-6 py-4">
      {/* Checkmark + heading */}
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 animate-[scale-in_0.3s_ease-out]" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">התשלום בוצע בהצלחה!</h2>
        <p className="mt-1 text-sm text-gray-500">
          מספר הזמנה: <span className="font-mono font-semibold text-gray-700">{payment.id}</span>
        </p>
      </div>

      {/* Price summary */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <PriceBreakdown items={items} currency={payment.currency || "ILS"} />
      </div>

      {/* Next steps */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">מה קורה עכשיו?</h3>
        <ol className="space-y-3">
          {nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{step.title}</p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <EscrowBadge variant="block" />

      <p className="text-sm text-gray-500 text-center">💡 עוד שכנים = הנחה גדולה יותר לכולם!</p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
        <Link href="/orders" className="btn-primary flex items-center justify-center gap-2">
          צפו בהזמנות שלי
        </Link>
        <ShareButton offerId={offerId} />
        <Link href={`/offers/${offerId}`} className="btn-secondary">
          חזרה להצעה
        </Link>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  errorType,
}: {
  message: string;
  onRetry?: () => void;
  errorType?: "card_declined" | "network" | "duplicate" | "generic";
}) {
  const suggestion = (() => {
    switch (errorType) {
      case "card_declined":
        return "נסו כרטיס אשראי אחר, או פנו לחברת האשראי שלכם.";
      case "network":
        return "בדקו את חיבור האינטרנט ונסו שוב.";
      case "duplicate":
        return null;
      default:
        return "אם הבעיה חוזרת, נסו אמצעי תשלום אחר.";
    }
  })();

  return (
    <div className="text-center space-y-4 py-8">
      <AlertCircle className="h-12 w-12 text-red-400 mx-auto" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-gray-900">שגיאה בעיבוד התשלום</h2>
      <p className="text-sm text-gray-600 max-w-sm mx-auto">{message}</p>
      {suggestion && (
        <p className="text-xs text-gray-400 max-w-sm mx-auto">{suggestion}</p>
      )}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
        {onRetry && (
          <button onClick={onRetry} className="btn-primary flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            נסו שוב
          </button>
        )}
        {errorType === "card_declined" && (
          <button onClick={onRetry} className="btn-secondary flex items-center justify-center gap-2">
            <CreditCardAlt className="h-4 w-4" aria-hidden="true" />
            נסו כרטיס אחר
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

  const [phase, setPhase] = useState<"loading" | "stripe" | "processing" | "success" | "error">("loading");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"card_declined" | "network" | "duplicate" | "generic">("generic");

  const initiatePayment = useCallback(async () => {
    if (!offerId) {
      setErrorMessage("מזהה הצעה חסר. חזרו לדף ההצעה ונסו שוב.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    setErrorType("generic");
    try {
      const result = await apiClient.initiatePayment(offerId) as unknown as PaymentResult;
      setPayment(result);

      if (result.status === "succeeded" || result.status === "paid") {
        setPhase("success");
      } else if (result.client_secret) {
        setPhase("stripe");
      } else {
        setPhase("success");
      }
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : null;
      const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
      if (status === 400 && msg.toLowerCase().includes("already")) {
        setErrorMessage("כבר ביצעת תשלום עבור הצעה זו. ניתן לצפות בה בהיסטוריית התשלומים.");
        setErrorType("duplicate");
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

  const handleStripeProcessing = useCallback(() => {
    setPhase("processing");
  }, []);

  const handleStripeSuccess = useCallback(() => {
    setPhase("success");
  }, []);

  const handleStripeError = useCallback((msg: string) => {
    setErrorMessage(msg);
    const lower = msg.toLowerCase();
    if (lower.includes("declined") || lower.includes("insufficient") || lower.includes("card")) {
      setErrorType("card_declined");
    } else if (lower.includes("network") || lower.includes("connection")) {
      setErrorType("network");
    } else {
      setErrorType("generic");
    }
    setPhase("error");
  }, []);

  if (!offerId) {
    return (
      <ErrorState message="לא צוין מזהה הצעה. חזרו לדף ההצעות ובחרו הצעה." />
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

  if (phase === "processing") {
    return <ProcessingOverlay />;
  }

  if (phase === "error") {
    return (
      <ErrorState
        message={errorMessage || "אירעה שגיאה בלתי צפויה."}
        onRetry={initiatePayment}
        errorType={errorType}
      />
    );
  }

  if (phase === "success" && payment) {
    return (
      <SuccessState
        payment={payment}
        offerId={payment.offer_id || offerId}
      />
    );
  }

  if (phase === "stripe" && payment?.client_secret) {
    const priceItems = buildPriceItems(payment);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Mobile: trust sidebar (collapsed accordion) */}
        <div className="lg:hidden">
          <TrustSidebar collapsed />
        </div>

        {/* Left column: order review + payment */}
        <div className="space-y-4">
          <div className="text-center pb-2 lg:text-right">
            <h2 className="text-lg font-semibold text-gray-900">השלמת תשלום</h2>
          </div>

          {/* Price breakdown */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <PriceBreakdown items={priceItems} currency={payment.currency || "ILS"} />
          </div>

          <CreditCardBadge />

          <StripeCheckoutForm
            clientSecret={payment.client_secret}
            onSuccess={handleStripeSuccess}
            onError={handleStripeError}
          />
        </div>

        {/* Right column: trust sidebar (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-4">
            <TrustSidebar />
          </div>
        </aside>
      </div>
    );
  }

  return null;
}

// ---- Page ----

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8" dir="rtl">
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
    </div>
  );
}
