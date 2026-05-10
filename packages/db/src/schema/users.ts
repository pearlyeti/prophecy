import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Minimal users table to verify the schema package builds and migrates.
// Real auth columns (sessions, OAuth providers, role, ban tier, age band)
// land alongside the better-auth integration.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
