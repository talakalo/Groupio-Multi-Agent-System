import React from "react";
import Link from "next/link";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 p-12 flex-col justify-between">
        <div>
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <span className="text-blue-600 font-bold text-xl">G</span>
            </div>
            <span className="text-white text-2xl font-bold">Groupio</span>
          </Link>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-white leading-tight">
            חסכו עד 40% בשירותים לבניין שלכם
          </h1>
          <p className="text-xl text-blue-100">
            הצטרפו לאלפי דיירים שכבר נהנים מהצעות קבוצתיות משתלמות
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-3xl font-bold text-white">5,000+</div>
              <div className="text-blue-200 text-sm">דיירים פעילים</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">₪2M+</div>
              <div className="text-blue-200 text-sm">נחסכו בסך הכל</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">200+</div>
              <div className="text-blue-200 text-sm">קבלנים מאומתים</div>
            </div>
          </div>
        </div>

        {/* Testimonial */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
          <p className="text-white text-lg mb-4">
            &ldquo;חסכנו 35% על התקנת מזגנים לכל הבניין. התהליך היה פשוט ומהיר!&rdquo;
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-400 rounded-full flex items-center justify-center">
              <span className="text-white font-medium">יכ</span>
            </div>
            <div>
              <div className="text-white font-medium">יוסי כהן</div>
              <div className="text-blue-200 text-sm">ועד בית, תל אביב</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-900">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <span className="text-gray-900 dark:text-white text-2xl font-bold">Groupio</span>
            </Link>
          </div>

          {children}

          {/* Footer Links */}
          <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>
              בהמשך התחברות, אתם מסכימים ל
              <Link href="/terms" className="text-blue-600 hover:underline mx-1">
                תנאי השימוש
              </Link>
              ול
              <Link href="/privacy" className="text-blue-600 hover:underline mx-1">
                מדיניות הפרטיות
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
