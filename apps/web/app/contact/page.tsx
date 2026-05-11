import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'צור קשר | Groupio',
  description: 'צרו קשר עם צוות Groupio — נשמח לעזור',
};

type ContactPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function ContactPage(props: ContactPageProps) {
  if (props.params) await props.params;
  if (props.searchParams) await props.searchParams;
  return (
    <main className="max-w-3xl mx-auto px-4 py-12" dir="rtl">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          דף הבית
        </Link>
        {' › '}
        <span>צור קשר</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">צור קשר</h1>
      <p className="text-gray-500 mb-10">צוות Groupio כאן בשבילך — נחזור אליך תוך יום עסקים.</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">

        <section className="bg-blue-50 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">ערוצי יצירת קשר</h2>
          <ul className="space-y-4">
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-0.5">✉</span>
              <div>
                <p className="font-medium text-gray-900">תמיכה כללית</p>
                <a href="mailto:support@groupio.co.il" className="text-blue-600 hover:underline">
                  support@groupio.co.il
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-0.5">✉</span>
              <div>
                <p className="font-medium text-gray-900">שאלות תשלומים וחיובים</p>
                <a href="mailto:billing@groupio.co.il" className="text-blue-600 hover:underline">
                  billing@groupio.co.il
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-0.5">✉</span>
              <div>
                <p className="font-medium text-gray-900">הגנת פרטיות ומחיקת נתונים</p>
                <a href="mailto:privacy@groupio.co.il" className="text-blue-600 hover:underline">
                  privacy@groupio.co.il
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-blue-600 font-bold mt-0.5">✉</span>
              <div>
                <p className="font-medium text-gray-900">קבלנים — הצטרפות לפלטפורמה</p>
                <a href="mailto:contractors@groupio.co.il" className="text-blue-600 hover:underline">
                  contractors@groupio.co.il
                </a>
              </div>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">זמני תגובה</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>פניות תמיכה — עד יום עסקים אחד</li>
            <li>בעיות תשלום דחופות — עד 4 שעות בימי חול</li>
            <li>בקשות GDPR / מחיקת נתונים — עד 30 ימים (כנדרש בחוק)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">שאלות נפוצות</h2>
          <p>
            רוב השאלות מתוקנות בדף{' '}
            <Link href="/faq" className="text-blue-600 hover:underline">
              שאלות ותשובות
            </Link>
            {' '}שלנו.
          </p>
        </section>

        <div className="pt-4 border-t border-gray-200 text-sm text-gray-500 text-center">
          <Link href="/faq" className="text-blue-600 hover:underline mx-2">
            שאלות ותשובות
          </Link>
          |
          <Link href="/privacy" className="text-blue-600 hover:underline mx-2">
            מדיניות פרטיות
          </Link>
          |
          <Link href="/" className="text-blue-600 hover:underline mx-2">
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    </main>
  );
}
