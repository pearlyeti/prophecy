import { initTRPC } from '@trpc/server';

export interface Context {
  // Filled in by the api app's createContext.
  readonly userId: string | null;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
