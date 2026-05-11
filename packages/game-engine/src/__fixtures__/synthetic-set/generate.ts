// Procedural generator for the synthetic-set fixtures.
//
// Run with `pnpm --filter @prophecy/game-engine fixtures:generate`.
// Output is committed; regenerate when the abstract templates change.
//
// Determinism: every random choice goes through the engine's seeded
// RNG (createRng) so the same SEED produces byte-identical output.
//
// Originality: every card is built from abstract templates expressed
// as small enums (TriggerEvent, EffectOp, etc.). No card-by-card
// translation of any external data — the generator does not read any
// external source.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRng, type SeededRng } from '../../rng/seeded-rng';
import {
  BATTLEFIELD_NAMES,
  CHARACTER_NAMES,
  EVENT_NAMES,
  PLOT_NAMES,
  SUPPORT_NAMES,
  UPGRADE_NAMES,
  assertPoolSize,
  type NamePool,
} from './names';
import {
  CardSetSchema,
  type AbilityAst,
  type CardFixture,
  type CostAst,
  type EffectAst,
} from './schema';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const SEED = 'prophecy.synthetic-set.v1';
const VERSION = '1.0.0';

const TARGET_COUNTS = {
  character: 28,
  upgrade: 38,
  support: 16,
  event: 50,
  plot: 6,
  battlefield: 10,
} as const satisfies Record<CardFixture['type'], number>;

type Faction = CardFixture['faction'];
type Color = CardFixture['color'];
type Rarity = CardFixture['rarity'];
type Subtype = CardFixture['subtypes'][number];

const FACTIONS: Faction[] = ['light', 'shadow', 'neutral'];
const COLORS: Color[] = ['red', 'blue', 'yellow', 'gray'];
const SUBTYPES: Subtype[] = ['Olympian', 'Aesir', 'Vanir', 'Titan', 'Giant'];

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function weightedPick<T extends string>(rng: SeededRng, weights: Readonly<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  let total = 0;
  for (const [, w] of entries) total += w;
  if (total <= 0) throw new Error('weightedPick: zero total weight');
  let r = rng.next() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[0]![0];
}

