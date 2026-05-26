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
import { useTranslations } from "next-intl";
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

function StripeFormLoader() {
  const tLoading = useTranslations("checkout");
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
      <span className="mr-3 text-gray-500 text-sm">{tLoading("loadingStripeForm")}</span>
    </div>
  );
}

const StripeCheckoutForm = dynamic(
  () => import("@/components/payments/StripeCheckoutForm"),
  {
    loading: StripeFormLoader,
    ssr: false,
  }
);

// ---- Sub-components ----

function EscrowBadge() {
  const t = useTranslations("checkout");
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
      <ShieldCheck className="h-4 w-4 text-indigo-500 flex-shrink-0" aria-hidden="true" />
      <span>{t("escrowProtection")}</span>
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
 * Order summary showing subtotal, VAT, and total.
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
  const t = useTranslations("checkout");
  const vatPct = Math.round(taxRate * 100);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <Receipt className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-900">{t("orderSummary")}</span>
      </div>
      <dl className="px-4 py-3 space-y-2 text-sm">
        <div className="flex justify-between text-gray-600">
          <dt>{t("subtotal")}</dt>
          <dd dir="ltr">{fmt(subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between text-gray-600">
          <dt>{t("vat", { percent: vatPct })}</dt>
          <dd dir="ltr">{fmt(taxAmount, currency)}</dd>
        </div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-2 text-base">
          <dt>{t("total")}</dt>
          <dd dir="ltr">{fmt(total, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Badge showing that payment is by credit card via Stripe. */
function CreditCardBadge() {
  const t = useTranslations("checkout");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <CreditCard className="h-5 w-5 text-indigo-600 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-indigo-800">{t("creditCardTitle")}</p>
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
  const t = useTranslations("checkout");
  const [copied, setCopied] = useState(false);
  if (!offerId) return null;

  const handleShare = async () => {
    const url = `${window.location.origin}/offers/${offerId}`;
    const shareData = { title: t("shareOfferTitle"), url };
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
      {copied ? t("shareCopied") : t("shareWithNeighbors")}
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
}: {
  subtotal?: number;
  taxAmount?: number;
  taxRate?: number;
  amount: number;
  currency: string;
  offerId?: string;
}) {
  const t = useTranslations("checkout");
  const vatPct = Math.round((taxRate ?? 0.18) * 100);
  const sub = subtotal ?? Math.round(amount / 1.18 * 100) / 100;
  const tax = taxAmount ?? Math.round(sub * 0.18 * 100) / 100;

  return (
    <div className="space-y-4 py-6">
      <div className="text-center">
        <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-xl font-bold text-gray-900">{t("successTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("successEmailNote")}</p>
      </div>
      {/* VAT receipt */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm space-y-1.5">
        <div className="flex justify-between text-gray-600">
          <span>{t("subtotal")}</span>
          <span dir="ltr">{fmt(sub, currency)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>{t("vat", { percent: vatPct })}</span>
          <span dir="ltr">{fmt(tax, currency)}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 border-t border-emerald-200 pt-1.5">
          <span>{t("paid")}</span>
          <span dir="ltr">{fmt(amount, currency)}</span>
        </div>
      </div>
      <EscrowBadge />
      <p className="text-sm text-gray-500 text-center">{t("moreNeighborsTip")}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
        <Link href="/orders" className="btn-primary">
          {t("myOrders")}
        </Link>
        <ShareButton offerId={offerId} />
        {offerId && (
          <Link href={`/offers/${offerId}`} className="btn-secondary">
            {t("backToOffer")}
          </Link>
        )}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTranslations("checkout");
  return (
    <div className="text-center space-y-4 py-8">
      <AlertCircle className="h-12 w-12 text-red-400 mx-auto" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-gray-900">{t("errorTitle")}</h2>
      <p className="text-sm text-gray-600 max-w-sm mx-auto">{message}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {onRetry && (
          <button onClick={onRetry} className="btn-primary">
            {t("errorRetry")}
          </button>
        )}
        <Link href="/payments" className="btn-secondary">
          {t("errorMyPayments")}
        </Link>
      </div>
    </div>
  );
}

// ---- Main checkout content (uses searchParams → must be wrapped in Suspense) ----

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("checkout");
  const offerId = searchParams.get("offerId");

  const [phase, setPhase] = useState<"loading" | "stripe" | "success" | "error">("loading");
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initiatePayment = useCallback(async () => {
    if (!offerId) {
      setErrorMessage(t("missingOfferId"));
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
      const msg = err instanceof Error ? err.message : t("unknownError");
      if (status === 400 && msg.toLowerCase().includes("already")) {
        setErrorMessage(t("alreadyPaid"));
      } else if (status === 404) {
        setErrorMessage(t("offerNotFound"));
      } else if (status === 401) {
        router.push("/login");
        return;
      } else {
        setErrorMessage(msg || t("cannotProcess"));
      }
      setPhase("error");
    }
  }, [offerId, router, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initiatePayment();
  }, [initiatePayment]);

  if (!offerId) {
    return (
      <ErrorState
        message={t("missingOfferId")}
      />
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" aria-hidden="true" />
        <p className="text-gray-600 text-sm">{t("loadingPayment")}</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <ErrorState
        message={errorMessage || t("unexpectedError")}
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
      />
    );
  }

  if (phase === "stripe" && payment?.client_secret) {
    return (
      <div className="space-y-4">
        <div className="text-center pb-2">
          <h2 className="text-lg font-semibold text-gray-900">{t("completePayment")}</h2>
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
  const t = useTranslations("checkout");
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6" aria-label={t("breadcrumbNav")}>
        <Link href="/offers" className="hover:text-gray-700">{t("breadcrumbOffers")}</Link>
        <ArrowRight className="h-3.5 w-3.5 rtl-flip" aria-hidden="true" />
        <span className="text-gray-900 font-medium" aria-current="page">{t("breadcrumbPayment")}</span>
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
        <span>{t("securityFooter")}</span>
      </div>
    </div>
  );
}
