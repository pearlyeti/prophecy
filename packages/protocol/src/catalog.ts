// Canonical schemas for the original-IP card catalog and deck registry.
// The same shapes are used by:
//   - `apps/game-server` when reading `packages/db/seed/{cards,decks}.json`
//   - The `/admin` UX in `apps/web` for create / edit forms
//   - The engine's `newGameFromDecks` (structurally compatible with the
//     synthetic-set `CardFixture` / `DeckFixture`; cast at the call site)
//
// Looser than the synthetic-set's `CardFixtureSchema`: no min-cards
// requirement, no strict ID regex, dieFaces optional / nullable so a
// freshly-typed event card can save without forcing the user to author
// six faces. Production deck-build rule enforcement (color / faction /
// 30-card / 2-copy) is handled by `validateDeck`, not at the schema
// layer — saving an in-progress deck shouldn't fail validation.

import { z } from 'zod';

import {
  cardTypeSchema,
  colorSchema,
  dieSymbolSchema,
  factionSchema,
  keywordSchema,
  raritySchema,
} from './schemas.js';

// ────────────────────────────────────────────────────────────────────
// Die face — six per dice-bearing card.
// ────────────────────────────────────────────────────────────────────

export const dieFaceSchema = z.object({
  symbol: dieSymbolSchema,
  value: z.number().int().min(0).max(20),
  cost: z.number().int().min(0).max(8),
  modifier: z.boolean(),
});
export type DieFace = z.infer<typeof dieFaceSchema>;

// ────────────────────────────────────────────────────────────────────
// Effect AST — one engine-executable instruction. Discriminated on `op`.
//
// The `(new)` variant is a deliberate placeholder for cards designed
// against engine ops that don't exist yet. It's not executable; if the
// engine encounters one mid-resolution it throws `IllegalActionError`.
// Treat the set of `op: 'new'` entries across the catalog as the
// running TODO list for which engine ops to build next.
// ────────────────────────────────────────────────────────────────────

const gainResourcesEffect = z.object({
  op: z.literal('gain_resources'),
  amount: z.number().int().min(1).max(99),
});

const drawCardsEffect = z.object({
  op: z.literal('draw_cards'),
  scope: z.enum(['self', 'each_player', 'self_to_hand_size']),
  // `amount` is required for self / each_player; ignored for self_to_hand_size.
  amount: z.number().int().min(1).max(20).nullable().default(null),
});

const dealDamageEffect = z.object({
  op: z.literal('deal_damage'),
  amount: z.number().int().min(1).max(99),
  kind: z.enum(['melee', 'ranged', 'indirect', 'unspecified']),
  // Target is supplied by the play-card action at runtime; the AST
  // just declares that a character target is required.
});

const giveShieldsEffect = z.object({
  op: z.literal('give_shields'),
  amount: z.number().int().min(1).max(3),
});

const healDamageEffect = z.object({
  op: z.literal('heal_damage'),
  amount: z.number().int().min(1).max(99),
});

const removeShieldsEffect = z.object({
  op: z.literal('remove_shields'),
  // 'all' wipes the character's shields; a number removes up to that many.
  amount: z.union([z.literal('all'), z.number().int().min(1).max(3)]),
});

const newOpEffect = z.object({
  op: z.literal('new'),
  workingName: z.string().min(1).max(60),
  notes: z.string().default(''),
});

export const effectSchema = z.discriminatedUnion('op', [
  gainResourcesEffect,
  drawCardsEffect,
  dealDamageEffect,
  giveShieldsEffect,
  healDamageEffect,
  removeShieldsEffect,
  newOpEffect,
]);
export type Effect = z.infer<typeof effectSchema>;

/** Known op identifiers the engine can dispatch. Useful for UI dropdowns. */
export const KNOWN_OPS = [
  'gain_resources',
  'draw_cards',
  'deal_damage',
  'give_shields',
  'heal_damage',
  'remove_shields',
] as const;
export type KnownOp = (typeof KNOWN_OPS)[number];

/** Which ops require a character target supplied at play-card time. */
export const OPS_NEEDING_CHARACTER_TARGET: ReadonlySet<KnownOp> = new Set([
  'deal_damage',
  'give_shields',
  'heal_damage',
  'remove_shields',
]);

// ────────────────────────────────────────────────────────────────────
// Ability AST — one paragraph of effect on a card.
// ────────────────────────────────────────────────────────────────────

const immediateAbility = z.object({
  kind: z.literal('immediate'),
  effects: z.array(effectSchema),
});

export const abilitySchema = z.discriminatedUnion('kind', [immediateAbility]);
export type Ability = z.infer<typeof abilitySchema>;

// ────────────────────────────────────────────────────────────────────
// Card — one entry in the catalog. Original Prophecy IP.
// ────────────────────────────────────────────────────────────────────

export const cardSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(80),
    type: cardTypeSchema,
    // Free-form, optional. Comma-separated if a card has multiple
    // (e.g., "Soldier, Vehicle"). The engine doesn't dispatch on this.
    subtype: z.string().max(80).nullable().default(null),
    faction: factionSchema,
    color: colorSchema,
    rarity: raritySchema,
    /** Play cost (events / upgrades / supports). null for characters / battlefields / plots. */
    cost: z.number().int().min(0).max(20).nullable().default(null),
    /** Health (characters only). null otherwise. */
    health: z.number().int().min(1).max(99).nullable().default(null),
    /** Non-elite point value (characters). null otherwise. */
    pointValue: z.number().int().min(1).max(99).nullable().default(null),
    /** Elite point value (characters with 2 dice). null otherwise. */
    elitePointValue: z.number().int().min(1).max(99).nullable().default(null),
    /** Plot cost (plots only). null otherwise. Often 0 or negative. */
    plotPointValue: z.number().int().min(-5).max(5).nullable().default(null),
    isUnique: z.boolean().default(false),
    keywords: z.array(keywordSchema).default([]),
    /** Human-readable description. The engine resolves the AST, not this. */
    displayText: z.string().default(''),
    /** Six die faces. null for cards without dice (most events, plots). */
    dieFaces: z
      .tuple([dieFaceSchema, dieFaceSchema, dieFaceSchema, dieFaceSchema, dieFaceSchema, dieFaceSchema])
      .nullable()
      .default(null),
    abilities: z.array(abilitySchema).default([]),
  })
  .strict();
export type Card = z.infer<typeof cardSchema>;

export const cardCatalogSchema = z.object({
  cards: z.array(cardSchema),
});
export type CardCatalog = z.infer<typeof cardCatalogSchema>;

// ────────────────────────────────────────────────────────────────────
// Deck — one player's team / battlefield / plot / card list.
// ────────────────────────────────────────────────────────────────────

export const deckCharacterSchema = z.object({
  cardId: z.string().min(1),
  elite: z.boolean(),
});
export type DeckCharacter = z.infer<typeof deckCharacterSchema>;

export const deckCardSchema = z.object({
  cardId: z.string().min(1),
  count: z.number().int().min(1).max(10),
});
export type DeckCard = z.infer<typeof deckCardSchema>;

export const deckSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(80),
    description: z.string().default(''),
    faction: factionSchema,
    characters: z.array(deckCharacterSchema).default([]),
    battlefieldCardId: z.string().nullable().default(null),
    plotCardId: z.string().nullable().default(null),
    cards: z.array(deckCardSchema).default([]),
  })
  .strict();
export type Deck = z.infer<typeof deckSchema>;

export const deckCatalogSchema = z.object({
  decks: z.array(deckSchema),
});
export type DeckCatalog = z.infer<typeof deckCatalogSchema>;
