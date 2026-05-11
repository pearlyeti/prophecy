import { serve } from '@hono/node-server';
import { appRouter } from '@prophecy/protocol/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { createContext } from './context.js';
import { startWorkers } from './workers/index.js';

const app = new Hono();

app.use('*', logger());
// Dev-friendly CORS: reflect any origin. Server-authoritative engine
// means CORS isn't a security boundary for us. Lock down via
// WEB_PUBLIC_URL in prod.
app.use(
  '*',
  cors({
    origin: process.env.WEB_PUBLIC_URL ?? ((origin) => origin ?? '*'),
    credentials: true,
  }),
);

app.get('/health', (c) => c.json({ ok: true, service: 'api' }));

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
