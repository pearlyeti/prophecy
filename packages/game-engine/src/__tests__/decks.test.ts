import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CardSetSchema,
  DeckSetSchema,
  type DeckFixture,
} from '../__fixtures__/synthetic-set/schema';
import { validateDeck } from '../validators/deck';

const CARDS_PATH = new URL(
  '../__fixtures__/synthetic-set/cards.json',
  import.meta.url,
);
const DECKS_PATH = new URL(
  '../__fixtures__/synthetic-set/decks.json',
  import.meta.url,
);

const cards = CardSetSchema.parse(JSON.parse(readFileSync(CARDS_PATH, 'utf8'))).cards;
const deckSet = DeckSetSchema.parse(JSON.parse(readFileSync(DECKS_PATH, 'utf8')));

describe('deck fixtures', () => {
  it('parses both decks against DeckSetSchema', () => {
    expect(deckSet.decks).toHaveLength(2);
    expect(deckSet.decks[0]!.id).toBe('DECK_A');
    expect(deckSet.decks[1]!.id).toBe('DECK_B');
  });

  it.each(['DECK_A', 'DECK_B'])('deck %s passes legality validation', (id) => {
    const deck = deckSet.decks.find((d) => d.id === id)!;
    const result = validateDeck(cards, deck);
    if (!result.valid) {
      console.error(`[${id}] errors:`, result.errors);
    }
    expect(result.valid, `${id} should be legal`).toBe(true);
    expect(result.stats.deckCardTotal).toBe(30);
    expect(result.stats.teamPointTotal).toBeLessThanOrEqual(30);
  });

  it.each(['DECK_A', 'DECK_B'])('deck %s has at least one elite character', (id) => {
    const deck = deckSet.decks.find((d) => d.id === id)!;
    expect(deck.characters.some((c) => c.elite)).toBe(true);
  });

  it.each(['DECK_A', 'DECK_B'])('deck %s has a healthy cost curve', (id) => {
    const deck = deckSet.decks.find((d) => d.id === id)!;
    const { costCurve } = validateDeck(cards, deck).stats;
    // 0-cost cards are essential — Prophecy's economy expects them.
    expect((costCurve[0] ?? 0) + (costCurve[1] ?? 0)).toBeGreaterThanOrEqual(10);
    // No more than a couple of cards at cost 4+.
    const expensive = Object.entries(costCurve)
      .filter(([cost]) => Number(cost) >= 4)
      .reduce((s, [, n]) => s + n, 0);
    expect(expensive).toBeLessThanOrEqual(4);
  });
});

describe('validateDeck catches common mistakes', () => {
  function deckFrom(overrides: Partial<DeckFixture>): DeckFixture {
    const base = deckSet.decks[0]!;
    return { ...base, ...overrides };
  }

  it('rejects a deck that mixes Light and Shadow characters', () => {
    const lightChar = cards.find((c) => c.type === 'character' && c.faction === 'light')!;
    const shadowChar = cards.find((c) => c.type === 'character' && c.faction === 'shadow')!;
    const result = validateDeck(
      cards,
      deckFrom({
        characters: [
          { cardId: lightChar.id, elite: false },
          { cardId: shadowChar.id, elite: false },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /Light and Shadow/.test(e))).toBe(true);
  });

  it('rejects a deck with fewer than 30 cards', () => {
    const result = validateDeck(cards, deckFrom({ cards: [{ cardId: 'EVT_001', count: 2 }] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /must be exactly 30/.test(e))).toBe(true);
  });

  it('rejects a deck with 3 copies of a card', () => {
    const overflowed = [...deckSet.decks[0]!.cards];
    // Mutate one entry to have count = 3 (not legal). Drop something to keep
    // total card count comparable to 30.
    const target = overflowed.findIndex((e) => e.count === 2);
    overflowed[target] = { ...overflowed[target]!, count: 3 };
    const result = validateDeck(cards, deckFrom({ cards: overflowed }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /must be 1-2|limit is 2/.test(e))).toBe(true);
  });
});
