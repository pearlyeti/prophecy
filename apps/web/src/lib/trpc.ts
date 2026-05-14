import type { AppRouter } from '@prophecy/protocol';
import { createTRPCReact, httpBatchLink, type CreateTRPCReact } from '@trpc/react-query';

export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();

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
