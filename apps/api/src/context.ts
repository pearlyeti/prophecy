import type { Context as TrpcContext } from '@prophecy/protocol';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

import { auth } from './auth.js';

export async function createContext({ req }: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  return { userId: session?.user.id ?? null };
}
