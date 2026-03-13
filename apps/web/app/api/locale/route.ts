import { NextRequest, NextResponse } from 'next/server';

const LOCALES = ['he', 'en'] as const;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locale = typeof body?.locale === 'string' ? body.locale : body?.locale;
  if (!LOCALES.includes(locale as (typeof LOCALES)[number])) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
  }
  const response = NextResponse.json({ ok: true, locale });
  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return response;
}
