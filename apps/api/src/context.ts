import type { Context as TrpcContext } from '@prophecy/protocol';

// Build the per-request context for tRPC. Auth wiring lands with better-auth.
export function createContext(): TrpcContext {
  return { userId: null };
}
