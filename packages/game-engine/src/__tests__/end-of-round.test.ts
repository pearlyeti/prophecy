import { describe, expect, it } from 'vitest';

import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

// End-of-round loss check: a player with hand=0 and deck=0 after upkeep
// loses. Controller wins ties.

describe('end-of-round loss check', () => {
  it('opponent wins when one player ends a round with empty hand and deck', () => {
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'eor-1',
        playerOverrides: {
          bob: { handCount: 0, deckCount: 0 },
        },
      }),
    );

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;
    const winner = initial.playerOrder.find((id) => id !== 'bob')!;

    const a1 = applyAction(initial, { type: 'pass', playerId: first });
    const a2 = applyAction(a1.state, { type: 'pass', playerId: second });

    expect(a2.state.phase).toBe('ended');
    expect(a2.state.winnerId).toBe(winner);

    const ended = a2.events.find((e) => e.type === 'game.ended');
    expect(ended).toBeDefined();
    expect(ended?.payload).toEqual({
      winnerId: winner,
      reason: 'deck-and-hand-empty',
    });
  });

  it('battlefield controller wins when both players are simultaneously empty', () => {
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'eor-2',
        playerOverrides: {
          alice: { handCount: 0, deckCount: 0 },
          bob: { handCount: 0, deckCount: 0 },
        },
      }),
    );
    const controller = initial.battlefieldControllerId!;

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;

    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    expect(after.state.phase).toBe('ended');
    expect(after.state.winnerId).toBe(controller);
  });

  it('does not end the game when neither player is empty', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'eor-3' }));

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;

    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    expect(after.state.phase).toBe('action');
    expect(after.state.winnerId).toBeNull();
    expect(after.state.roundNumber).toBe(2);
  });
});
