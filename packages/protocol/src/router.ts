import { publicProcedure, router } from './trpc.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: 'api' as const })),
  auth: router({
    // Returns { userId, email, name, image } if a session cookie is present,
    // or null when the caller is unauthenticated. Safe to call any time.
    session: publicProcedure.query(({ ctx }) =>
      ctx.userId ? { userId: ctx.userId } : null,
    ),
  }),
});

export type AppRouter = typeof appRouter;
