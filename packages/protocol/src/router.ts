import { publicProcedure, router } from './trpc.js';

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: 'api' as const })),
});

export type AppRouter = typeof appRouter;
