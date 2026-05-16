import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://prophecy:prophecy@localhost:5432/prophecy';

const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client);

await migrate(db, { migrationsFolder: './migrations' });
await client.end();

console.log('Migrations complete.');
