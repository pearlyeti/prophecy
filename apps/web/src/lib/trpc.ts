import type { AppRouter } from '@prophecy/protocol';
import { createTRPCReact, httpBatchLink } from '@trpc/react-query';
import type {} from '@trpc/react-query'; // Fixes TS2742 inference error

export const trpc = createTRPCReact<AppRouter>();

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
