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
        setFieldError(error.message || "שגיאה בפרטי הכרטיס. בדקו ונסו שוב.");
      } else {
        onError(error.message || "התשלום נכשל. נסו שוב או השתמשו בכרטיס אחר.");
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
            <span>מעבד תשלום...</span>
          </>
        ) : (
          "אשר תשלום"
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        פרטי הכרטיס מוצפנים ומועברים ישירות ל-Stripe. Groupio לא שומרת מספרי כרטיסים.
      </p>
    </form>
  );
}

// ---- Exported wrapper (handles Stripe not configured) ----

export default function StripeCheckoutForm({ clientSecret, onSuccess, onError }: StripeFormProps) {
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  // useMemo ensures single initialization (module-level singleton in getStripePromise)
  const stripePromise = useMemo(() => getStripePromise(), []);

  if (!stripeKey) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-1">
        <p className="font-medium">תשלום Stripe לא מוגדר</p>
        <p>
          המפתח <code className="bg-amber-100 px-1 rounded">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> לא הוגדר.
          פנו למנהל המערכת להגדרת Stripe.
        </p>
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
            colorPrimary: "#4f46e5", // indigo-600
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
