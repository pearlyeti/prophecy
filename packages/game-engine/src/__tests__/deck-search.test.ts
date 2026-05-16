import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action.js';
import { applyEffects } from '../abilities/dispatch.js';
import type { DispatchContext } from '../abilities/dispatch.js';
import { newGameInActionPhase } from '../state/new-game.js';
import type { GameState } from '../state/types.js';
import { basicGameInput } from './fixtures.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function setup(overrides: Parameters<typeof basicGameInput>[0] = {}) {
  return newGameInActionPhase(basicGameInput({ seed: 'deck-search-test', ...overrides }));
}

function ctx(state: GameState, playerId: string): DispatchContext {
  return { playerId, characterTargets: [] };
}

function activeAndOpp(state: GameState) {
  const active = state.activePlayerId!;
  const opp = state.playerOrder.find((id) => id !== active)!;
  return { active, opp };
}

/** Force a known deck order for the searching player. */
function withDeck(state: GameState, playerId: string, cardIds: string[]): GameState {
  const p = state.players[playerId]!;
  return { ...state, players: { ...state.players, [playerId]: { ...p, deck: cardIds } } };
}

// ── searchDeck sets pendingSearch ─────────────────────────────────────────

describe('searchDeck effect', () => {
  it('sets pendingSearch with revealed cards from own deck', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    const deckTop = ['card-a', 'card-b', 'card-c', 'card-d', 'card-e'];
    const state = withDeck(initial, active, deckTop);

    const { state: after, events } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 3, choices: [], defaultDisposition: 'shuffleIntoDeck' },
    ]);

    expect(after.pendingSearch).not.toBeNull();
    expect(after.pendingSearch!.revealedCardIds).toEqual(['card-a', 'card-b', 'card-c']);
    expect(after.pendingSearch!.waitingForPlayerId).toBe(active);
    expect(after.pendingSearch!.source).toBe('ownDeck');

    // Revealed cards removed from deck
    expect(after.players[active]!.deck).toEqual(['card-d', 'card-e']);

    // Events emitted
    expect(events.some((e) => e.type === 'deck.searched')).toBe(true);
    expect(events.some((e) => e.type === 'cards.revealed')).toBe(true);
  });

  it('sets pendingSearch waiting for the active player (not source) for opponentDeck', () => {
    const initial = setup();
    const { active, opp } = activeAndOpp(initial);
    const deckTop = ['opp-a', 'opp-b'];
    const state = withDeck(initial, opp, deckTop);

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'opponentDeck', revealCount: 2, choices: [], defaultDisposition: 'discard' },
    ]);

    expect(after.pendingSearch).not.toBeNull();
    expect(after.pendingSearch!.waitingForPlayerId).toBe(active);
    expect(after.pendingSearch!.revealedCardIds).toEqual(['opp-a', 'opp-b']);
    expect(after.players[opp]!.deck).toEqual([]);
  });

  it('reveals all cards when revealCount is "all"', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    const deck = ['x1', 'x2', 'x3'];
    const state = withDeck(initial, active, deck);

    const { state: after } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 'all', choices: [], defaultDisposition: 'shuffleIntoDeck' },
    ]);

    expect(after.pendingSearch!.revealedCardIds).toHaveLength(3);
    expect(after.players[active]!.deck).toHaveLength(0);
  });

  it('respects revealUntil early-stop by count of matching type', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    const deck = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const state = {
      ...withDeck(initial, active, deck),
      cardTypes: { c2: 'character' as const, c4: 'character' as const },
    };

    // Stop after revealing 1 character card — should stop at c2 (index 1)
    const { state: after } = applyEffects(state, ctx(state, active), [
      {
        op: 'searchDeck',
        source: 'ownDeck',
        revealCount: 10,
        revealUntil: { type: 'character', count: 1 },
        choices: [],
        defaultDisposition: 'shuffleIntoDeck',
      },
    ]);

    // c1 (no type match) + c2 (character, 1st match = stop)
    expect(after.pendingSearch!.revealedCardIds).toEqual(['c1', 'c2']);
  });

  it('suspends remaining effects until resolve-search is called', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    const deck = ['s1', 's2', 's3'];
    const state = withDeck(initial, active, deck);

    // Two effects: searchDeck followed by gainResources. gainResources should not run yet.
    const resourcesBefore = state.players[active]!.resources;
    const { state: after, events } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 2, choices: [], defaultDisposition: 'shuffleIntoDeck' },
      { op: 'gainResources', amount: 5 },
    ]);

    // Suspended — resources unchanged
    expect(after.players[active]!.resources).toBe(resourcesBefore);
    expect(after.pendingSearch!.remainingEffects).toHaveLength(1);
    expect(after.pendingSearch!.remainingEffects[0]).toMatchObject({ op: 'gainResources', amount: 5 });
    expect(events.some((e) => e.type === 'deck.searched')).toBe(true);
  });
});

// ── resolve-search ────────────────────────────────────────────────────────

