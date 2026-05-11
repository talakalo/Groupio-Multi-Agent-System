import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'שאלות ותשובות',
  description: 'תשובות לשאלות הנפוצות ביותר על פלטפורמת Groupio',
};

const FAQ_ITEMS = [
  {
    q: 'מה זה Groupio?',
    a: 'Groupio היא פלטפורמה לקנייה קבוצתית חכמה לדיירי בניינים. דיירים בבניין מאחדים כוח ומזמינים שירותי קבלנים (מיזוג, שיפוץ, חשמל, אינסטלציה ועוד) במחיר מוזל — ככל שיותר דיירים מצטרפים להצעה, כך המחיר יורד.',
  },
  {
    q: 'איך מצטרפים להצעה?',
    a: 'נרשמים לפלטפורמה, בוחרים את הבניין שלכם, ומצטרפים להצעה הרלוונטית בלחיצה אחת. התשלום מתבצע רק לאחר שמספר הדיירים המינימלי להצעה הושג.',
  },
  {
    q: 'האם כספי בטוחים?',
    a: 'כן. כספי הדיירים מוחזקים בנאמנות (Escrow) ומועברים לקבלן רק לאחר אישור ביצוע העבודה. עיבוד התשלומים מתבצע דרך Stripe — תשתית אבטחה בסטנדרטים הגבוהים ביותר (PCI DSS Level 1).',
  },
  {
    q: 'מה קורה אם ההצעה לא מגיעה למינימום משתתפים?',
    a: 'ההצעה מבוטלת ולא מחויבים. אם ביצעתם הרשמה מוקדמת ושילמתם, הסכום מוחזר במלואו תוך 5–7 ימי עסקים.',
  },
  {
    q: 'כיצד נבחרים הקבלנים?',
    a: 'כל קבלן עובר תהליך אימות: בדיקת רישיון קבלן, ביטוח אחריות מקצועית, ניקוד אמינות בהתבסס על עבודות קודמות ודירוגי דיירים. קבלנים שאינם עומדים בסף האמון אינם מופיעים בפלטפורמה.',
  },
  {
    q: 'מה תנאי ביטול?',
    a: 'דיירים יכולים לבטל השתתפות עד 48 שעות לפני מועד סגירת ההצעה ללא עלות. לאחר מכן, בהתאם לתנאי ההצעה הספציפית.',
  },
  {
    q: 'אני קבלן — איך מצטרפים?',
    a: (<span>נרשמים דרך עמוד{' '}
      <Link href="/contractor/register" className="text-blue-600 hover:underline">הצטרפות קבלנים</Link>
      {' '}ועוברים תהליך אימות. לשאלות:{' '}
      <a href="mailto:contractors@groupio.co.il" className="text-blue-600 hover:underline">contractors@groupio.co.il</a>.
    </span>),
  },
  {
    q: 'איך מנהל הבניין מוסיף דיירים?',
    a: 'מנהל הבניין מקבל קישור הזמנה ייחודי לבניין ויכול לשלוח אותו לדיירים. הדיירים נרשמים ומקושרים אוטומטית לבניין.',
  },
  {
    q: 'באילו אזורים Groupio פעילה?',
    a: 'כרגע פעילים בגוש דן, חיפה והקריות, ירושלים ובאר שבע. הרחבה לערים נוספות מתוכננת ב-2026.',
  },
];

type FaqPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function FaqPage(props: FaqPageProps) {
  if (props.params) await props.params;
  if (props.searchParams) await props.searchParams;
  return (
    <main className="max-w-3xl mx-auto px-4 py-12" dir="rtl">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-primary-600 transition-colors">
          דף הבית
        </Link>
        {' › '}
        <span>שאלות ותשובות</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-2">שאלות ותשובות</h1>
      <p className="text-gray-500 mb-10">לא מצאתם תשובה?{' '}
        <Link href="/contact" className="text-blue-600 hover:underline">צרו קשר</Link>.
      </p>

      <div className="space-y-6">
        {FAQ_ITEMS.map((item, i) => (
          <section key={i} className="border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{item.q}</h2>
            <p className="text-gray-700 leading-relaxed">{item.a}</p>
          </section>
        ))}
      </div>

      <div className="pt-8 border-t border-gray-200 text-sm text-gray-500 text-center mt-10">
        <Link href="/contact" className="text-blue-600 hover:underline mx-2">
          צור קשר
        </Link>
        |
        <Link href="/terms" className="text-blue-600 hover:underline mx-2">
          תנאי שימוש
        </Link>
        |
        <Link href="/" className="text-blue-600 hover:underline mx-2">
          חזרה לדף הבית
        </Link>
      </div>
    </main>
  );
}
