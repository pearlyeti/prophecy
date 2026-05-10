import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';

// End-of-round loss check: a player with hand=0 and deck=0 after upkeep
// loses. Controller wins ties.

describe('end-of-round loss check', () => {
  it('opponent wins when one player ends a round with empty hand and deck', () => {
    const initial = newGame({
      seed: 'eor-1',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'alice',
      playerOverrides: {
        bob: { handCount: 0, deckCount: 0 },
      },
    });

    const a1 = applyAction(initial, { type: 'pass', playerId: 'alice' });
    const a2 = applyAction(a1.state, { type: 'pass', playerId: 'bob' });

    expect(a2.state.phase).toBe('ended');
    expect(a2.state.winnerId).toBe('alice');

    const ended = a2.events.find((e) => e.type === 'game.ended');
    expect(ended).toBeDefined();
    expect(ended?.payload).toEqual({
      winnerId: 'alice',
      reason: 'deck-and-hand-empty',
    });
  });

  it('battlefield controller wins when both players are simultaneously empty', () => {
    const initial = newGame({
      seed: 'eor-2',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'bob',
      playerOverrides: {
        alice: { handCount: 0, deckCount: 0 },
        bob: { handCount: 0, deckCount: 0 },
      },
    });

    // Bob is controller and active. Bob passes, alice passes.
    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: 'bob' }).state,
      { type: 'pass', playerId: 'alice' },
    );

    expect(after.state.phase).toBe('ended');
    expect(after.state.winnerId).toBe('bob');
  });

  it('does not end the game when neither player is empty', () => {
    const initial = newGame({
      seed: 'eor-3',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'alice',
    });

    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: 'alice' }).state,
      { type: 'pass', playerId: 'bob' },
    );

    expect(after.state.phase).toBe('action');
    expect(after.state.winnerId).toBeNull();
    expect(after.state.roundNumber).toBe(2);
  });
});
