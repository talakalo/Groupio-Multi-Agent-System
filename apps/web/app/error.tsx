"use client";

import Link from "next/link";
import React from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  React.useEffect(() => {
    // Log error to error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4" dir="rtl">
      <div className="max-w-lg w-full text-center">
        {/* Error Icon */}
        <div className="mx-auto w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-8">
          <svg
            className="w-12 h-12 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error Message */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          שגיאה בטעינת הדף
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
          אירעה שגיאה בלתי צפויה. נסה לרענן את הדף או לחזור לדף הבית.
        </p>

        {/* Error Details (development only) */}
        {process.env.NODE_ENV === "development" && (
          <details className="mb-8 text-right bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
              פרטי השגיאה (מצב פיתוח)
            </summary>
            <pre className="mt-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs text-red-600 dark:text-red-400 overflow-auto max-h-40 text-left" dir="ltr">
              {error.message}
              {error.digest && `\n\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-primary-500 text-white font-medium rounded-lg hover:bg-primary-600 transition-colors focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-2"
          >
            נסה שוב
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors inline-flex items-center justify-center"
          >
            חזרה לדף הבית
          </Link>
        </div>

        {/* Support Link - /chat serves as AI assistant and support */}
        <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
          הבעיה נמשכת?{" "}
          <Link href="/chat" className="text-primary-600 hover:underline">
            פנה לעוזר AI
          </Link>
        </p>
      </div>
    </div>
  );
}
