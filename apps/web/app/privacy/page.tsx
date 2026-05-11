import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: 'מדיניות הפרטיות של פלטפורמת Groupio',
};

const LAST_UPDATED = '27 בפברואר 2026';

type PrivacyPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function PrivacyPage(props: PrivacyPageProps) {
  if (props.params) await props.params;
  if (props.searchParams) await props.searchParams;
  return (
    <main className="max-w-3xl mx-auto px-4 py-12" dir="rtl">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          דף הבית
        </Link>
        {' › '}
        <span>מדיניות פרטיות</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">מדיניות פרטיות — Groupio</h1>
      <p className="text-sm text-gray-500 mb-10">עדכון אחרון: {LAST_UPDATED}</p>

      <div className="prose prose-blue max-w-none space-y-8 text-gray-700 leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. מידע שאנו אוספים</h2>
          <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">מידע שמסרת לנו ישירות:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>שם מלא וכתובת דוא&quot;ל</li>
            <li>מספר טלפון</li>
            <li>כתובת מגורים ומספר דירה</li>
            <li>פרטי תשלום (מאוחסנים בצורה מוצפנת)</li>
          </ul>
          <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">מידע שנאסף אוטומטית:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>כתובת IP ומידע על הדפדפן/מכשיר</li>
            <li>דפי שצפית בהם ופעולות שביצעת בפלטפורמה</li>
            <li>זמני כניסה ויציאה</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. כיצד אנו משתמשים במידע</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>הפעלת הפלטפורמה וחיבור דיירים לקבלנים</li>
            <li>עיבוד תשלומים ואחסון כספים בנאמנות</li>
            <li>שליחת עדכונים על הצעות שהצטרפת אליהן</li>
            <li>שיפור השירות באמצעות ניתוח אנונימי</li>
            <li>עמידה בדרישות חוקיות ורגולטוריות</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. שיתוף מידע עם צדדים שלישיים</h2>
          <p>
            Groupio <strong>אינה מוכרת</strong> את פרטיך האישיים. אנו משתפים
            מידע מינימלי עם:
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1">
            <li>
              <strong>קבלנים</strong> — שם, טלפון וכתובת (לצרכי ביצוע העבודה בלבד)
            </li>
            <li>
              <strong>ספקי תשלום</strong> — Stripe (עיבוד כרטיסי אשראי)
            </li>
            <li>
              <strong>ספקי תשתית</strong> — שרתי אחסון ענן (ישראל/אירופה)
            </li>
            <li>
              <strong>רשויות החוק</strong> — רק כנדרש על פי דין
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. אבטחת מידע</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>כל התקשורת מוצפנת ב-TLS 1.3</li>
            <li>סיסמאות מאוחסנות עם bcrypt (לא בטקסט חשוף)</li>
            <li>אסימוני אימות (JWT) עם תוקף קצר ומנגנון חידוש מאובטח</li>
            <li>פרטי כרטיסי אשראי אינם נשמרים בשרתינו (מאוחסנים ב-Stripe)</li>
            <li>גיבויי מסד נתונים יומיים עם הצפנה</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. זכויותיך (GDPR וחוק הגנת הפרטיות הישראלי)</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>זכות עיון</strong> — לקבל עותק של כל המידע שיש לנו עליך
            </li>
            <li>
              <strong>זכות תיקון</strong> — לתקן מידע שגוי
            </li>
            <li>
              <strong>זכות מחיקה</strong> — לדרוש מחיקת חשבונך ומידע אישי
              (זמין דרך הגדרות החשבון — <code>DELETE /api/v1/auth/me</code>)
            </li>
            <li>
              <strong>זכות להתנגד</strong> — לסרב לעיבוד מידע לצרכי שיווק
            </li>
            <li>
              <strong>ניידות נתונים</strong> — לקבל את נתוניך בפורמט מקריא למחשב
            </li>
          </ul>
          <p className="mt-3">
            לממש את זכויותיך:{' '}
            <a href="mailto:privacy@groupio.co.il" className="text-blue-600 hover:underline">
              privacy@groupio.co.il
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. שמירת מידע</h2>
          <p>
            נתוני חשבון נשמרים כל עוד החשבון פעיל ועד 3 שנים לאחר סגירתו
            (לצרכי ביקורת פיננסית). הודעות צ&apos;אט נארכבות לאחר 90 ימים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. עוגיות (Cookies)</h2>
          <p>
            אנו משתמשים בעוגיות חיוניות בלבד לצרכי אימות (HTTP-only, Secure).
            אין שימוש בעוגיות לצרכי פרסום ממוקד.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. שינויים במדיניות</h2>
          <p>
            שינויים מהותיים יודיעו בדוא&quot;ל 14 ימים מראש. המשך השימוש לאחר
            מועד ההודעה מהווה הסכמה למדיניות המעודכנת.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. יצירת קשר</h2>
          <p>
            ממונה הגנת מידע:{' '}
            <a href="mailto:privacy@groupio.co.il" className="text-blue-600 hover:underline">
              privacy@groupio.co.il
            </a>
          </p>
        </section>

        <div className="pt-4 border-t border-gray-200 text-sm text-gray-500 text-center">
          <Link href="/terms" className="text-blue-600 hover:underline mx-2">
            תנאי שימוש
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
