// Canonical Zod schemas for the Prophecy card catalog and deck registry.
// The Ability / Effect types are defined as pure TypeScript in
// @prophecy/game-engine/src/abilities/types.ts; the Zod schemas here
// validate JSON (corpus files, admin API payloads) into those same types.
//
// Used by:
//   - apps/game-server corpus loader
//   - apps/web admin card editor
//   - packages/db for the cardAbilities JSONB type

import type {
  Ability,
  ActionCost,
  CardDisposition,
  Effect,
  PlayCondition,
  RollCardDieEffect,
  RollEventDieEffect,
  TargetSpec,
  TriggerEvent,
  ValueRef,
} from '@prophecy/game-engine';
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
// Die face
// ────────────────────────────────────────────────────────────────────

export const dieFaceSchema = z.object({
  symbol: dieSymbolSchema,
  value: z.number().int().min(0).max(20),
  cost: z.number().int().min(0).max(8),
  modifier: z.boolean(),
});
export type DieFace = z.infer<typeof dieFaceSchema>;

// ────────────────────────────────────────────────────────────────────
// Building blocks
// ────────────────────────────────────────────────────────────────────

export const targetSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('opponent') }),
  z.object({ kind: z.literal('self') }),
  z.object({ kind: z.literal('ownCharacter') }),
  z.object({ kind: z.literal('opponentCharacter') }),
  z.object({ kind: z.literal('anyCharacter') }),
  z.object({ kind: z.literal('eachOpponentCharacter') }),
  z.object({ kind: z.literal('eachCharacter') }),
  z.object({ kind: z.literal('attachedCharacter') }),
  z.object({ kind: z.literal('thisCharacter') }),
]);

export const playConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('controlsBattlefield') }),
  z.object({
    kind: z.literal('spotCharacter'),
    color: colorSchema.optional(),
    unique: z.boolean().optional(),
    count: z.number().int().min(1).optional(),
  }),
  z.object({ kind: z.literal('spotCard'), cardId: z.string() }),
  z.object({ kind: z.literal('moreReadyCharacters') }),
  z.object({ kind: z.literal('firstActionOfRound') }),
  z.object({ kind: z.literal('opponentHasNoCards') }),
  z.object({ kind: z.literal('haveNCharactersInPlay'), count: z.number().int().min(1) }),
  z.object({ kind: z.literal('opponentHasNCharacters'), count: z.number().int().min(1) }),
]);

export const triggerEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('afterActivateCharacter'), ownOnly: z.boolean().optional() }),
  z.object({ kind: z.literal('afterActivateSupport'), ownOnly: z.boolean().optional() }),
  z.object({
    kind: z.literal('afterPlayCard'),
    cardType: cardTypeSchema.optional(),
    color: colorSchema.optional(),
  }),
  z.object({ kind: z.literal('afterPlayUpgrade') }),
  z.object({
    kind: z.literal('afterCharacterDefeated'),
    whose: z.enum(['own', 'opponent', 'any']).optional(),
  }),
  z.object({ kind: z.literal('afterDieRolledSymbol'), symbol: dieSymbolSchema }),
  z.object({ kind: z.literal('afterResolveDie') }),
  z.object({ kind: z.literal('afterClaimBattlefield') }),
  z.object({ kind: z.literal('afterRemoveDice') }),
  z.object({ kind: z.literal('afterDealDamage') }),
  z.object({ kind: z.literal('afterTakeDamage') }),
  z.object({
    kind: z.literal('beforeCharacterDefeated'),
    whose: z.enum(['own', 'opponent', 'any']).optional(),
  }),
  z.object({ kind: z.literal('beforeTakeDamage') }),
  z.object({ kind: z.literal('beforeActivate') }),
  z.object({ kind: z.literal('beforeResolve') }),
  z.object({ kind: z.literal('setup') }),
]);

