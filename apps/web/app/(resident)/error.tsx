"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ResidentError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Resident section error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4" dir="rtl">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          שגיאה בטעינת הדף
        </h2>
        <p className="text-gray-600 mb-6">
          אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mb-6 text-right bg-gray-50 rounded-lg p-3">
            <summary className="cursor-pointer text-sm text-gray-500 font-medium">
              פרטי שגיאה
            </summary>
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs text-red-600 overflow-auto max-h-32 text-left" dir="ltr">
              {error.message}
            </pre>
          </details>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            נסה שוב
          </button>
          <a
            href="/dashboard"
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Home className="h-4 w-4" />
            דף הבית
          </a>
        </div>
      </div>
    </div>
  );
}
