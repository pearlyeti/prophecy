import { pgEnum } from 'drizzle-orm/pg-core';

// Postgres enums backing the card catalog.
//
// IMPORTANT: these values must stay in lockstep with @prophecy/protocol's
// FACTIONS / COLORS / CARD_TYPES / DIE_SYMBOLS / RARITIES. They are duplicated
// here (rather than imported) because drizzle-kit's schema loader can't
// follow cross-package imports cleanly. A schema test asserts the lists match.

const FACTIONS = ['light', 'shadow', 'neutral'] as const;
const COLORS = ['red', 'blue', 'yellow', 'gray'] as const;
const CARD_TYPES = [
  'character',
  'upgrade',
  'support',
  'event',
  'plot',
  'battlefield',
] as const;
const DIE_SYMBOLS = [
  'melee',
  'ranged',
  'indirect',
  'shield',
  'resource',
  'disrupt',
  'discard',
  'draw',
  'focus',
  'special',
  'modifier',
  'blank',
] as const;
const RARITIES = ['fixed', 'common', 'uncommon', 'rare', 'legendary'] as const;

export const factionEnum = pgEnum('faction', FACTIONS);
export const colorEnum = pgEnum('color', COLORS);
export const cardTypeEnum = pgEnum('card_type', CARD_TYPES);
export const dieSymbolEnum = pgEnum('die_symbol', DIE_SYMBOLS);
export const rarityEnum = pgEnum('rarity', RARITIES);
