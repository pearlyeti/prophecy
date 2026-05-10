import { z } from 'zod';

// Canonical enum value lists. Drizzle's pgEnum and Zod's z.enum both
// consume these so the database, the API surface, and validation share
// one source of truth.

export const FACTIONS = ['light', 'shadow', 'neutral'] as const;
export const COLORS = ['red', 'blue', 'yellow', 'gray'] as const;
export const CARD_TYPES = [
  'character',
  'upgrade',
  'support',
  'event',
  'plot',
  'battlefield',
] as const;
export const DIE_SYMBOLS = [
  'melee',
  'ranged',
  'indirect',
  'shield',
  'resource',
  'disrupt',
  'discard',
  'focus',
  'special',
  'blank',
] as const;
export const RARITIES = ['fixed', 'common', 'uncommon', 'rare', 'legendary'] as const;
export const KEYWORDS = ['ambush', 'guardian', 'modify', 'redeploy'] as const;

export const factionSchema = z.enum(FACTIONS);
export const colorSchema = z.enum(COLORS);
export const cardTypeSchema = z.enum(CARD_TYPES);
export const dieSymbolSchema = z.enum(DIE_SYMBOLS);
export const raritySchema = z.enum(RARITIES);
export const keywordSchema = z.enum(KEYWORDS);

export type Faction = z.infer<typeof factionSchema>;
export type Color = z.infer<typeof colorSchema>;
export type CardType = z.infer<typeof cardTypeSchema>;
export type DieSymbol = z.infer<typeof dieSymbolSchema>;
export type Rarity = z.infer<typeof raritySchema>;
export type Keyword = z.infer<typeof keywordSchema>;

// Ability AST shape. Open-ended for now (only `kind` is required) so the
// schema can store ability rows that the engine doesn't yet have a
// resolver for. Concrete subtypes are added as resolvers land.
export const abilityAstSchema = z
  .object({ kind: z.string() })
  .passthrough();

export type AbilityAst = z.infer<typeof abilityAstSchema>;
