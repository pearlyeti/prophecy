import { serve } from '@hono/node-server';
import { appRouter } from '@prophecy/protocol/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { auth } from './auth.js';
import { createContext } from './context.js';
import { startWorkers } from './workers/index.js';

const app = new Hono();

app.use('*', logger());
// Apply CORS only to tRPC routes. Better Auth handles its own CORS
// (including preflight) for /api/auth/**; adding Hono CORS there
// causes duplicate headers and pre-empts Better Auth's preflight logic.
app.use(
  '/trpc/*',
  cors({
    origin: process.env.WEB_PUBLIC_URL ?? ((origin) => origin ?? '*'),
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'api' }));

// Better Auth handles its own CORS for auth routes (based on trustedOrigins),
// including OPTIONS preflights. Include OPTIONS here so Hono routes them to
// Better Auth instead of returning 404, which would break the browser preflight.
app.on(['GET', 'POST', 'OPTIONS'], '/api/auth/**', async (c) => {
  try {
    return await auth.handler(c.req.raw);
  } catch (err) {
    console.error('[auth] unhandled error in auth.handler:', err);
    return c.json({ error: 'internal server error' }, 500);
  }
});

app.all('/trpc/*', (c) =>
  fetchRequestHandler({
    endpoint: '/trpc',
    req: c.req.raw,
    router: appRouter,
    createContext,
  }),
);

const port = Number(process.env.API_PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

// Workers run in-process for v1; extract to apps/jobs when load demands.
startWorkers();
