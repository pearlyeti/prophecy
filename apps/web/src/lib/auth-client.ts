import { createAuthClient } from 'better-auth/client';

// Same-origin in prod (Vercel rewrites /api/auth/* to Railway); localhost in dev.
const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient({ baseURL: apiUrl });

export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>['data'];
