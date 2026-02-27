import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'תנאי שימוש | Groupio',
  description: 'תנאי השימוש של פלטפורמת Groupio לרכישות קבוצתיות',
};

const LAST_UPDATED = '27 בפברואר 2026';

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12" dir="rtl">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          דף הבית
        </Link>
        {' › '}
        <span>תנאי שימוש</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">תנאי שימוש — Groupio</h1>
      <p className="text-sm text-gray-500 mb-10">עדכון אחרון: {LAST_UPDATED}</p>

      <div className="prose prose-blue max-w-none space-y-8 text-gray-700 leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. הסכמה לתנאים</h2>
          <p>
            השימוש בפלטפורמת Groupio מהווה הסכמה מלאה לתנאי שימוש אלו.
            אם אינך מסכים לתנאים, אנא הפסק את השימוש בשירות לאלתר.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. תיאור השירות</h2>
          <p>
            Groupio היא פלטפורמה המאפשרת לדיירי בניינים להתאחד ולקבל הצעות
            קבוצתיות משתלמות מקבלנים מאומתים לשירותי תחזוקה ושיפוץ.
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1">
            <li>גיוס משתתפים לרכישות קבוצתיות</li>
            <li>חיבור בין דיירים לקבלנים מאומתים</li>
            <li>ניהול תשלומים ואחסון כספים בנאמנות (escrow)</li>
            <li>מעקב ותיאום פרויקטים</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. הרשמה וחשבון משתמש</h2>
          <p>
            עליך להיות בן 18 ומעלה להרשמה לשירות. אחראי לשמירת סודיות
            פרטי הכניסה לחשבונך. כל פעילות המתבצעת תחת חשבונך הינה באחריותך הבלעדית.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. תנאי הצעות קבוצתיות</h2>
          <p>
            הצעות קבוצתיות מחייבות מספר מינימלי של משתתפים. Groupio אינה
            ערבה לביצוע ההצעה אם לא יגיע המינימום הנדרש. במקרה כזה יוחזרו
            כל התשלומים ששולמו.
          </p>
          <ul className="list-disc list-inside mt-3 space-y-1">
            <li>ביטול הצעה על ידי המארגן: החזר מלא לכל המשתתפים</li>
            <li>אי-עמידה במינימום משתתפים: החזר מלא תוך 5 ימי עסקים</li>
            <li>ביטול על ידי משתתף לאחר השלמת ההצעה: בהתאם למדיניות הקבלן</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. אחריות קבלנים</h2>
          <p>
            Groupio מאמתת את רישיונות הקבלנים ועורכת בדיקות רקע, אך אינה
            אחראית לאיכות העבודה או לנזקים שייגרמו על ידי קבלנים. כל מחלוקת
            בין דייר לקבלן תיושב ישירות בין הצדדים, תוך סיוע Groupio כמתווך.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. תשלומים ועמלות</h2>
          <p>
            Groupio גובה עמלת פלטפורמה של עד 3% מסכום כל עסקה. כספי
            המשתתפים מוחזקים בנאמנות ומועברים לקבלן רק לאחר אישור השלמת
            העבודה על ידי נציג הדיירים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. פרטיות ואבטחת מידע</h2>
          <p>
            השימוש בנתונים האישיים שלך מפורט ב
            <Link href="/privacy" className="text-blue-600 hover:underline mx-1">
              מדיניות הפרטיות
            </Link>
            שלנו. Groupio פועלת בהתאם לחוק הגנת הפרטיות הישראלי ולתקנות
            GDPR האירופאיות.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. הגבלת אחריות</h2>
          <p>
            הפלטפורמה מסופקת "כמות שהיא" (AS IS). Groupio לא תהיה אחראית
            לנזקים עקיפים, אקראיים או תוצאתיים העולים על סכום התשלומים
            ששילמת ב-12 החודשים האחרונים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. שינויים בתנאים</h2>
          <p>
            Groupio רשאית לעדכן תנאים אלו בכל עת. שינויים מהותיים יודיעו
            בדוא"ל לפחות 14 ימים מראש. המשך השימוש לאחר מתן ההודעה מהווה
            הסכמה לתנאים המעודכנים.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. יצירת קשר</h2>
          <p>
            לשאלות בנוגע לתנאי שימוש אלה:{' '}
            <a href="mailto:legal@groupio.co.il" className="text-blue-600 hover:underline">
              legal@groupio.co.il
            </a>
          </p>
          <p className="mt-2 text-sm text-gray-500">
            ⚠️ מסמך זה הינו טיוטה המיועדת לבדיקה פנימית בלבד ואינה מייצגת
            ייעוץ משפטי. יש להביאה לסקירת עורך דין לפני פרסום לציבור.
          </p>
        </section>
      </div>
    </main>
  );
}
