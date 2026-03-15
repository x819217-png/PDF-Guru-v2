import { NextRequest, NextResponse } from 'next/server';
import { upgradeToPro } from '@/lib/db';

export const runtime = 'edge';

const DB_ID = 'c147850c-5941-4a4c-93a2-265f09ad334d';
const ACCOUNT_ID = 'd7137fd92ba7c3a136b6ada46b93d5ec';

async function queryD1(sql: string, params: any[] = []) {
  const token = process.env.CLOUDFLARE_D1_TOKEN;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json() as any;
  if (!data.success) throw new Error(data.errors?.[0]?.message || 'D1 error');
  return data.result?.[0];
}

function decodeBase64(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function getEmailFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get('next-auth.session-token')?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(decodeBase64(token));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.email || null;
  } catch { return null; }
}

// POST /api/subscription/register — PayPal 创建订阅后记录 subscriptionId → email
export async function POST(request: NextRequest) {
  try {
    const email = getEmailFromRequest(request);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscriptionId } = await request.json() as any;
    if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 });

    await queryD1(
      'INSERT OR REPLACE INTO pending_subscriptions (subscription_id, email, created_at) VALUES (?, ?, ?)',
      [subscriptionId, email, new Date().toISOString()]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET /api/subscription/register?id=xxx — 查询映射（供 webhook 使用）
export async function GET(request: NextRequest) {
  const subscriptionId = new URL(request.url).searchParams.get('id');
  if (!subscriptionId) return NextResponse.json({ email: null });

  try {
    const result = await queryD1(
      'SELECT email FROM pending_subscriptions WHERE subscription_id = ?',
      [subscriptionId]
    );
    const email = result?.results?.[0]?.email || null;
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ email: null });
  }
}
