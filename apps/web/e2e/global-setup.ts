import { request } from '@playwright/test';

const API = 'http://localhost:3000';

async function setupPlayer(
  email: string,
  password: string,
  name: string,
  stateFile: string,
): Promise<void> {
  // better-auth requires an Origin header on sign-up/sign-in for CSRF protection.
  const ctx = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: 'http://localhost:5173' },
  });

  // Sign up — idempotent; 422 means the user already exists from a prior run.
  await ctx.post('/api/auth/sign-up/email', {
    data: { email, password, name },
    failOnStatusCode: false,
  });

  // Sign in to get the session cookie.
  const res = await ctx.post('/api/auth/sign-in/email', {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed for ${email}: ${res.status()} ${await res.text()}`);
  }

  await ctx.storageState({ path: stateFile });
  await ctx.dispose();
}

export default async function globalSetup(): Promise<void> {
  await Promise.all([
    setupPlayer('e2e-a@test.local', 'e2e_pw_a!X9', 'PlayerA', 'e2e/state-a.json'),
    setupPlayer('e2e-b@test.local', 'e2e_pw_b!X9', 'PlayerB', 'e2e/state-b.json'),
  ]);
}
