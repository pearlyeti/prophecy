// Server-only entry. Pulls in @trpc/server's runtime, which is not safe
// to ship to browsers. Apps that need the live tRPC router (apps/api)
// import from '@prophecy/protocol/server'; the web client uses the
// default '@prophecy/protocol' entry which is type-only for tRPC bits.

export { appRouter, type AppRouter } from './router.js';
export type { Context } from './trpc.js';
