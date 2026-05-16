import type { AppRouter } from '@prophecy/protocol';
import { createTRPCReact, httpBatchLink, type CreateTRPCReact } from '@trpc/react-query';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

// In prod the web app proxies /api/auth/* and /trpc/* through Vercel rewrites
// to the Railway API, so same-origin requests carry first-party cookies. In
// dev, hit the API directly on localhost:3000.
const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${apiUrl}/trpc`,
      fetch(input, init) {
        return fetch(input, { ...init, credentials: 'include' } as RequestInit);
      },
    }),
  ],
});
