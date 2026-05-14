import type { AbilityAst as Ability } from '@prophecy/protocol';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { cardTypeEnum, colorEnum, dieSymbolEnum, factionEnum, rarityEnum } from './enums';

// `id` is a stable card code authored alongside the card data
// (e.g., 'CHAR_TEST_001'). Card codes never change; they are how
// decks, collections, and replays reference the catalog.
export const cards = pgTable(
  'cards',
  {
    id: text('id').primaryKey(),
    setCode: text('set_code').notNull(),
    type: cardTypeEnum('type').notNull(),
    subtypes: text('subtypes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    faction: factionEnum('faction').notNull(),
    color: colorEnum('color').notNull(),
    rarity: rarityEnum('rarity').notNull(),
    cost: integer('cost'),
    health: integer('health'),
    pointValue: integer('point_value'),
    elitePointValue: integer('elite_point_value'),
    isUnique: boolean('is_unique').notNull().default(false),
    displayText: text('display_text').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cards_set_idx').on(t.setCode),
    index('cards_type_idx').on(t.type),
    index('cards_faction_color_idx').on(t.faction, t.color),
  ],
);

// One row per ability paragraph on the card, ordered by `ordinal`.
// `ast` is the engine-interpretable form; `displayText` is the
// printed text the player sees on the card.
export const cardAbilities = pgTable(
  'card_abilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    ordinal: smallint('ordinal').notNull(),
    ast: jsonb('ast').$type<Ability>().notNull(),
    displayText: text('display_text').notNull().default(''),
  },
  (t) => [
    uniqueIndex('card_abilities_card_ordinal_idx').on(t.cardId, t.ordinal),
    index('card_abilities_card_idx').on(t.cardId),
  ],
);

// Six rows per card with a die. Face index 0..5 maps to the printed
// die. Modifier sides have `modifier = true`.
export const cardDice = pgTable(
  'card_dice',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    faceIndex: smallint('face_index').notNull(),
    symbol: dieSymbolEnum('symbol').notNull(),
    value: integer('value').notNull().default(0),
    cost: integer('cost').notNull().default(0),
    modifier: boolean('modifier').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.faceIndex] }),
    check('card_dice_face_index_range', sql`${t.faceIndex} BETWEEN 0 AND 5`),
  ],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardAbility = typeof cardAbilities.$inferSelect;
export type NewCardAbility = typeof cardAbilities.$inferInsert;
export type CardDie = typeof cardDice.$inferSelect;
export type NewCardDie = typeof cardDice.$inferInsert;
