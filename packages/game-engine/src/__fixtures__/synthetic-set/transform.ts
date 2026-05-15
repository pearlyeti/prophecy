// Transform a local testing-cards.json file into our CardFixture[]
// shape. Run with:
//   pnpm --filter @prophecy/game-engine fixtures:transform
//
// Input  : ../../../../../testing-cards.json (repo root; gitignored)
// Output : ./cards.json (committed)
//
// What ports across:
//   - The titles, subtypes, dice profiles, stats, faction, color,
//     type, rarity, points/health that the input file already
//     supplies. The input file's substitution choices are preserved
//     verbatim — this script does not rename anything.
//
// What is dropped on purpose:
//   - `card_text` and `flavor`. The committed fixture does not carry
//     ability prose; abilities are stored as a typed AST list and we
//     hand-author those (or leave empty) rather than copying narrative
//     fields across.
//   - `summary_card_url`, `illustrator`, `set_detail`, `set_name`,
//     `set_number`, `subtitle`, `code`. Source-attribution fields that
//     have no engine use.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CardSetSchema,
  type CardFixture,
  type DieFaceSchema,
} from './schema.js';
import type { z } from 'zod';

type DieFace = z.infer<typeof DieFaceSchema>;

const VERSION = '2.0.0';

// ────────────────────────────────────────────────────────────────────
// Input shape (subset of fields we read from testing-cards.json)
// ────────────────────────────────────────────────────────────────────

interface SourceCard {
  readonly code: string;
  readonly name: string;
  readonly subtitle?: string;
  readonly affiliation: string; // "Hero" | "Villain" | "Neutral"
  readonly color: string; // "Command" | "Force" | "Rogue" | "General"
  readonly points_cost: string; // "12/15" or "0" or "" — depends on type
  readonly health: string | number; // "11" or ""
  readonly type: string; // "Character - Subtype X - Subtype Y."
  readonly rarity: string; // "Legendary" | "Rare" | "Uncommon" | "Common" | "Starter"
  readonly dice?: readonly { value: number; symbol: string }[];
  readonly card_text?: string;
}

// ────────────────────────────────────────────────────────────────────
// Mappings
// ────────────────────────────────────────────────────────────────────

const TYPE_MAP: Record<string, CardFixture['type']> = {
  Character: 'character',
  Upgrade: 'upgrade',
  Support: 'support',
  Event: 'event',
  Battlefield: 'battlefield',
  Plot: 'plot',
};

const AFFILIATION_MAP: Record<string, CardFixture['faction']> = {
  Hero: 'light',
  Villain: 'shadow',
  Neutral: 'neutral',
};

const COLOR_MAP: Record<string, CardFixture['color']> = {
  Command: 'red',
  Force: 'blue',
  Rogue: 'yellow',
  General: 'gray',
};

const RARITY_MAP: Record<string, CardFixture['rarity']> = {
  Legendary: 'legendary',
  Rare: 'rare',
  Uncommon: 'uncommon',
  Common: 'common',
  Starter: 'fixed',
};

const SYMBOL_MAP: Record<string, DieFace['symbol']> = {
  melee: 'melee',
  ranged: 'ranged',
  indirect: 'indirect',
  shield: 'shield',
  resource: 'resource',
  disrupt: 'disrupt',
  discard: 'discard',
  focus: 'focus',
  special: 'special',
  blank: 'blank',
};

const ID_PREFIX: Record<CardFixture['type'], string> = {
  character: 'CHAR',
  upgrade: 'UPG',
  support: 'SUP',
  event: 'EVT',
  battlefield: 'BFD',
  plot: 'PLT',
};

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function parseTypeAndSubtypes(raw: string): { type: CardFixture['type']; subtypes: string[] } {
  const parts = raw.replace(/\.$/, '').split(' - ').map((s) => s.trim()).filter(Boolean);
  const head = parts[0] ?? 'Event';
  const type = TYPE_MAP[head];
  if (!type) throw new Error(`unknown type segment: "${head}"`);
  return { type, subtypes: parts.slice(1) };
}

function parsePoints(raw: string): { pointValue: number | null; elitePointValue: number | null; cost: number | null } {
  if (!raw) return { pointValue: null, elitePointValue: null, cost: null };
  const segments = raw.split('/').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { pointValue: null, elitePointValue: null, cost: null };
  const first = Number(segments[0]);
  if (Number.isNaN(first)) return { pointValue: null, elitePointValue: null, cost: null };
  if (segments.length === 2) {
    return { pointValue: first, elitePointValue: Number(segments[1]), cost: null };
  }
  return { pointValue: first, elitePointValue: null, cost: null };
}