function pickInt(rng: SeededRng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

function pickOneOf<T>(rng: SeededRng, options: readonly T[]): T {
  if (options.length === 0) throw new Error('pickOneOf: empty array');
  return options[Math.floor(rng.next() * options.length)]!;
}

function maybe(rng: SeededRng, probability: number): boolean {
  return rng.next() < probability;
}

// ────────────────────────────────────────────────────────────────────
// Picks
// ────────────────────────────────────────────────────────────────────

function pickFaction(rng: SeededRng): Faction {
  return weightedPick(rng, { light: 4, shadow: 4, neutral: 2 });
}

function pickColor(rng: SeededRng, faction: Faction): Color {
  if (faction === 'neutral') {
    return weightedPick(rng, { gray: 6, red: 1, blue: 1, yellow: 1 } as Record<Color, number>);
  }
  return weightedPick(rng, { red: 3, blue: 3, yellow: 3, gray: 1 } as Record<Color, number>);
}

function pickRarity(rng: SeededRng): Rarity {
  return weightedPick(rng, {
    common: 50,
    uncommon: 30,
    rare: 14,
    legendary: 5,
    fixed: 1,
  } as Record<Rarity, number>);
}

function pickSubtypes(rng: SeededRng, type: CardFixture['type']): Subtype[] {
  if (type === 'event' || type === 'battlefield' || type === 'plot') {
    return maybe(rng, 0.3) ? [pickOneOf(rng, SUBTYPES)] : [];
  }
  const count = weightedPick(rng, { 0: 1, 1: 5, 2: 3 } as Record<string, number>);
  const n = Number(count);
  const picks = new Set<Subtype>();
  while (picks.size < n) picks.add(pickOneOf(rng, SUBTYPES));
  return Array.from(picks);
}

// ────────────────────────────────────────────────────────────────────
// Dice generation
// ────────────────────────────────────────────────────────────────────

type DieFace = NonNullable<CardFixture['dieFaces']>[number];
type SymbolProfile = 'damage-melee' | 'damage-ranged' | 'support' | 'mixed' | 'utility';

const SYMBOL_WEIGHTS: Record<SymbolProfile, Record<DieFace['symbol'], number>> = {
  'damage-melee': {
    melee: 6, ranged: 1, indirect: 1, shield: 2, resource: 1, disrupt: 1,
    discard: 0, focus: 1, special: 2, blank: 2,
  },
  'damage-ranged': {
    melee: 1, ranged: 6, indirect: 1, shield: 2, resource: 1, disrupt: 1,
    discard: 0, focus: 1, special: 2, blank: 2,
  },
  support: {
    melee: 1, ranged: 1, indirect: 0, shield: 2, resource: 5, disrupt: 1,
    discard: 1, focus: 2, special: 2, blank: 2,
  },
  mixed: {
    melee: 3, ranged: 3, indirect: 1, shield: 2, resource: 2, disrupt: 1,
    discard: 1, focus: 1, special: 2, blank: 2,
  },
  utility: {
    melee: 1, ranged: 1, indirect: 1, shield: 1, resource: 1, disrupt: 2,
    discard: 2, focus: 3, special: 3, blank: 2,
  },
};

function generateDieFaces(rng: SeededRng, profile: SymbolProfile): [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace] {
  const faces: DieFace[] = [];
  const seenSymbols = new Set<DieFace['symbol']>();
  // Always include at least one blank or low-value face for balance.
  let blankInserted = false;
  while (faces.length < 6) {
    const symbol = weightedPick(rng, SYMBOL_WEIGHTS[profile]);
    const isBlank = symbol === 'blank';
    if (isBlank && blankInserted) continue;
    if (isBlank) blankInserted = true;

    let value = 0;
    let cost = 0;
    let modifier = false;
    if (!isBlank && symbol !== 'special') {
      value = pickInt(rng, 1, 3);
      // Higher-value faces sometimes cost resources to resolve.
      if (value >= 2 && maybe(rng, 0.25)) cost = 1;
      // Sometimes a face is a modifier (+N alongside a non-modifier).
      if (!seenSymbols.has(symbol) && faces.length > 0 && maybe(rng, 0.15)) {
        modifier = true;
      }
    }
    faces.push({ symbol, value, cost, modifier });
    seenSymbols.add(symbol);
  }
  // Force a blank if we somehow ended without one (rare for utility).
  if (!faces.some((f) => f.symbol === 'blank')) {
    faces[faces.length - 1] = { symbol: 'blank', value: 0, cost: 0, modifier: false };
  }
  return faces as [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];
}

// ────────────────────────────────────────────────────────────────────
// Ability generation
// ────────────────────────────────────────────────────────────────────

function generateEffect(rng: SeededRng): EffectAst {
  const kind = weightedPick(rng, {
    'deal-damage': 5,
    'gain-resources': 3,
    'lose-resources-opponent': 2,
    'gain-shields': 2,
    'heal': 2,
    'draw-cards': 2,
    'discard-cards-opponent': 1,
    'reroll-dice': 2,
    'remove-die': 2,
    'resolve-die': 2,
    'ready-character': 1,
    'exhaust-character': 1,
    'turn-die': 1,
  } as Record<string, number>);

  switch (kind) {
    case 'deal-damage':
      return {
        op: 'deal-damage',
        amount: pickInt(rng, 1, 3),
        target: pickOneOf(rng, [
          'self.character',
          'opponent.character',
          'opponent.any-character',
          'any-character',
        ] as const),
      };
    case 'gain-resources':
      return { op: 'gain-resources', amount: pickInt(rng, 1, 2) };
    case 'lose-resources-opponent':
      return { op: 'lose-resources-opponent', amount: pickInt(rng, 1, 2) };
    case 'gain-shields':
      return {
        op: 'gain-shields',
        amount: pickInt(rng, 1, 2),
        target: pickOneOf(rng, ['self.character', 'self.any-character'] as const),
      };
    case 'heal':
      return {
        op: 'heal',
        amount: pickInt(rng, 1, 3),
        target: pickOneOf(rng, ['self', 'self.character', 'self.any-character'] as const),
      };
    case 'draw-cards':
      return { op: 'draw-cards', amount: pickInt(rng, 1, 2) };
    case 'discard-cards-opponent':
      return { op: 'discard-cards-opponent', amount: pickInt(rng, 1, 2) };
    case 'reroll-dice':
      return { op: 'reroll-dice', count: pickOneOf(rng, ['any', 1, 2] as const) };
    case 'remove-die':
      return { op: 'remove-die', from: pickOneOf(rng, ['opponent.pool', 'self.pool'] as const) };
    case 'resolve-die':
      return { op: 'resolve-die', from: pickOneOf(rng, ['self.pool', 'self.upgrade-dice'] as const) };
    case 'ready-character':
      return { op: 'ready-character', target: 'self.character' };
    case 'exhaust-character':
      return { op: 'exhaust-character', target: 'opponent.character' };
    case 'turn-die':
      return { op: 'turn-die', count: pickInt(rng, 1, 2) };
    default:
      return { op: 'gain-resources', amount: 1 };
  }
}

function generateAbility(rng: SeededRng, type: CardFixture['type']): AbilityAst {
  // Pick a template kind appropriate to the card type.
  const kindWeights: Record<string, number> = {
    'action': type === 'support' || type === 'character' ? 4 : 1,
    'power-action': type === 'support' ? 2 : 0,
    'claim': type === 'battlefield' ? 8 : 0,
    'ongoing': type === 'plot' || type === 'support' ? 4 : type === 'upgrade' ? 2 : 1,
    'triggered.after': type === 'character' || type === 'upgrade' ? 4 : 2,
    'triggered.before': type === 'character' || type === 'upgrade' ? 2 : 1,
    'inherent.die': type === 'upgrade' || type === 'character' ? 1 : 0,
    'special': 0, // attached separately when a die has a special face
    'keyword': type === 'upgrade' || type === 'character' || type === 'event' ? 2 : 0,
  };
  // Filter out zero-weight options
  const nonZero = Object.fromEntries(
    Object.entries(kindWeights).filter(([, w]) => w > 0),
  );
  const kind = weightedPick(rng, nonZero);

  const cost: CostAst[] = [];
  if (kind === 'action' && maybe(rng, 0.4)) cost.push({ op: 'exhaust-self' });
  if (kind === 'action' && maybe(rng, 0.3)) cost.push({ op: 'spend-resources', amount: pickInt(rng, 1, 2) });

  switch (kind) {
    case 'action':
      return { kind: 'action', cost, may: false, effect: [generateEffect(rng)] };
    case 'power-action':
      return { kind: 'power-action', cost, may: false, effect: [generateEffect(rng)] };
    case 'claim':
      return { kind: 'claim', may: true, effect: [generateEffect(rng)] };
    case 'ongoing':
      return { kind: 'ongoing', conditions: [], effect: [generateEffect(rng)] };
    case 'triggered.after':
      return {
        kind: 'triggered.after',
        trigger: {
          event: pickOneOf(rng, ['activate', 'play-card', 'damage-dealt', 'gain-shields'] as const),
          subject: pickOneOf(rng, ['self', 'opponent.any', 'any'] as const),
        },
        conditions: [],
        may: maybe(rng, 0.5),
        effect: [generateEffect(rng)],
      };
    case 'triggered.before':
      return {
        kind: 'triggered.before',
        trigger: {
          event: pickOneOf(rng, ['character-defeated', 'gain-shields'] as const),
          subject: 'self',
        },
        conditions: [],
        may: maybe(rng, 0.5),
        effect: [generateEffect(rng)],
      };
    case 'inherent.die':
      return { kind: 'inherent.die', effect: [generateEffect(rng)] };
    case 'keyword':
      return {
        kind: 'keyword',
        keyword: pickOneOf(rng, ['ambush', 'guardian', 'modify', 'redeploy'] as const),
      };
    default:
      return { kind: 'ongoing', conditions: [], effect: [generateEffect(rng)] };
  }
}

function generateAbilities(
  rng: SeededRng,
  type: CardFixture['type'],
  rarity: Rarity,
  hasDieWithSpecial: boolean,
): AbilityAst[] {
  // Rarer cards have more abilities. Events and battlefields are
  // ability-driven.
  let baseCount: number;
  if (type === 'event') baseCount = pickInt(rng, 1, 2);
  else if (type === 'battlefield') baseCount = 1;
  else if (type === 'plot') baseCount = 1;
  else {
    const byRarity: Record<Rarity, [number, number]> = {
      fixed: [0, 1], common: [0, 1], uncommon: [1, 1], rare: [1, 2], legendary: [2, 2],
    };
    const [lo, hi] = byRarity[rarity];
    baseCount = pickInt(rng, lo, hi);
  }

  const abilities: AbilityAst[] = [];
  for (let i = 0; i < baseCount; i++) abilities.push(generateAbility(rng, type));

  // If the die has a 'special' face, attach a special ability so the
  // engine has something to resolve when that side is rolled.
  if (hasDieWithSpecial) {
    abilities.push({ kind: 'special', effect: [generateEffect(rng)] });
  }

  return abilities;
}

// ────────────────────────────────────────────────────────────────────
// Per-type generators
// ────────────────────────────────────────────────────────────────────

function generateCharacter(rng: SeededRng, index: number, title: string): CardFixture {
  const faction = pickFaction(rng);
  const color = pickColor(rng, faction);
  const rarity = pickRarity(rng);
  const profile: SymbolProfile = pickOneOf(rng, ['damage-melee', 'damage-ranged', 'mixed', 'utility']);
  const dieFaces = generateDieFaces(rng, profile);
  const hasSpecial = dieFaces.some((f) => f.symbol === 'special');

  const pointValue = pickInt(rng, 6, 14);
  const elitePointValue = pointValue + pickInt(rng, 4, 8);
  const minH = Math.max(6, Math.floor(pointValue * 0.7));
  const maxH = Math.min(20, Math.floor(pointValue * 1.4));
  const health = pickInt(rng, Math.min(minH, maxH), maxH);

  return {
    id: `CHAR_${pad(index)}`,
    title,
    type: 'character',
    faction,
    color,
    rarity,
    cost: null,
    health,
    pointValue,
    elitePointValue,
    plotPointValue: null,
    isUnique: maybe(rng, rarity === 'legendary' ? 0.95 : rarity === 'rare' ? 0.7 : 0.3),
    subtypes: pickSubtypes(rng, 'character'),
    dieFaces,
    abilities: generateAbilities(rng, 'character', rarity, hasSpecial),
  };
}

function generateUpgrade(rng: SeededRng, index: number, title: string): CardFixture {
  const faction = pickFaction(rng);
  const color = pickColor(rng, faction);
  const rarity = pickRarity(rng);
  const hasDie = maybe(rng, 0.8);
  const profile: SymbolProfile = pickOneOf(rng, ['damage-melee', 'damage-ranged', 'mixed']);
  const dieFaces = hasDie ? generateDieFaces(rng, profile) : null;
  const hasSpecial = dieFaces ? dieFaces.some((f) => f.symbol === 'special') : false;

  return {
    id: `UPG_${pad(index)}`,
    title,
    type: 'upgrade',
    faction,
    color,
    rarity,
    cost: pickInt(rng, 1, 4),
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    isUnique: maybe(rng, rarity === 'legendary' ? 0.9 : rarity === 'rare' ? 0.5 : 0.2),
    subtypes: pickSubtypes(rng, 'upgrade'),
    dieFaces,
    abilities: generateAbilities(rng, 'upgrade', rarity, hasSpecial),
  };
}

function generateSupport(rng: SeededRng, index: number, title: string): CardFixture {
  const faction = pickFaction(rng);
  const color = pickColor(rng, faction);
  const rarity = pickRarity(rng);
  const hasDie = maybe(rng, 0.5);
  const profile: SymbolProfile = pickOneOf(rng, ['support', 'mixed', 'utility']);
  const dieFaces = hasDie ? generateDieFaces(rng, profile) : null;
  const hasSpecial = dieFaces ? dieFaces.some((f) => f.symbol === 'special') : false;

  return {
    id: `SUP_${pad(index)}`,
    title,
    type: 'support',
    faction,
    color,
    rarity,
    cost: pickInt(rng, 1, 4),
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    isUnique: maybe(rng, 0.3),
    subtypes: pickSubtypes(rng, 'support'),
    dieFaces,
    abilities: generateAbilities(rng, 'support', rarity, hasSpecial),
  };
}

function generateEvent(rng: SeededRng, index: number, title: string): CardFixture {
  const faction = pickFaction(rng);
  const color = pickColor(rng, faction);
  const rarity = pickRarity(rng);
  return {
    id: `EVT_${pad(index)}`,
    title,
    type: 'event',
    faction,
    color,
    rarity,
    cost: pickInt(rng, 0, 3),
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    isUnique: maybe(rng, 0.05),
    subtypes: pickSubtypes(rng, 'event'),
    dieFaces: null,
    abilities: generateAbilities(rng, 'event', rarity, false),
  };
}

function generatePlot(rng: SeededRng, index: number, title: string): CardFixture {
  const faction = pickFaction(rng);
  const color = pickColor(rng, faction);
  return {
    id: `PLT_${pad(index)}`,
    title,
    type: 'plot',
    faction,
    color,
    rarity: 'fixed',
    cost: null,
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: pickInt(rng, -2, 2),
    isUnique: true,
    subtypes: pickSubtypes(rng, 'plot'),
    dieFaces: null,
    abilities: generateAbilities(rng, 'plot', 'fixed', false),
  };
}

function generateBattlefield(rng: SeededRng, index: number, title: string): CardFixture {
  return {
    id: `BFD_${pad(index)}`,
    title,
    type: 'battlefield',
    faction: 'neutral',
    color: 'gray',
    rarity: pickRarity(rng),
    cost: null,
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    isUnique: true,
    subtypes: pickSubtypes(rng, 'battlefield'),
    dieFaces: null,
    abilities: generateAbilities(rng, 'battlefield', 'fixed', false),
  };
}

function pad(n: number): string {
  return n.toString().padStart(3, '0');
}

/**
 * Title-picker that hands out unique names from a deterministic shuffle
 * of the source pool. Picking is per-pool so different card types can
 * reuse the same RNG strategy without colliding.
 */
function makeTitlePicker(rng: SeededRng, pool: NamePool, label: string, needed: number): () => string {
  assertPoolSize(pool, needed, label);
  // Fisher-Yates shuffle with the seeded RNG so output is reproducible.
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  let cursor = 0;
  return () => {
    if (cursor >= order.length) throw new Error(`name pool "${label}" exhausted`);
    return order[cursor++]!;
  };
}

// ────────────────────────────────────────────────────────────────────
// Driver
// ────────────────────────────────────────────────────────────────────

function generate(): { cards: CardFixture[]; version: string; seed: string; generatedAt: string } {
  const rng = createRng(SEED);

  const pickCharName = makeTitlePicker(rng.fork('names:char'), CHARACTER_NAMES, 'CHARACTER_NAMES', TARGET_COUNTS.character);
  const pickUpgName = makeTitlePicker(rng.fork('names:upg'), UPGRADE_NAMES, 'UPGRADE_NAMES', TARGET_COUNTS.upgrade);
  const pickSupName = makeTitlePicker(rng.fork('names:sup'), SUPPORT_NAMES, 'SUPPORT_NAMES', TARGET_COUNTS.support);
  const pickEvtName = makeTitlePicker(rng.fork('names:evt'), EVENT_NAMES, 'EVENT_NAMES', TARGET_COUNTS.event);
  const pickPltName = makeTitlePicker(rng.fork('names:plt'), PLOT_NAMES, 'PLOT_NAMES', TARGET_COUNTS.plot);
  const pickBfdName = makeTitlePicker(rng.fork('names:bfd'), BATTLEFIELD_NAMES, 'BATTLEFIELD_NAMES', TARGET_COUNTS.battlefield);

  const cards: CardFixture[] = [];
  for (let i = 1; i <= TARGET_COUNTS.character; i++) cards.push(generateCharacter(rng.fork(`char:${i}`), i, pickCharName()));
  for (let i = 1; i <= TARGET_COUNTS.upgrade; i++) cards.push(generateUpgrade(rng.fork(`upg:${i}`), i, pickUpgName()));
  for (let i = 1; i <= TARGET_COUNTS.support; i++) cards.push(generateSupport(rng.fork(`sup:${i}`), i, pickSupName()));
  for (let i = 1; i <= TARGET_COUNTS.event; i++) cards.push(generateEvent(rng.fork(`evt:${i}`), i, pickEvtName()));
  for (let i = 1; i <= TARGET_COUNTS.plot; i++) cards.push(generatePlot(rng.fork(`plt:${i}`), i, pickPltName()));
  for (let i = 1; i <= TARGET_COUNTS.battlefield; i++) cards.push(generateBattlefield(rng.fork(`bfd:${i}`), i, pickBfdName()));

  return {
    cards,
    version: VERSION,
    seed: SEED,
    generatedAt: new Date('2026-05-10T00:00:00.000Z').toISOString(),
  };
}

function main(): void {
  const { cards, version, seed, generatedAt } = generate();
  const set = { version, generatedAt, seed, cards };

  // Validate before writing — fail loudly if a template emits a
  // malformed AST.
  const parsed = CardSetSchema.safeParse(set);
  if (!parsed.success) {
    console.error('Generated set failed schema validation:');
    console.error(parsed.error.errors.slice(0, 10));
    process.exit(1);
  }

  const outPath = join(fileURLToPath(new URL('.', import.meta.url)), 'cards.json');
  writeFileSync(outPath, JSON.stringify(parsed.data, null, 2) + '\n');

  const byType = parsed.data.cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Wrote ${parsed.data.cards.length} cards to ${outPath}`);
  console.log('Distribution:', byType);
}

main();
