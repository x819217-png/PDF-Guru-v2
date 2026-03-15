import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || '';
const BASE_URL = 'https://sumifypdf.com';

function encodeBase64(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function decodeBase64(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

function makeToken(email: string, name: string, picture: string) {
  const payload = {
    email,
    name,
    picture,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };
  return encodeBase64(JSON.stringify(payload));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 登录入口：/api/auth/signin 或 /api/auth/signin/google
  if (pathname.endsWith('/signin') || pathname.endsWith('/signin/google')) {
    const callbackUrl = url.searchParams.get('callbackUrl') || BASE_URL;
    const redirectUri = `${BASE_URL}/api/auth/callback/google`;
    const scope = encodeURIComponent('openid email profile');
    const state = encodeBase64(callbackUrl);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
    return NextResponse.redirect(authUrl);
  }

  // Google 回调：/api/auth/callback/google
  if (pathname.endsWith('/callback/google') || url.searchParams.has('code')) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const callbackUrl = state ? decodeBase64(state) : BASE_URL;

    if (!code) {
      return NextResponse.redirect(`${BASE_URL}/?error=no_code`);
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/api/auth/callback/google`,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error('Token exchange failed:', err);
      return NextResponse.redirect(`${BASE_URL}/?error=token_failed`);
    }

    const tokenData = await tokenResponse.json() as any;
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userResponse.json() as any;
    const token = makeToken(userData.email, userData.name, userData.picture);

    const response = NextResponse.redirect(callbackUrl.startsWith('http') ? callbackUrl : BASE_URL);
    response.cookies.set('next-auth.session-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });
    return response;
  }

  // 错误页
  if (pathname.endsWith('/error')) {
    return NextResponse.json({ error: url.searchParams.get('error') || 'Unknown' });
  }

  // 退出
  if (pathname.endsWith('/signout')) {
    const response = NextResponse.redirect(BASE_URL);
    response.cookies.delete('next-auth.session-token');
    return response;
  }

  // Session 查询
  if (pathname.endsWith('/session')) {
    const token = request.cookies.get('next-auth.session-token')?.value;
    if (!token) return NextResponse.json({});
    try {
      const payload = JSON.parse(decodeBase64(token));
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return NextResponse.json({});
      }
      return NextResponse.json({
        user: { email: payload.email, name: payload.name, image: payload.picture },
        expires: new Date(payload.exp * 1000).toISOString(),
      });
    } catch {
      return NextResponse.json({});
    }
  }

  // Providers
  if (pathname.endsWith('/providers')) {
    return NextResponse.json({ google: { id: 'google', name: 'Google', type: 'oauth' } });
  }

  // CSRF token (next-auth compat)
  if (pathname.endsWith('/csrf')) {
    return NextResponse.json({ csrfToken: 'dummy' });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
