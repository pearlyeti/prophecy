import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export * as schema from './schema/index.js';

export async function runMigrations(connectionString: string): Promise<void> {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
