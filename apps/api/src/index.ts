import { serve } from '@hono/node-server';
import { runMigrations } from '@prophecy/db';
import { appRouter } from '@prophecy/protocol/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { auth } from './auth.js';
import { createContext } from './context.js';
import { startWorkers } from './workers/index.js';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

try {
  await runMigrations(DB_URL);
  console.log('[db] migrations up to date');
} catch (err) {
  console.error('[db] migration failed — refusing to start:', err);
  process.exit(1);
}

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

// All /api/auth/* traffic goes through better-auth. set-password has no native
// HTTP route in better-auth (server-side only), so we intercept it here and
// call auth.api.setPassword directly; everything else delegates to auth.handler.
// Using app.use() so the wildcard matches nested paths (sign-in/social, etc.).
app.use('/api/auth/*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path === '/api/auth/set-password') {
    return next();
  }
  try {
    return await auth.handler(c.req.raw);
  } catch (err) {
    console.error('[auth] unhandled error in auth.handler:', err);
    return c.json({ error: 'internal server error' }, 500);
  }
});

app.post('/api/auth/set-password', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const newPassword = body?.newPassword;
    if (typeof newPassword !== 'string' || !newPassword) {
      return c.json({ message: 'newPassword is required' }, 400);
    }
    await auth.api.setPassword({ body: { newPassword }, headers: c.req.raw.headers });
    return c.json({ status: true });
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const status = (e?.status ?? e?.statusCode ?? 400) as 400 | 401 | 403 | 500;
    const message = (e?.message ?? 'Something went wrong') as string;
    return c.json({ message }, status);
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
