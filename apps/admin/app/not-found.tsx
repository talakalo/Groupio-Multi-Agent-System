import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        {/* 404 */}
        <span className="text-8xl font-bold text-gray-200 dark:text-gray-800">
          404
        </span>

        {/* Message */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          The admin page you're looking for doesn't exist or has been moved.
        </p>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Link
            href="/dashboard"
            className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Dashboard
          </Link>
          <Link
            href="/agents"
            className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Agents
          </Link>
          <Link
            href="/analytics"
            className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Analytics
          </Link>
          <Link
            href="/settings"
            className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Settings
          </Link>
        </div>

        {/* Action */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