function parseHealth(raw: string | number): number | null {
  if (raw === '' || raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isNaN(n) ? null : n;
}

function toDieFaces(input: readonly { value: number; symbol: string }[] | undefined): CardFixture['dieFaces'] {
  if (!input || input.length === 0) return null;
  // Pad / truncate to exactly 6 faces. Source data should always have
  // exactly 6 for dice-bearing cards.
  const faces: DieFace[] = [];
  for (let i = 0; i < 6; i++) {
    const f = input[i];
    if (!f) {
      faces.push({ symbol: 'blank', value: 0, cost: 0, modifier: false });
      continue;
    }
    const symbol = SYMBOL_MAP[f.symbol] ?? 'blank';
    faces.push({ symbol, value: f.value ?? 0, cost: 0, modifier: false });
  }
  return faces as [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];
}

function inferIsUnique(type: CardFixture['type'], rarity: CardFixture['rarity']): boolean {
  // SWD convention encoded as a heuristic since the source data doesn't
  // carry an explicit "unique" flag: characters and most named supports
  // are unique; commons rarely are.
  if (type === 'character' || type === 'plot' || type === 'battlefield') return true;
  if (rarity === 'legendary' || rarity === 'rare') return type === 'support' || type === 'upgrade';
  return false;
}

function chooseCost(type: CardFixture['type'], pointValue: number | null): number | null {
  if (type === 'character' || type === 'battlefield' || type === 'plot') return null;
  // For non-character types the source's points_cost field IS the cost.
  return pointValue;
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────

const moduleDir = fileURLToPath(new URL('.', import.meta.url));
const INPUT_PATH = join(moduleDir, '..', '..', '..', '..', '..', 'testing-cards.json');
const OUTPUT_PATH = join(moduleDir, 'cards.json');

function main(): void {
  const raw = JSON.parse(readFileSync(INPUT_PATH, 'utf8')) as readonly SourceCard[];
  if (!Array.isArray(raw)) throw new Error('expected an array in testing-cards.json');

  const counts: Record<CardFixture['type'], number> = {
    character: 0,
    upgrade: 0,
    support: 0,
    event: 0,
    battlefield: 0,
    plot: 0,
  };

  const cards: CardFixture[] = [];
  for (const src of raw) {
    const { type, subtypes } = parseTypeAndSubtypes(src.type);
    counts[type] += 1;
    const idx = counts[type].toString().padStart(3, '0');
    const id = `${ID_PREFIX[type]}_${idx}`;

    const rarity = RARITY_MAP[src.rarity] ?? 'common';
    const faction = AFFILIATION_MAP[src.affiliation] ?? 'neutral';
    const color = COLOR_MAP[src.color] ?? 'gray';
    const { pointValue, elitePointValue } = parsePoints(src.points_cost);
    const cost = chooseCost(type, type === 'character' ? null : pointValue);

    const card: CardFixture = {
      id,
      title: src.name?.trim() || id,
      type,
      faction,
      color,
      rarity,
      cost,
      health: type === 'character' ? parseHealth(src.health) : null,
      stability: null,
      pointValue: type === 'character' ? pointValue : null,
      elitePointValue: type === 'character' ? elitePointValue : null,
      plotPointValue: type === 'plot' ? (pointValue ?? 0) : null,
      isUnique: inferIsUnique(type, rarity),
      subtypes: subtypes.slice(0, 3),
      dieFaces: type === 'character' || type === 'upgrade' || type === 'support'
        ? toDieFaces(src.dice)
        : null,
      displayText: (src.card_text ?? '').trim(),
      // Abilities (AST) are hand-authored — they're how the engine
      // dispatches behaviour. The printed prose lives in `displayText`
      // above. Wire ability AST for each card as engine resolvers land.
      abilities: [],
    };

    cards.push(card);
  }

  const set = {
    version: VERSION,
    generatedAt: new Date('2026-05-12T00:00:00.000Z').toISOString(),
    seed: 'transform:testing-cards.json',
    cards,
  };

  const parsed = CardSetSchema.safeParse(set);
  if (!parsed.success) {
    console.error('Transformed set failed schema validation:');
    console.error(parsed.error.errors.slice(0, 10));
    process.exit(1);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(parsed.data, null, 2) + '\n');
  console.log(`Wrote ${parsed.data.cards.length} cards to ${OUTPUT_PATH}`);
  console.log('Distribution:', counts);
}

main();
