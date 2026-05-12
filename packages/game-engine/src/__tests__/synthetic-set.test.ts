import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action';
import {
  CardSetSchema,
  type CardFixture,
} from '../__fixtures__/synthetic-set/schema';
import { newGameInActionPhase } from '../state/new-game';

// Loads the committed synthetic-set fixtures, validates them against
// the Zod schema, and pushes a sample through the engine to confirm
// the corpus is engine-loadable end-to-end.

const FIXTURES_PATH = new URL(
  '../__fixtures__/synthetic-set/cards.json',
  import.meta.url,
);

const raw = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as unknown;

describe('synthetic-set fixtures', () => {
  it('parses cleanly against CardSetSchema', () => {
    const parsed = CardSetSchema.safeParse(raw);
    if (!parsed.success) {
      // Log first few errors to make CI diagnosis easier.
      console.error(parsed.error.errors.slice(0, 5));
    }
    expect(parsed.success).toBe(true);
  });

  it('contains at least 140 cards', () => {
    const parsed = CardSetSchema.parse(raw);
    expect(parsed.cards.length).toBeGreaterThanOrEqual(140);
  });

  it('covers the core card types', () => {
    const parsed = CardSetSchema.parse(raw);
    const seen = new Set(parsed.cards.map((c) => c.type));
    // Plots are absent from some sets (the very first set didn't ship
    // any). Require the core five that any playable corpus needs.
    for (const t of ['character', 'upgrade', 'support', 'event', 'battlefield']) {
      expect(seen.has(t as CardFixture['type']), `missing type: ${t}`).toBe(true);
    }
  });

  it('covers every die symbol across the dice-bearing cards', () => {
    const parsed = CardSetSchema.parse(raw);
    const symbols = new Set<string>();
    for (const c of parsed.cards) {
      if (!c.dieFaces) continue;
      for (const f of c.dieFaces) symbols.add(f.symbol);
    }
    for (const s of [
      'melee', 'ranged', 'shield', 'resource', 'special', 'blank',
    ]) {
      expect(symbols.has(s)).toBe(true);
    }
  });

  it('keyword coverage when abilities are populated', () => {
    const parsed = CardSetSchema.parse(raw);
    const totalAbilities = parsed.cards.reduce((n, c) => n + c.abilities.length, 0);
    // The committed corpus may carry empty ability arrays (when sourced
    // from the local transformer that ports mechanical fields only).
    // Keyword coverage is only meaningful when abilities are populated.
    if (totalAbilities === 0) return;

    const keywords = new Set<string>();
    for (const c of parsed.cards) {
      for (const a of c.abilities) {
        if (a.kind === 'keyword') keywords.add(a.keyword);
      }
    }
    for (const k of ['ambush', 'guardian', 'modify', 'redeploy']) {
      expect(keywords.has(k)).toBe(true);
    }
  });

  it('titles are unique within each card type', () => {
    const parsed = CardSetSchema.parse(raw);
    const byType: Record<string, Set<string>> = {};
    for (const c of parsed.cards) {
      byType[c.type] ??= new Set();
      const set = byType[c.type]!;
      expect(set.has(c.title), `duplicate title "${c.title}" in ${c.type}`).toBe(false);
      set.add(c.title);
    }
  });

  it('runs a sampled character through newGame + activate', () => {
    const parsed = CardSetSchema.parse(raw);
    const characters = parsed.cards.filter(
      (c): c is CardFixture & { dieFaces: NonNullable<CardFixture['dieFaces']> } =>
        c.type === 'character' && c.dieFaces !== null,
    );
    expect(characters.length).toBeGreaterThan(1);

    const a = characters[0]!;
    const b = characters[1]!;
    const battlefield = parsed.cards.find((c) => c.type === 'battlefield')!;

    let state = newGameInActionPhase({
      seed: 'synthetic-smoke',
      playerIds: ['alice', 'bob'],
      playerCharacters: {
        alice: [{ id: 'alice.c1', cardId: a.id, elite: false, dieFaces: a.dieFaces }],
        bob: [{ id: 'bob.c1', cardId: b.id, elite: false, dieFaces: b.dieFaces }],
      },
      playerBattlefieldCardIds: { alice: battlefield.id, bob: battlefield.id },
    });

    const activePlayerId = state.activePlayerId!;
    const characterId = state.players[activePlayerId]!.characterOrder[0]!;

    const result = applyAction(state, {
      type: 'activate',
      playerId: activePlayerId,
      cardId: characterId,
    });

    expect(result.state.players[activePlayerId]!.diceInPool).toHaveLength(1);
    const rolled = result.state.players[activePlayerId]!.diceInPool[0]!;
    expect(rolled.cardId).toBe(a.id);
    // The rolled face must be one of the six faces on the source die.
    expect(a.dieFaces.some((f) => f.symbol === rolled.face.symbol && f.value === rolled.face.value)).toBe(true);
  });

  it('special-face / special-ability coherence when abilities are populated', () => {
    const parsed = CardSetSchema.parse(raw);
    const totalAbilities = parsed.cards.reduce((n, c) => n + c.abilities.length, 0);
    if (totalAbilities === 0) return;
    for (const c of parsed.cards) {
      const hasSpecialFace = c.dieFaces?.some((f) => f.symbol === 'special') ?? false;
      const hasSpecialAbility = c.abilities.some((a) => a.kind === 'special');
      if (hasSpecialFace) {
        expect(hasSpecialAbility, `${c.id} has a special face but no special ability`).toBe(true);
      }
    }
  });
});
