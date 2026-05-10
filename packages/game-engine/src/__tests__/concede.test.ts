import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'concede-test' }));
}

describe('applyAction({ type: "concede" })', () => {
  it('1v1: the opponent wins immediately with reason "concede"', () => {
    const initial = setup();
    const conceder = initial.playerOrder[0]!;
    const opponent = initial.playerOrder[1]!;

    const { state, events } = applyAction(initial, {
      type: 'concede',
      playerId: conceder,
    });

    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe(opponent);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('game.ended');
    expect(events[0]?.payload).toEqual({ winnerId: opponent, reason: 'concede' });
  });

  it("can be invoked outside the conceder's turn", () => {
    const initial = setup();
    const inactive = initial.playerOrder.find((id) => id !== initial.activePlayerId)!;
    const opponent = initial.playerOrder.find((id) => id !== inactive)!;
    const { state } = applyAction(initial, { type: 'concede', playerId: inactive });
    expect(state.winnerId).toBe(opponent);
    expect(state.phase).toBe('ended');
  });

  it('throws when the game has already ended', () => {
    const initial = setup();
    const ended = applyAction(initial, {
      type: 'concede',
      playerId: initial.playerOrder[0]!,
    }).state;
    expect(() =>
      applyAction(ended, { type: 'concede', playerId: initial.playerOrder[1]! }),
    ).toThrow(IllegalActionError);
  });

  it('throws when the playerId is not in the game', () => {
    const initial = setup();
    expect(() => applyAction(initial, { type: 'concede', playerId: 'eve' })).toThrow(
      /not in this game/,
    );
  });
});
