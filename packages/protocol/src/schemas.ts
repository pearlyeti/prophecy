import { z } from 'zod';

// Shared Zod schemas. Keep validation rules here so client and server
// can share a single source of truth.

export const factionSchema = z.enum(['light', 'shadow', 'neutral']);
export const colorSchema = z.enum(['red', 'blue', 'yellow', 'gray']);
export const cardTypeSchema = z.enum([
  'character',
  'upgrade',
  'support',
  'event',
  'plot',
  'battlefield',
]);

export type Faction = z.infer<typeof factionSchema>;
export type Color = z.infer<typeof colorSchema>;
export type CardType = z.infer<typeof cardTypeSchema>;
