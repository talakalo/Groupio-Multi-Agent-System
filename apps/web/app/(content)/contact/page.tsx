import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Clock, HelpCircle, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'צור קשר',
  description: 'צרו קשר עם צוות Groupio — נשמח לעזור',
};

const CHANNELS = [
  { label: 'תמיכה כללית', email: 'support@groupio.co.il', desc: 'לכל שאלה או בעיה בפלטפורמה' },
  { label: 'שאלות תשלומים וחיובים', email: 'billing@groupio.co.il', desc: 'חיובים, החזרים, עמלות' },
  { label: 'הגנת פרטיות ומחיקת נתונים', email: 'privacy@groupio.co.il', desc: 'בקשות GDPR ומחיקת חשבון' },
  { label: 'קבלנים — הצטרפות לפלטפורמה', email: 'contractors@groupio.co.il', desc: 'הרשמה ואימות קבלנים' },
];

const RESPONSE_TIMES = [
  { label: 'פניות תמיכה', time: 'עד יום עסקים אחד', icon: Clock },
  { label: 'בעיות תשלום דחופות', time: 'עד 4 שעות בימי חול', icon: Shield },
  { label: 'בקשות GDPR / מחיקת נתונים', time: 'עד 30 ימים (כנדרש בחוק)', icon: Shield },
];

type ContactPageProps = { params?: Promise<Record<string, string | string[]>>; searchParams?: Promise<Record<string, string | string[]>> };

export default async function ContactPage(props: ContactPageProps) {
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
          <Mail className="h-3 w-3" />
          <span>יצירת קשר</span>
        </div>
        <h1
          className="text-3xl font-extrabold mb-3"
          style={{ color: '#0f1f1a', letterSpacing: '-0.03em', lineHeight: '1.2' }}
        >
          אנחנו כאן בשבילכם
        </h1>
        <p className="text-base" style={{ color: '#7a9a8a' }}>
          נחזור אליכם תוך יום עסקים. לשאלות נפוצות ראו את דף{' '}
          <Link href="/faq" className="font-semibold hover:underline" style={{ color: '#1a9a76' }}>
            שאלות ותשובות
          </Link>
          .
        </p>
      </div>

      {/* Contact channels */}
      <div
        className="rounded-[16px] overflow-hidden mb-6"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(10,51,41,0.08)',
          boxShadow: '0 1px 3px rgba(10,51,41,0.04), 0 4px 16px rgba(10,51,41,0.04)',
        }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: '1px solid rgba(10,51,41,0.06)', background: 'rgba(26,154,118,0.03)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: '#0f1f1a' }}>
            ערוצי יצירת קשר
          </h2>
        </div>
        {CHANNELS.map((ch, i) => (
          <div
            key={ch.email}
            className="px-6 py-5 flex items-start gap-4"
            style={i < CHANNELS.length - 1 ? { borderBottom: '1px solid rgba(10,51,41,0.06)' } : undefined}
          >
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: 'rgba(26,154,118,0.08)' }}
            >
              <Mail className="h-4 w-4" style={{ color: '#1a9a76' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#0f1f1a' }}>
                {ch.label}
              </p>
              <p className="text-xs mb-1.5" style={{ color: '#7a9a8a' }}>
                {ch.desc}
              </p>
              <a
                href={`mailto:${ch.email}`}
                className="text-sm font-semibold hover:underline"
                style={{ color: '#1a9a76' }}
              >
                {ch.email}
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Response times */}
      <div
        className="rounded-[16px] overflow-hidden mb-6"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(10,51,41,0.08)',
          boxShadow: '0 1px 3px rgba(10,51,41,0.04), 0 4px 16px rgba(10,51,41,0.04)',
        }}
      >
        <div
          className="px-6 py-4"
          style={{ borderBottom: '1px solid rgba(10,51,41,0.06)', background: 'rgba(26,154,118,0.03)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: '#0f1f1a' }}>
            זמני תגובה מובטחים
          </h2>
        </div>
        {RESPONSE_TIMES.map((rt, i) => (
          <div
            key={rt.label}
            className="px-6 py-4 flex items-center justify-between gap-4"
            style={i < RESPONSE_TIMES.length - 1 ? { borderBottom: '1px solid rgba(10,51,41,0.06)' } : undefined}
          >
            <span className="text-sm" style={{ color: '#3d5a50' }}>{rt.label}</span>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
              style={{ background: 'rgba(26,154,118,0.07)', color: '#0d6b4f' }}
            >
              {rt.time}
            </span>
          </div>
        ))}
      </div>

      {/* FAQ nudge card */}
      <div
        className="rounded-[16px] p-6 flex items-center gap-4"
        style={{
          background: 'linear-gradient(135deg, rgba(26,154,118,0.07) 0%, rgba(10,95,73,0.04) 100%)',
          border: '1px solid rgba(26,154,118,0.14)',
        }}
      >
        <div
          className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: 'rgba(26,154,118,0.1)' }}
        >
          <HelpCircle className="h-5 w-5" style={{ color: '#1a9a76' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5" style={{ color: '#0f1f1a' }}>
            רוב השאלות כבר נענו
          </p>
          <p className="text-xs" style={{ color: '#7a9a8a' }}>
            בדקו את דף שאלות ותשובות לפני שמגיעים אלינו — תחסכו זמן.
          </p>
        </div>
        <Link
          href="/faq"
          className="rounded-[8px] px-4 py-2 text-sm font-semibold shrink-0 transition-opacity hover:opacity-80"
          style={{ background: '#1a9a76', color: '#ffffff' }}
        >
          לדף FAQ
        </Link>
      </div>
    </div>
  );
}
