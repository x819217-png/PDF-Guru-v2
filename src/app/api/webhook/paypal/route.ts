import { NextRequest, NextResponse } from 'next/server';
import { upgradeToPro, cancelSubscription } from '@/lib/db';

export const runtime = 'edge';

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET!;

async function getPayPalToken() {
  const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json() as any;
  return data.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as any;
    const eventType = body.event_type;
    const resource = body.resource;

    console.log('PayPal webhook:', eventType);

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const subscriptionId = resource.id;
      // 1. 优先用前端传来的登录邮箱
      let email = body.user_email;

      // 2. 查 pending_subscriptions 表（createSubscription 时记录的）
      if (!email) {
        const regRes = await fetch(`${new URL(request.url).origin}/api/subscription/register?id=${subscriptionId}`);
        const regData = await regRes.json() as any;
        email = regData.email;
      }

      // 3. 最后兜底：从 PayPal API 查 subscriber 邮箱
      if (!email) {
        const token = await getPayPalToken();
        const subRes = await fetch(`https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const sub = await subRes.json() as any;
        email = sub.subscriber?.email_address;
      }

      if (email) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await upgradeToPro(email, subscriptionId, expiresAt);
        console.log('Upgraded to Pro:', email);
      }
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || 
        eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
      const subscriptionId = resource.id;
      const token = await getPayPalToken();

      const subRes = await fetch(`https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const sub = await subRes.json() as any;
      const email = sub.subscriber?.email_address;

      if (email) {
        await cancelSubscription(email);
        console.log('Cancelled subscription:', email);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