export const actionCostSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('exhaust') }),
  z.object({ kind: z.literal('removeDie') }).passthrough(),
  z.object({ kind: z.literal('spendResources'), amount: z.number().int().min(1) }),
  z.object({ kind: z.literal('discardCard') }),
  z.object({ kind: z.literal('dealDamageToSelf'), amount: z.number().int().min(1) }),
]);

export const valueRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('literal'), value: z.number().int().min(0) }),
  z.object({ kind: z.literal('countDice') }).passthrough(),
  z.object({ kind: z.literal('countCharacters') }).passthrough(),
  z.object({ kind: z.literal('countCards') }).passthrough(),
  z.object({ kind: z.literal('dieValue') }),
]);

export const cardDispositionSchema = z.enum([
  'discard',
  'setAside',
  'returnToDeckBottom',
]);

// ────────────────────────────────────────────────────────────────────
// Effect — discriminated on `op`
// First-wave ops are fully typed. Stub ops use passthrough() so card
// authors can add fields before the engine implements them.
// ────────────────────────────────────────────────────────────────────

const dealDamageEffect = z.object({
  op: z.literal('dealDamage'),
  amount: z.number().int().min(1).max(99),
  damageType: z.enum(['melee', 'ranged', 'indirect', 'unspecified']).default('unspecified'),
  target: targetSpecSchema.default({ kind: 'opponentCharacter' }),
  unblockable: z.boolean().default(false),
  optional: z.boolean().default(false),
});

const addShieldsEffect = z.object({
  op: z.literal('addShields'),
  amount: z.number().int().min(1).max(3),
  target: targetSpecSchema.default({ kind: 'ownCharacter' }),
  optional: z.boolean().default(false),
});

const removeShieldsEffect = z.object({
  op: z.literal('removeShields'),
  amount: z.union([z.literal('all'), z.number().int().min(1).max(3)]),
  target: targetSpecSchema.default({ kind: 'anyCharacter' }),
  optional: z.boolean().default(false),
});

const drawCardsEffect = z.object({
  op: z.literal('drawCards'),
  player: z.enum(['self', 'eachPlayer', 'opponent']).default('self'),
  amount: z.number().int().min(1).max(20).nullable().default(null),
  toHandSize: z.boolean().default(false),
  optional: z.boolean().default(false),
});

const gainResourcesEffect = z.object({
  op: z.literal('gainResources'),
  amount: z.number().int().min(1).max(99),
  optional: z.boolean().default(false),
});

const loseResourcesEffect = z.object({
  op: z.literal('loseResources'),
  amount: z.union([z.literal('all'), z.number().int().min(1).max(99)]),
  target: z.enum(['opponent', 'self']).default('opponent'),
  optional: z.boolean().default(false),
});

const healDamageEffect = z.object({
  op: z.literal('healDamage'),
  amount: z.number().int().min(1).max(99),
  target: targetSpecSchema.default({ kind: 'ownCharacter' }),
  optional: z.boolean().default(false),
});

// ENGINE-6b: event-owned and cross-card die roll ops.
const rollEventDieEffect = z.object({
  op: z.literal('rollEventDie'),
  optional: z.boolean().default(false),
});

const rollCardDieEffect = z.object({
  op: z.literal('rollCardDie'),
  cardId: z.string().min(1),
  optional: z.boolean().default(false),
});

// ENGINE-D1: dice pool manipulation schemas.
const diePoolSide = z.enum(['ownPool', 'opponentPool']);

const removeDieEffect = z.object({
  op: z.literal('removeDie'),
  from: diePoolSide,
  symbol: dieSymbolSchema.optional(),
  count: z.number().int().min(1).optional(),
  optional: z.boolean().default(false),
});

const turnDieEffect = z.object({
  op: z.literal('turnDie'),
  from: diePoolSide,
  toSymbol: dieSymbolSchema,
  fromSymbol: dieSymbolSchema.optional(),
  count: z.number().int().min(1).optional(),
  optional: z.boolean().default(false),
});

