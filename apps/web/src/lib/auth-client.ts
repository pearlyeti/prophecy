import { createAuthClient } from 'better-auth/client';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient({ baseURL: apiUrl });

export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>['data'];
