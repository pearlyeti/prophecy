import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { cards } from './cards';
import { factionEnum } from './enums';
import { users } from './users';

export const decks = pgTable(
  'decks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    faction: factionEnum('faction').notNull(),
    battlefieldId: text('battlefield_id').references(() => cards.id),
    plotId: text('plot_id').references(() => cards.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('decks_user_idx').on(t.userId)],
);

// Team slots. A non-unique character can occupy multiple slots; uniqueness
// is enforced by engine validators, not the DB. `slotIndex` is 0..3.
export const deckCharacters = pgTable(
  'deck_characters',
  {
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    slotIndex: smallint('slot_index').notNull(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    elite: boolean('elite').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.slotIndex] }),
    check('deck_characters_slot_range', sql`${t.slotIndex} BETWEEN 0 AND 3`),
  ],
);

// 30-card deck list. `count` is 1 or 2 per the deck-building rules.
export const deckCards = pgTable(
  'deck_cards',
  {
    deckId: uuid('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    count: smallint('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.cardId] }),
    check('deck_cards_count_range', sql`${t.count} BETWEEN 1 AND 2`),
  ],
);

export type Deck = typeof decks.$inferSelect;
export type NewDeck = typeof decks.$inferInsert;
export type DeckCharacter = typeof deckCharacters.$inferSelect;
export type NewDeckCharacter = typeof deckCharacters.$inferInsert;
export type DeckCard = typeof deckCards.$inferSelect;
export type NewDeckCard = typeof deckCards.$inferInsert;
