import { createDb, schema } from '@prophecy/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

const BETTER_AUTH_URL = process.env.API_PUBLIC_URL ?? 'http://localhost:3000';
const BETTER_AUTH_SECRET = process.env.AUTH_SECRET ?? 'dev-secret-replace-me';

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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      enabled: !!process.env.DISCORD_CLIENT_ID,
    },
  },
  trustedOrigins: process.env.WEB_PUBLIC_URL
    ? [process.env.WEB_PUBLIC_URL]
    : ['http://localhost:5173', 'http://localhost:4173'],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