const modifyDieValueEffect = z.object({
  op: z.literal('modifyDieValue'),
  from: diePoolSide,
  delta: z.number().int(),
  symbol: dieSymbolSchema.optional(),
  count: z.number().int().min(1).optional(),
  optional: z.boolean().default(false),
});

// Stub helper: op name + optional flag + any additional fields.
function stub(op: string) {
  return z.object({ op: z.literal(op), optional: z.boolean().default(false) }).passthrough();
}

// Authoring placeholder — not dispatched, records intent for future ops.
const newOpEffect = z.object({
  op: z.literal('new'),
  workingName: z.string().min(1).max(60),
  notes: z.string().default(''),
});

export const effectSchema: z.ZodType<Effect> = z.discriminatedUnion('op', [
  // First-wave (ENGINE-6)
  dealDamageEffect,
  addShieldsEffect,
  removeShieldsEffect,
  drawCardsEffect,
  gainResourcesEffect,
  loseResourcesEffect,
  healDamageEffect,
  // ENGINE-6b: die roll ops
  rollEventDieEffect,
  rollCardDieEffect,
  // Stub ops
  removeDieEffect,
  stub('rerollDice'),
  turnDieEffect,
  stub('resolveDie'),
  stub('resolveWithoutRemoving'),
  stub('rollDie'),
  stub('activateCharacter'),
  stub('exhaustCard'),
  stub('readyCard'),
  stub('moveDamage'),
  stub('moveShields'),
  stub('discardCards'),
  stub('discardFromDeck'),
  stub('lookAtCards'),
  stub('revealTopCard'),
  stub('searchDeck'),
  stub('playCard'),
  stub('returnToHand'),
  stub('takeBattlefieldControl'),
  stub('claimBattlefield'),
  stub('endActionPhase'),
  stub('takeAdditionalActions'),
  stub('forceActivate'),
  stub('grantKeyword'),
  modifyDieValueEffect,
  stub('setAsideDie'),
  stub('placeDamageOnCard'),
  stub('placeResourceOnCard'),
  stub('returnDefeatedCharacter'),
  stub('choice'),
  newOpEffect,
] as const) as z.ZodType<Effect>;

/** Op names with live dispatcher support. Used by the admin UI. */
export const KNOWN_OPS = [
  'gainResources',
  'loseResources',
  'drawCards',
  'dealDamage',
  'addShields',
  'removeShields',
  'healDamage',
  'rollEventDie',
  'rollCardDie',
  'removeDie',
  'turnDie',
  'modifyDieValue',
] as const;
export type KnownOp = (typeof KNOWN_OPS)[number];

/** Which target kinds require a character to be pre-selected by the player. */
export const CHARACTER_SELECTION_TARGETS: ReadonlySet<TargetSpec['kind']> = new Set([
  'ownCharacter',
  'opponentCharacter',
  'anyCharacter',
  'attachedCharacter',
  'thisCharacter',
]);

// ────────────────────────────────────────────────────────────────────
// Ability — discriminated on `kind`
// ────────────────────────────────────────────────────────────────────

const immediateAbility = z.object({
  kind: z.literal('immediate'),
  playCondition: playConditionSchema.optional(),
  effects: z.array(effectSchema),
  cardDisposition: cardDispositionSchema.optional(),
});

const triggeredAbility = z.object({
  kind: z.literal('triggered'),
  triggerEvent: triggerEventSchema,
  playCondition: playConditionSchema.optional(),
  effects: z.array(effectSchema),
  optional: z.boolean().default(false),
});

const actionAbility = z.object({
  kind: z.literal('action'),
  costs: z.array(actionCostSchema).default([]),
  playCondition: playConditionSchema.optional(),
  effects: z.array(effectSchema),
  optional: z.boolean().default(false),
});

const powerActionAbility = z.object({
  kind: z.literal('powerAction'),
  costs: z.array(actionCostSchema).default([]),
  playCondition: playConditionSchema.optional(),
  effects: z.array(effectSchema),
  optional: z.boolean().default(false),
});

