import { NextRequest, NextResponse } from 'next/server';
import { upsertUser, dailyGrant } from '@/lib/db';

export const runtime = 'edge';

function decodeBase64(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function getEmailFromRequest(request: NextRequest): string | null {
  // 从自定义 session cookie 读取
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

export async function GET(request: NextRequest) {
  try {
    const email = getEmailFromRequest(request);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const name = undefined;
    const avatar = undefined;

    await upsertUser(email, name, avatar);
    const user = await dailyGrant(email);

    return NextResponse.json({
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      plan: user.plan,
      credits: user.plan === 'pro' ? null : user.credits,
      subscriptionStatus: user.subscription_status,
      subscriptionExpiresAt: user.subscription_expires_at,
    });
  } catch (error) {
    console.error('User API error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
