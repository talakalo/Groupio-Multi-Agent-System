import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'תנאי שימוש',
  description: 'תנאי השימוש של פלטפורמת Groupio לרכישות קבוצתיות',
};

const LAST_UPDATED = '27 בפברואר 2026';

type TermsPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function TermsPage(props: TermsPageProps) {
  if (props.params) await props.params;
  if (props.searchParams) await props.searchParams;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">

      {/* Hero */}
      <div className="text-center mb-12">
        <div
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5 text-xs font-semibold"
          style={{
            background: 'rgba(26,154,118,0.07)',
            border: '1px solid rgba(26,154,118,0.14)',
            color: '#0d6b4f',
          }}
        >
          <FileText className="h-3 w-3" />
          <span>תנאי שימוש</span>
        </div>
        <h1
          className="text-3xl font-extrabold mb-3"
          style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.2' }}
        >
          תנאי שימוש — Groupio
        </h1>
        <p className="text-sm" style={{ color: '#7a9a8a' }}>
          עדכון אחרון: {LAST_UPDATED}
        </p>
      </div>

      {/* Sections */}
      <div
        className="rounded-[16px] overflow-hidden"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(10,51,41,0.08)',
          boxShadow: '0 1px 3px rgba(10,51,41,0.04), 0 4px 16px rgba(10,51,41,0.04)',
        }}
      >

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>1. הסכמה לתנאים</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            השימוש בפלטפורמת Groupio מהווה הסכמה מלאה לתנאי שימוש אלו. אם אינך מסכים לתנאים, אנא הפסק את השימוש בשירות לאלתר.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>2. תיאור השירות</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#5a7a6a' }}>
            Groupio היא פלטפורמה המאפשרת לדיירי בניינים להתאחד ולקבל הצעות קבוצתיות משתלמות מקבלנים מאומתים לשירותי תחזוקה ושיפוץ.
          </p>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {[
              'גיוס משתתפים לרכישות קבוצתיות',
              'חיבור בין דיירים לקבלנים מאומתים',
              'ניהול תשלומים ואחסון כספים בנאמנות (escrow)',
              'מעקב ותיאום פרויקטים',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>3. הרשמה וחשבון משתמש</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            עליך להיות בן 18 ומעלה להרשמה לשירות. אחראי לשמירת סודיות פרטי הכניסה לחשבונך. כל פעילות המתבצעת תחת חשבונך הינה באחריותך הבלעדית.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>4. תנאי הצעות קבוצתיות</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#5a7a6a' }}>
            הצעות קבוצתיות מחייבות מספר מינימלי של משתתפים. Groupio אינה ערבה לביצוע ההצעה אם לא יגיע המינימום הנדרש. במקרה כזה יוחזרו כל התשלומים ששולמו.
          </p>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {[
              'ביטול הצעה על ידי המארגן: החזר מלא לכל המשתתפים',
              'אי-עמידה במינימום משתתפים: החזר מלא תוך 5 ימי עסקים',
              'ביטול על ידי משתתף לאחר השלמת ההצעה: בהתאם למדיניות הקבלן',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>4א. מדיניות ביטול והחזרים</h2>

          <h3 className="text-xs font-semibold mb-1.5" style={{ color: '#3d5a50' }}>ביטול לפני התאמת קבלן</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#5a7a6a' }}>
            דייר רשאי לעזוב הצעה פעילה בכל עת לפני שלב ההתאמה, ללא חיוב. יציאה מהצעה מתבצעת דרך לחצן &quot;עזיבת הצעה&quot; בפרופיל ההצעה.
          </p>

          <h3 className="text-xs font-semibold mb-1.5" style={{ color: '#3d5a50' }}>ביטול לאחר התאמת קבלן</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#5a7a6a' }}>
            לאחר שנמצא קבלן מתאים, ביטול ההשתתפות כפוף לאישור. יש ליצור קשר עם תמיכת לקוחות בכתובת{' '}
            <a href="mailto:support@groupio.co.il" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
              support@groupio.co.il
            </a>
            . Groupio תבחן כל בקשת ביטול בנפרד.
          </p>

          <h3 className="text-xs font-semibold mb-1.5" style={{ color: '#3d5a50' }}>ביטול לאחר תשלום</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#5a7a6a' }}>
            החזרים לאחר תשלום יינתנו בהתאם לשלב ביצוע העבודה ולהסכם עם הקבלן. עמלת הפלטפורמה (עד 3%) אינה מוחזרת לאחר ביצוע תשלום. החזרים יבוצעו תוך 5–14 ימי עסקים לאמצעי התשלום המקורי.
          </p>

          <h3 className="text-xs font-semibold mb-1.5" style={{ color: '#3d5a50' }}>ביטול על ידי מנהל המערכת</h3>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            Groupio רשאית לבטל הצעה בכל עת (למשל: אי-עמידה במינימום, בעיה עם הקבלן). כל המשתתפים יקבלו הודעה בדוא&quot;ל, והתשלומים ששולמו יוחזרו במלואם.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>5. אחריות קבלנים</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            Groupio מאמתת את רישיונות הקבלנים ועורכת בדיקות רקע, אך אינה אחראית לאיכות העבודה או לנזקים שייגרמו על ידי קבלנים. כל מחלוקת בין דייר לקבלן תיושב ישירות בין הצדדים, תוך סיוע Groupio כמתווך.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>5א. הגבלת אחריות קבלן</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            Groupio פועלת כמתווך בלבד בין דיירים לקבלנים עצמאיים. Groupio אינה מעסיקה קבלנים ואינה נושאת באחריות ישירה לביצוע, איכות, בטיחות, או נזקים הנובעים מעבודות הקבלן. כל הסכם עבודה הינו בין הדייר לקבלן בלבד.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>6. תשלומים ועמלות</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            Groupio גובה עמלת פלטפורמה של עד 3% מסכום כל עסקה. כספי המשתתפים מוחזקים בנאמנות ומועברים לקבלן רק לאחר אישור השלמת העבודה על ידי נציג הדיירים.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>7. פרטיות ואבטחת מידע</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            השימוש בנתונים האישיים שלך מפורט ב
            <Link href="/privacy" className="font-semibold hover:underline mx-1" style={{ color: '#1a9a76' }}>
              מדיניות הפרטיות
            </Link>
            שלנו. Groupio פועלת בהתאם לחוק הגנת הפרטיות הישראלי ולתקנות GDPR האירופאיות.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>8. הגבלת אחריות</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            הפלטפורמה מסופקת &quot;כמות שהיא&quot; (AS IS). Groupio לא תהיה אחראית לנזקים עקיפים, אקראיים או תוצאתיים העולים על סכום התשלומים ששילמת ב-12 החודשים האחרונים.
          </p>
        </section>

        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>9. שינויים בתנאים</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            Groupio רשאית לעדכן תנאים אלו בכל עת. שינויים מהותיים יודיעו בדוא&quot;ל לפחות 14 ימים מראש. המשך השימוש לאחר מתן ההודעה מהווה הסכמה לתנאים המעודכנים.
          </p>
        </section>

        <section className="px-6 py-6">
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>10. יצירת קשר</h2>
          <p className="text-sm" style={{ color: '#5a7a6a' }}>
            לשאלות בנוגע לתנאי שימוש אלה:{' '}
            <a href="mailto:legal@groupio.co.il" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
              legal@groupio.co.il
            </a>
          </p>
        </section>
      </div>

      {/* Bottom links */}
      <div className="pt-8 text-center">
        <Link href="/privacy" className="text-sm font-semibold hover:underline mx-3" style={{ color: '#1a9a76' }}>
          מדיניות פרטיות
        </Link>
        <span style={{ color: 'rgba(10,51,41,0.15)' }}>|</span>
        <Link href="/contact" className="text-sm font-semibold hover:underline mx-3" style={{ color: '#1a9a76' }}>
          צור קשר
        </Link>
      </div>
    </div>
  );
}
