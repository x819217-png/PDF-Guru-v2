import { NextRequest, NextResponse } from 'next/server';
import { consumeCredit } from '@/lib/db';

export const runtime = 'edge';

function decodeBase64(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function getEmailFromRequest(request: NextRequest): string | null {
  const headerEmail = request.headers.get('x-user-email');
  if (headerEmail) return headerEmail;
  const token = request.cookies.get('next-auth.session-token')?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(decodeBase64(token));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = getEmailFromRequest(request);
    if (!email) {
      return NextResponse.json({ ok: false, message: 'No user email' }, { status: 401 });
    }
    const result = await consumeCredit(email);
    if (!result.ok) {
      return NextResponse.json({ ok: false, credits: result.credits, message: result.message, upgrade: true }, { status: 402 });
    }
    return NextResponse.json({ ok: true, credits: result.credits });
  } catch (error) {
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 });
  }
}
