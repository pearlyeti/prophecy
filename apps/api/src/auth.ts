import { createDb, schema } from '@prophecy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

const BETTER_AUTH_URL = process.env.API_PUBLIC_URL ?? 'http://localhost:3000';
const BETTER_AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-secret-replace-me';

// Strip trailing slash so origin comparisons don't fail on a mismatch.
const webOrigin = process.env.WEB_PUBLIC_URL?.replace(/\/+$/, '');

// Surface missing production env vars at startup so Railway logs make the
// problem obvious rather than manifesting as a cryptic 500 mid-request.
if (process.env.NODE_ENV === 'production') {
  const missing = [
    'AUTH_SECRET',
    'API_PUBLIC_URL',
    'WEB_PUBLIC_URL',
    'DATABASE_URL',
  ].filter((k) => !process.env[k]);
  if (missing.length) console.warn('[auth] missing required env vars:', missing.join(', '));
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    console.warn('[auth] Google OAuth disabled — GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set');
  if (!webOrigin)
    console.warn('[auth] WEB_PUBLIC_URL not set — CSRF will reject all production origins');
}

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  database: drizzleAdapter(createDb(DB_URL), {
    provider: 'pg',
    schema: {
      user: schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  // bearer plugin lets the game server validate session tokens via
  // Authorization: Bearer <token> instead of forwarding cookies cross-domain.
  plugins: [bearer()],
  socialProviders: {
    // Only register a provider when both credentials are present; an empty
    // clientId with enabled:false can cause Better Auth to throw a 500.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? {
          discord: {
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
          },
        }
      : {}),
  },
  trustedOrigins: webOrigin
    ? [webOrigin]
    : ['http://localhost:5173', 'http://localhost:4173'],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
