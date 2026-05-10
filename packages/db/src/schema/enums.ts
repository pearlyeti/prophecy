import {
  CARD_TYPES,
  COLORS,
  DIE_SYMBOLS,
  FACTIONS,
  RARITIES,
} from '@prophecy/protocol';
import { pgEnum } from 'drizzle-orm/pg-core';

// Postgres enums backing the card catalog. Keep these in lockstep with
// `@prophecy/protocol` — the value lists there are the source of truth.

export const factionEnum = pgEnum('faction', FACTIONS);
export const colorEnum = pgEnum('color', COLORS);
export const cardTypeEnum = pgEnum('card_type', CARD_TYPES);
export const dieSymbolEnum = pgEnum('die_symbol', DIE_SYMBOLS);
export const rarityEnum = pgEnum('rarity', RARITIES);