describe('resolve-search action', () => {
  it('shuffles unchosen cards back into deck on shuffleIntoDeck default disposition', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    const deck = ['r1', 'r2', 'r3'];
    let state = withDeck(initial, active, deck);

    // Trigger search
    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 3, choices: [], defaultDisposition: 'shuffleIntoDeck' },
    ]));

    // Resolve with no selections → all 3 go back to deck via shuffleIntoDeck
    const result = applyAction(state, { type: 'resolve-search', playerId: active, selections: [] });

    expect(result.state.pendingSearch).toBeNull();
    // All 3 returned to deck (order may differ due to shuffle)
    expect(result.state.players[active]!.deck).toHaveLength(3);
    expect([...result.state.players[active]!.deck].sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('moves chosen card to hand when choice disposition is toHand', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['h1', 'h2', 'h3']);

    ({ state } = applyEffects(state, ctx(state, active), [
      {
        op: 'searchDeck',
        source: 'ownDeck',
        revealCount: 3,
        choices: [{ count: 1, disposition: 'toHand' }],
        defaultDisposition: 'shuffleIntoDeck',
      },
    ]));

    const result = applyAction(state, {
      type: 'resolve-search',
      playerId: active,
      selections: [{ choiceIndex: 0, cardIds: ['h2'] }],
    });

    expect(result.state.players[active]!.hand).toContain('h2');
    // h1 and h3 go back to deck
    const deck = result.state.players[active]!.deck;
    expect(deck).toContain('h1');
    expect(deck).toContain('h3');
    expect(deck).not.toContain('h2');
  });

  it('emits search.resolved event', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['e1', 'e2']);

    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 2, choices: [], defaultDisposition: 'discard' },
    ]));

    const { events } = applyAction(state, {
      type: 'resolve-search',
      playerId: active,
      selections: [],
    });

    expect(events.some((e) => e.type === 'search.resolved')).toBe(true);
  });

  it('discards unchosen cards when defaultDisposition is discard', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['d1', 'd2', 'd3']);

    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 3, choices: [], defaultDisposition: 'discard' },
    ]));

    const result = applyAction(state, { type: 'resolve-search', playerId: active, selections: [] });

    expect(result.state.players[active]!.discard).toEqual(expect.arrayContaining(['d1', 'd2', 'd3']));
    expect(result.state.players[active]!.deck).toHaveLength(0);
  });

  it('puts unchosen cards on top of deck when defaultDisposition is toTopOfDeck', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['t1', 't2', 't3', 't4']);

    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 3, choices: [], defaultDisposition: 'toTopOfDeck' },
    ]));

    const result = applyAction(state, { type: 'resolve-search', playerId: active, selections: [] });

    const deck = result.state.players[active]!.deck;
    // t1, t2, t3 go on top; t4 remains at bottom
    expect(deck.slice(0, 3).sort()).toEqual(['t1', 't2', 't3']);
    expect(deck[3]).toBe('t4');
  });

  it('puts unchosen cards at bottom of deck when defaultDisposition is toBottomOfDeck', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['b1', 'b2', 'b3', 'b4']);

    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 3, choices: [], defaultDisposition: 'toBottomOfDeck' },
    ]));

    const result = applyAction(state, { type: 'resolve-search', playerId: active, selections: [] });

    const deck = result.state.players[active]!.deck;
    // b4 remains at position 0; b1, b2, b3 appended at bottom
    expect(deck[0]).toBe('b4');
    expect(deck.slice(1).sort()).toEqual(['b1', 'b2', 'b3']);
  });

  it('resumes remaining effects after resolve', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['rem1', 'rem2']);

    // searchDeck then gainResources — resources should apply only after resolve
    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 2, choices: [], defaultDisposition: 'shuffleIntoDeck' },
      { op: 'gainResources', amount: 3 },
    ]));

    const resourcesBefore = state.players[active]!.resources;
    const result = applyAction(state, { type: 'resolve-search', playerId: active, selections: [] });

    expect(result.state.players[active]!.resources).toBe(resourcesBefore + 3);
  });

  it('throws IllegalActionError when wrong player tries to resolve', () => {
    const initial = setup();
    const { active, opp } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['x1', 'x2']);

    ({ state } = applyEffects(state, ctx(state, active), [
      { op: 'searchDeck', source: 'ownDeck', revealCount: 2, choices: [], defaultDisposition: 'discard' },
    ]));

    expect(() =>
      applyAction(state, { type: 'resolve-search', playerId: opp, selections: [] }),
    ).toThrow();
  });

  it('throws IllegalActionError for invalid choiceIndex', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['v1', 'v2']);

    ({ state } = applyEffects(state, ctx(state, active), [
      {
        op: 'searchDeck',
        source: 'ownDeck',
        revealCount: 2,
        choices: [{ count: 1, disposition: 'toHand' }],
        defaultDisposition: 'shuffleIntoDeck',
      },
    ]));

    expect(() =>
      applyAction(state, {
        type: 'resolve-search',
        playerId: active,
        selections: [{ choiceIndex: 5, cardIds: ['v1'] }],
      }),
    ).toThrow();
  });

  it('throws when card in selection is not in revealed set', () => {
    const initial = setup();
    const { active } = activeAndOpp(initial);
    let state = withDeck(initial, active, ['n1', 'n2']);

    ({ state } = applyEffects(state, ctx(state, active), [
      {
        op: 'searchDeck',
        source: 'ownDeck',
        revealCount: 2,
        choices: [{ count: 1, disposition: 'toHand' }],
        defaultDisposition: 'shuffleIntoDeck',
      },
    ]));

    expect(() =>
      applyAction(state, {
        type: 'resolve-search',
        playerId: active,
        selections: [{ choiceIndex: 0, cardIds: ['not-revealed'] }],
      }),
    ).toThrow();
  });
});
