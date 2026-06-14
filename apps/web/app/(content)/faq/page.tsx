import { ChevronDown, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'שאלות ותשובות',
  description: 'תשובות לשאלות הנפוצות ביותר על פלטפורמת Groupio',
};

const FAQ_CATEGORIES = [
  {
    title: 'כללי',
    items: [
      {
        q: 'מה זה Groupio?',
        a: 'Groupio היא פלטפורמה לקנייה קבוצתית חכמה לדיירי בניינים. דיירים בבניין מאחדים כוח ומזמינים שירותי קבלנים (מיזוג, שיפוץ, חשמל, אינסטלציה ועוד) במחיר מוזל — ככל שיותר דיירים מצטרפים להצעה, כך המחיר יורד.',
      },
      {
        q: 'באילו אזורים Groupio פעילה?',
        a: 'כרגע פעילים בגוש דן, חיפה והקריות, ירושלים ובאר שבע. הרחבה לערים נוספות מתוכננת ב-2026.',
      },
    ],
  },
  {
    title: 'הצטרפות והצעות',
    items: [
      {
        q: 'איך מצטרפים להצעה?',
        a: 'נרשמים לפלטפורמה, בוחרים את הבניין שלכם, ומצטרפים להצעה הרלוונטית בלחיצה אחת. התשלום מתבצע רק לאחר שמספר הדיירים המינימלי להצעה הושג.',
      },
      {
        q: 'מה קורה אם ההצעה לא מגיעה למינימום משתתפים?',
        a: 'ההצעה מבוטלת ולא מחויבים. אם ביצעתם הרשמה מוקדמת ושילמתם, הסכום מוחזר במלואו תוך 5–7 ימי עסקים.',
      },
      {
        q: 'מה תנאי ביטול?',
        a: 'דיירים יכולים לבטל השתתפות עד 48 שעות לפני מועד סגירת ההצעה ללא עלות. לאחר מכן, בהתאם לתנאי ההצעה הספציפית.',
      },
    ],
  },
  {
    title: 'תשלומים ואבטחה',
    items: [
      {
        q: 'האם כספי בטוחים?',
        a: 'כן. כספי הדיירים מוחזקים בנאמנות (Escrow) ומועברים לקבלן רק לאחר אישור ביצוע העבודה. עיבוד התשלומים מתבצע דרך Stripe — תשתית אבטחה בסטנדרטים הגבוהים ביותר (PCI DSS Level 1).',
      },
    ],
  },
  {
    title: 'קבלנים ובניינים',
    items: [
      {
        q: 'כיצד נבחרים הקבלנים?',
        a: 'כל קבלן עובר תהליך אימות: בדיקת רישיון קבלן, ביטוח אחריות מקצועית, ניקוד אמינות בהתבסס על עבודות קודמות ודירוגי דיירים. קבלנים שאינם עומדים בסף האמון אינם מופיעים בפלטפורמה.',
      },
      {
        q: 'איך מנהל הבניין מוסיף דיירים?',
        a: 'מנהל הבניין מקבל קישור הזמנה ייחודי לבניין ויכול לשלוח אותו לדיירים. הדיירים נרשמים ומקושרים אוטומטית לבניין.',
      },
      {
        q: 'אני קבלן — איך מצטרפים?',
        a: null,
        aJsx: true,
      },
    ],
  },
];

type FaqPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function FaqPage(props: FaqPageProps) {
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
          <MessageCircle className="h-3 w-3" />
          <span>שאלות ותשובות</span>
        </div>
        <h1
          className="text-3xl font-extrabold mb-3"
          style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.2' }}
        >
          יש לכם שאלות? יש לנו תשובות.
        </h1>
        <p className="text-base" style={{ color: '#7a9a8a' }}>
          לא מצאתם?{' '}
          <Link href="/contact" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
            צרו קשר
          </Link>{' '}
          ונחזור תוך יום עסקים.
        </p>
      </div>

      {/* Categories */}
      <div className="space-y-8">
        {FAQ_CATEGORIES.map((category) => (
          <div key={category.title}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="h-px flex-1"
                style={{ background: 'rgba(10,51,41,0.08)' }}
              />
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: '#1a9a76', letterSpacing: '0.08em' }}
              >
                {category.title}
              </span>
              <div
                className="h-px flex-1"
                style={{ background: 'rgba(10,51,41,0.08)' }}
              />
            </div>

            <div
              className="rounded-[16px] overflow-hidden"
              style={{
                background: '#ffffff',
                border: '1px solid rgba(10,51,41,0.08)',
                boxShadow: '0 1px 3px rgba(10,51,41,0.04), 0 4px 16px rgba(10,51,41,0.04)',
              }}
            >
              {category.items.map((item, i) => (
                <div
                  key={i}
                  className="px-6 py-5"
                  style={
                    i < category.items.length - 1
                      ? { borderBottom: '1px solid rgba(10,51,41,0.06)' }
                      : undefined
                  }
                >
                  <div className="flex items-start gap-3">
                    <ChevronDown
                      className="h-4 w-4 mt-0.5 shrink-0"
                      style={{ color: '#1a9a76' }}
                    />
                    <div className="flex-1 min-w-0">
                      <h2
                        className="text-sm font-bold mb-2"
                        style={{ color: '#0f1f1a' }}
                      >
                        {item.q}
                      </h2>
                      {item.aJsx ? (
                        <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
                          נרשמים דרך עמוד{' '}
                          <Link href="/signup" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
                            הצטרפות קבלנים
                          </Link>
                          {' '}ועוברים תהליך אימות. לשאלות:{' '}
                          <a href="mailto:contractors@groupio.co.il" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
                            contractors@groupio.co.il
                          </a>
                        </p>
                      ) : (
                        <p className="text-sm leading-relaxed" style={{ color: '#5a7a6a' }}>
                          {item.a}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* CTA card */}
      <div
        className="rounded-[16px] p-7 mt-10 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(26,154,118,0.07) 0%, rgba(10,95,73,0.04) 100%)',
          border: '1px solid rgba(26,154,118,0.14)',
        }}
      >
        <h3 className="text-base font-bold mb-1.5" style={{ color: '#0f1f1a' }}>
          עדיין יש שאלות?
        </h3>
        <p className="text-sm mb-4" style={{ color: '#7a9a8a' }}>
          צוות Groupio זמין לכם בימי חול
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #1a9a76, #0e6b52)' }}
        >
          <MessageCircle className="h-4 w-4" />
          <span>צרו קשר</span>
        </Link>
      </div>
    </div>
  );
}
