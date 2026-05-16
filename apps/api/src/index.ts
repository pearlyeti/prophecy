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

// Shared CORS config. Better Auth does not respond to OPTIONS preflights on
// its own, so Hono must handle them for /api/auth/** as well as /trpc/*.
const corsMiddleware = cors({
  origin: process.env.WEB_PUBLIC_URL ?? ((origin) => origin ?? '*'),
  credentials: true,
});
app.use('/api/auth/*', corsMiddleware);
app.use('/trpc/*', corsMiddleware);

app.get('/health', (c) => c.json({ ok: true, service: 'api' }));

app.on(['GET', 'POST'], '/api/auth/**', async (c) => {
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
