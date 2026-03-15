import NextAuth from "next-auth"
import type { OAuthConfig } from "next-auth/providers"

// 手动配置 Google provider，避免自动 OIDC discovery
const GoogleProvider: OAuthConfig<any> = {
  id: "google",
  name: "Google",
  type: "oidc",
  issuer: "https://accounts.google.com",
  clientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "",
  authorization: {
    url: "https://accounts.google.com/o/oauth2/v2/auth",
    params: { scope: "openid email profile", response_type: "code" },
  },
  token: "https://oauth2.googleapis.com/token",
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  profile(profile: any) {
    return { id: profile.sub, name: profile.name, email: profile.email, image: profile.picture };
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GoogleProvider],
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) token.accessToken = account.access_token;
      return token;
    },
  },
})