const specialAbility = z.object({
  kind: z.literal('special'),
  effects: z.array(effectSchema),
  optional: z.boolean().default(false),
});

// Passive abilities describe always-on state. The engine reads `description`
// as a tag; other fields are open-ended for future resolver config.
const passiveAbility = z
  .object({ kind: z.literal('passive'), description: z.string() })
  .passthrough();

const claimAbility = z.object({
  kind: z.literal('claim'),
  effects: z.array(effectSchema),
  optional: z.boolean().default(false),
});

export const abilitySchema: z.ZodType<Ability> = z.discriminatedUnion('kind', [
  immediateAbility,
  triggeredAbility,
  actionAbility,
  powerActionAbility,
  specialAbility,
  passiveAbility,
  claimAbility,
] as const) as z.ZodType<Ability>;

export type { Ability } from '@prophecy/game-engine';

// ────────────────────────────────────────────────────────────────────
// Card
// ────────────────────────────────────────────────────────────────────

export const cardSchema = z
  .object({
    id: z.string().min(1).max(40),
    name: z.string().min(1).max(80),
    type: cardTypeSchema,
    subtypes: z.array(z.string().max(80)).default([]),
    faction: factionSchema,
    color: colorSchema.nullable(),
    rarity: raritySchema,
    cost: z.number().int().min(0).max(20).nullable().default(null),
    health: z.number().int().min(1).max(99).nullable().default(null),
    /** Stability for support cards. null for all other card types. */
    stability: z.number().int().min(1).max(99).nullable().default(null),
    pointValue: z.number().int().min(1).max(99).nullable().default(null),
    elitePointValue: z.number().int().min(1).max(99).nullable().default(null),
    plotPointValue: z.number().int().min(-5).max(5).nullable().default(null),
    isUnique: z.boolean().default(false),
    keywords: z.array(keywordSchema).default([]),
    displayText: z.string().default(''),
    dieFaces: z
      .tuple([
        dieFaceSchema,
        dieFaceSchema,
        dieFaceSchema,
        dieFaceSchema,
        dieFaceSchema,
        dieFaceSchema,
      ])
      .nullable()
      .default(null),
    abilities: z.array(abilitySchema).default([]),
    artUrl: z.string().url().nullable().optional().default(null),
    artFrameX: z.number().min(0).max(100).nullable().optional().default(null),
    artFrameY: z.number().min(0).max(100).nullable().optional().default(null),
    artFrameZoom: z.number().min(1).max(4).nullable().optional().default(null),
    cardFrameX: z.number().min(0).max(100).nullable().optional().default(null),
    cardFrameY: z.number().min(0).max(100).nullable().optional().default(null),
    cardFrameZoom: z.number().min(1).max(4).nullable().optional().default(null),
    badgeFrameX: z.number().min(0).max(100).nullable().optional().default(null),
    badgeFrameY: z.number().min(0).max(100).nullable().optional().default(null),
    badgeFrameZoom: z.number().min(1).max(4).nullable().optional().default(null),
    landscapeFrameX: z.number().min(0).max(100).nullable().optional().default(null),
    landscapeFrameY: z.number().min(0).max(100).nullable().optional().default(null),
    landscapeFrameZoom: z.number().min(1).max(4).nullable().optional().default(null),
  })
  .strict();
export type Card = z.infer<typeof cardSchema>;

export const cardCatalogSchema = z.object({ cards: z.array(cardSchema) });
export type CardCatalog = z.infer<typeof cardCatalogSchema>;

// ────────────────────────────────────────────────────────────────────
// Attribute catalog
// ────────────────────────────────────────────────────────────────────

export const attributeCatalogSchema = z.object({
  subtypes: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
  factions: z.array(z.string()).default([]),
  rarities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});
export type AttributeCatalog = z.infer<typeof attributeCatalogSchema>;

// ────────────────────────────────────────────────────────────────────
// Deck
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

export const deckCatalogSchema = z.object({ decks: z.array(deckSchema) });
export type DeckCatalog = z.infer<typeof deckCatalogSchema>;
