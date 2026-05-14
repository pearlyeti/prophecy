import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGameInActionPhase } from '../state/new-game.js';
import { basicGameInput } from './fixtures.js';

function gameWithHand(opts: {
  seed?: string;
  hand?: readonly string[];
  resources?: number;
  cardCosts?: Readonly<Record<string, number>>;
}) {
  const seed = opts.seed ?? 'play-card-test';
  // Drive setup so we know which player will be active first; both
  // players get the same hand override so we can assert against the
  // active player regardless of seat.
  const hand = opts.hand ?? ['alice.deck.0', 'alice.deck.1', 'alice.deck.2'];
  return newGameInActionPhase({
    ...basicGameInput({ seed }),
    ...(opts.cardCosts ? { cardCosts: opts.cardCosts } : {}),
    playerOverrides: {
      alice: { hand, resources: opts.resources ?? 5 },
      bob: { hand, resources: opts.resources ?? 5 },
    },
  });
}

describe('applyAction({ type: "play-card" })', () => {
  it('moves the card from hand to discard, decrements resources, rotates the turn', () => {
    const initial = gameWithHand({
      hand: ['alice.deck.0', 'alice.deck.1'],
      resources: 5,
      cardCosts: { 'alice.deck.0': 2 },
    });
    const active = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== active)!;

    const { state, events } = applyAction(initial, {
      type: 'play-card',
      playerId: active,
      cardId: 'alice.deck.0',
    });

    const me = state.players[active]!;
    expect(me.hand).toEqual(['alice.deck.1']);
    expect(me.discard).toEqual(['alice.deck.0']);
    expect(me.resources).toBe(3);

    expect(state.activePlayerId).toBe(opponent);
    expect(state.consecutivePasses).toBe(0);

    const played = events.find((e) => e.type === 'card.played');
    expect(played).toBeDefined();
    expect(played?.payload).toEqual({
      playerId: active,
      cardId: 'alice.deck.0',
      costPaid: 2,
    });
  });

  it('treats a card with no cost entry as cost 0', () => {
    const initial = gameWithHand({
      hand: ['alice.deck.0'],
      resources: 0,
      cardCosts: {}, // no entry for alice.deck.0
    });
    const active = initial.activePlayerId!;
    const { state } = applyAction(initial, {
      type: 'play-card',
      playerId: active,
      cardId: 'alice.deck.0',
    });
    expect(state.players[active]?.resources).toBe(0);
    expect(state.players[active]?.discard).toEqual(['alice.deck.0']);
  });

  it("throws when it is not the player's turn", () => {
    const initial = gameWithHand({});
    const inactive = initial.playerOrder.find((id) => id !== initial.activePlayerId)!;

    expect(() =>
      applyAction(initial, {
        type: 'play-card',
        playerId: inactive,
        cardId: 'alice.deck.0',
      }),
    ).toThrow(IllegalActionError);
  });

  it('throws when the card is not in the player’s hand', () => {
    const initial = gameWithHand({ hand: ['alice.deck.0'] });
    const active = initial.activePlayerId!;
    expect(() =>
      applyAction(initial, {
        type: 'play-card',
        playerId: active,
        cardId: 'not-in-hand',
      }),
    ).toThrow(/not in/);
  });

  it("throws when the player cannot afford the card's cost", () => {
    const initial = gameWithHand({
      hand: ['alice.deck.0'],
      resources: 1,
      cardCosts: { 'alice.deck.0': 5 },
    });
    const active = initial.activePlayerId!;
    expect(() =>
      applyAction(initial, {
        type: 'play-card',
        playerId: active,
        cardId: 'alice.deck.0',
      }),
    ).toThrow(/cannot afford/);
  });

  it('throws after the game has ended', () => {
    const initial = gameWithHand({});
    const active = initial.activePlayerId!;
    const ended = { ...initial, winnerId: active };
    expect(() =>
      applyAction(ended, {
        type: 'play-card',
        playerId: active,
        cardId: 'alice.deck.0',
      }),
    ).toThrow(/game has already ended/);
  });
});

describe('legal-actions.canPlayCard', () => {
  it('is false when no card in hand is affordable', async () => {
    const { getLegalActions } = await import('../state/legal-actions');
    const initial = gameWithHand({
      hand: ['alice.deck.0', 'alice.deck.1'],
      resources: 1,
      cardCosts: { 'alice.deck.0': 5, 'alice.deck.1': 3 },
    });
    const active = initial.activePlayerId!;
    expect(getLegalActions(initial, active).canPlayCard).toBe(false);
  });

  it('is true when at least one card is affordable', async () => {
    const { getLegalActions } = await import('../state/legal-actions');
    const initial = gameWithHand({
      hand: ['alice.deck.0', 'alice.deck.1'],
      resources: 3,
      cardCosts: { 'alice.deck.0': 5, 'alice.deck.1': 3 },
    });
    const active = initial.activePlayerId!;
    expect(getLegalActions(initial, active).canPlayCard).toBe(true);
  });
});
