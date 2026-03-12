"use client";

import Link from "next/link";

/**
 * Placeholder for forgot-password flow. Not yet implemented.
 * Link from login page to satisfy a11y (no href="#").
 */
export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">איפוס סיסמה</h1>
        <p className="text-gray-600 mb-6">תכונה זו תהיה זמינה בקרוב. אנא פנו לתמיכה.</p>
        <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          חזרה להתחברות
        </Link>
      </div>
    </div>
  );
}
