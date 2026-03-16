"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import React from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CheckoutError({ error, reset }: ErrorPageProps) {
  React.useEffect(() => {
    console.error("Checkout error:", error);
    try {
      Sentry.captureException(error);
    } catch {
      // Guard against Sentry initialization errors
    }
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center py-24 px-4 text-center"
      dir="rtl"
    >
      <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">
        שגיאה בטעינת דף התשלום
      </h2>
      <p className="text-gray-500 mb-6">
        לא ניתן לטעון את דף התשלום. נסה שוב או חזור להצעה.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          נסה שוב
        </button>
        <Link
          href="/offers"
          className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
        >
          חזרה להצעות
        </Link>
      </div>
    </div>
  );
}
