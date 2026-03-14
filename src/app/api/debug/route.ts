export const runtime = 'edge'

export async function GET() {
  const googleId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID
  const googleSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET

  // 尝试 fetch OIDC discovery
  let oidcOk = false
  try {
    const r = await fetch("https://accounts.google.com/.well-known/openid-configuration")
    oidcOk = r.ok
  } catch (e) {}

  return Response.json({
    hasGoogleId: !!googleId,
    hasGoogleSecret: !!googleSecret,
    hasSecret: !!secret,
    googleIdPrefix: googleId?.slice(0, 10),
    oidcFetchOk: oidcOk,
  })
}
