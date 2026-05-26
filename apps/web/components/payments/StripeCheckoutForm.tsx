"use client";

/**
 * StripeCheckoutForm — mounts Stripe Elements and handles payment confirmation.
 *
 * This component is dynamically imported (SSR disabled) from the checkout page.
 * It is only rendered when `client_secret` is present (i.e., PAYMENT_PROVIDER=stripe).
 *
 * If NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set, renders a clear configuration error
 * rather than crashing.
 */

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

interface StripeFormProps {
  clientSecret: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

// Initialise Stripe once — `loadStripe` returns null if the key is empty.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

// ---- Inner form (needs to be inside <Elements> to use useStripe / useElements) ----

function InnerForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const t = useTranslations('checkout.stripe');
  const tCheckout = useTranslations('checkout');
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setFieldError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setIsSubmitting(false);
      if (error.type === "card_error" || error.type === "validation_error") {
        setFieldError(error.message || t('cardError'));
      } else {
        onError(error.message || t('paymentFailed'));
      }
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {fieldError && (
        <div role="alert" className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{fieldError}</span>
        </div>
      )}

      {/* Stripe PaymentElement renders securely inside a Stripe-hosted iframe */}
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />

      <button
        type="submit"
        disabled={!stripe || !elements || isSubmitting}
        className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>{t('processing')}</span>
          </>
        ) : (
          t('confirm')
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        {tCheckout('securityFooter')}
      </p>
    </form>
  );
}

// ---- Exported wrapper (handles Stripe not configured) ----

export default function StripeCheckoutForm({ clientSecret, onSuccess, onError }: StripeFormProps) {
  const tStripe = useTranslations('checkout.stripe');
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  // useMemo ensures single initialization (module-level singleton in getStripePromise)
  const stripePromise = useMemo(() => getStripePromise(), []);

  if (!stripeKey) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
        <p className="font-medium">{tStripe('notConfiguredTitle')}</p>
        <p>{tStripe('notConfiguredDesc')}</p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#1a9a76",
            fontFamily: "inherit",
            borderRadius: "8px",
          },
        },
        locale: "he",
      }}
    >
      <InnerForm onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
