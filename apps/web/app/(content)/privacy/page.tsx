import { Shield } from 'lucide-react';
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
          <Shield className="h-3 w-3" />
          <span>מדיניות פרטיות</span>
        </div>
        <h1
          className="text-3xl font-extrabold mb-3"
          style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.2' }}
        >
          מדיניות פרטיות — Groupio
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

        {/* 1. מידע שאנו אוספים */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>
            1. מידע שאנו אוספים
          </h2>
          <h3 className="text-xs font-semibold mb-2" style={{ color: '#3d5a50' }}>מידע שמסרת לנו ישירות:</h3>
          <ul className="space-y-1.5 mb-4 text-sm" style={{ color: '#5a7a6a' }}>
            {['שם מלא וכתובת דוא"ל', 'מספר טלפון', 'כתובת מגורים ומספר דירה', 'פרטי תשלום (מאוחסנים בצורה מוצפנת)'].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
          <h3 className="text-xs font-semibold mb-2" style={{ color: '#3d5a50' }}>מידע שנאסף אוטומטית:</h3>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {['כתובת IP ומידע על הדפדפן/מכשיר', 'דפי שצפית בהם ופעולות שביצעת בפלטפורמה', 'זמני כניסה ויציאה'].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 2. כיצד אנו משתמשים */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>
            2. כיצד אנו משתמשים במידע
          </h2>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {[
              'הפעלת הפלטפורמה וחיבור דיירים לקבלנים',
              'עיבוד תשלומים ואחסון כספים בנאמנות',
              'שליחת עדכונים על הצעות שהצטרפת אליהן',
              'שיפור השירות באמצעות ניתוח אנונימי',
              'עמידה בדרישות חוקיות ורגולטוריות',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 3. שיתוף מידע */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>
            3. שיתוף מידע עם צדדים שלישיים
          </h2>
          <p className="text-sm mb-3" style={{ color: '#5a7a6a' }}>
            Groupio <strong style={{ color: '#0f1f1a' }}>אינה מוכרת</strong> את פרטיך האישיים. אנו משתפים מידע מינימלי עם:
          </p>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {[
              { title: 'קבלנים', desc: 'שם, טלפון וכתובת (לצרכי ביצוע העבודה בלבד)' },
              { title: 'ספקי תשלום', desc: 'Stripe (עיבוד כרטיסי אשראי)' },
              { title: 'ספקי תשתית', desc: 'שרתי אחסון ענן (ישראל/אירופה)' },
              { title: 'רשויות החוק', desc: 'רק כנדרש על פי דין' },
            ].map(item => (
              <li key={item.title} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                <span><strong style={{ color: '#0f1f1a' }}>{item.title}</strong> — {item.desc}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. אבטחת מידע */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>
            4. אבטחת מידע
          </h2>
          <ul className="space-y-1.5 text-sm" style={{ color: '#5a7a6a' }}>
            {[
              'כל התקשורת מוצפנת ב-TLS 1.3',
              'סיסמאות מאוחסנות עם bcrypt (לא בטקסט חשוף)',
              'אסימוני אימות (JWT) עם תוקף קצר ומנגנון חידוש מאובטח',
              'פרטי כרטיסי אשראי אינם נשמרים בשרתינו (מאוחסנים ב-Stripe)',
              'גיבויי מסד נתונים יומיים עם הצפנה',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 5. זכויותיך */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-3" style={{ color: '#0f1f1a' }}>
            5. זכויותיך (GDPR וחוק הגנת הפרטיות הישראלי)
          </h2>
          <ul className="space-y-1.5 text-sm mb-4" style={{ color: '#5a7a6a' }}>
            {[
              { title: 'זכות עיון', desc: 'לקבל עותק של כל המידע שיש לנו עליך' },
              { title: 'זכות תיקון', desc: 'לתקן מידע שגוי' },
              { title: 'זכות מחיקה', desc: 'לדרוש מחיקת חשבונך ומידע אישי' },
              { title: 'זכות להתנגד', desc: 'לסרב לעיבוד מידע לצרכי שיווק' },
              { title: 'ניידות נתונים', desc: 'לקבל את נתוניך בפורמט מקריא למחשב' },
            ].map(item => (
              <li key={item.title} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#1a9a76' }} />
                <span><strong style={{ color: '#0f1f1a' }}>{item.title}</strong> — {item.desc}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm" style={{ color: '#5a7a6a' }}>
            לממש את זכויותיך:{' '}
            <a href="mailto:privacy@groupio.co.il" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
              privacy@groupio.co.il
            </a>
          </p>
        </section>

        {/* 6. שמירת מידע */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>
            6. שמירת מידע
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            נתוני חשבון נשמרים כל עוד החשבון פעיל ועד 3 שנים לאחר סגירתו (לצרכי ביקורת פיננסית). הודעות צ&apos;אט נארכבות לאחר 90 ימים.
          </p>
        </section>

        {/* 7. עוגיות */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>
            7. עוגיות (Cookies)
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            אנו משתמשים בעוגיות חיוניות בלבד לצרכי אימות (HTTP-only, Secure). אין שימוש בעוגיות לצרכי פרסום ממוקד.
          </p>
        </section>

        {/* 8. שינויים */}
        <section className="px-6 py-6" style={{ borderBottom: '1px solid rgba(10,51,41,0.06)' }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>
            8. שינויים במדיניות
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
            שינויים מהותיים יודיעו בדוא&quot;ל 14 ימים מראש. המשך השימוש לאחר מועד ההודעה מהווה הסכמה למדיניות המעודכנת.
          </p>
        </section>

        {/* 9. יצירת קשר */}
        <section className="px-6 py-6">
          <h2 className="text-sm font-bold mb-2" style={{ color: '#0f1f1a' }}>
            9. יצירת קשר
          </h2>
          <p className="text-sm" style={{ color: '#5a7a6a' }}>
            ממונה הגנת מידע:{' '}
            <a href="mailto:privacy@groupio.co.il" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
              privacy@groupio.co.il
            </a>
          </p>
        </section>
      </div>

      {/* Bottom links */}
      <div className="pt-8 text-center">
        <Link href="/terms" className="text-sm font-semibold hover:underline mx-3" style={{ color: '#1a9a76' }}>
          תנאי שימוש
        </Link>
        <span style={{ color: 'rgba(10,51,41,0.15)' }}>|</span>
        <Link href="/contact" className="text-sm font-semibold hover:underline mx-3" style={{ color: '#1a9a76' }}>
          צור קשר
        </Link>
      </div>
    </div>
  );
}
