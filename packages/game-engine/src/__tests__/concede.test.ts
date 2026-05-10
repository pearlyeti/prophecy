import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';

function setup() {
  return newGame({
    seed: 'concede-test',
    playerIds: ['alice', 'bob'],
    battlefieldControllerId: 'alice',
  });
}

describe('applyAction({ type: "concede" })', () => {
  it('1v1: the opponent wins immediately with reason "concede"', () => {
    const initial = setup();
    const { state, events } = applyAction(initial, {
      type: 'concede',
      playerId: 'alice',
    });

    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('bob');

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('game.ended');
    expect(events[0]?.payload).toEqual({ winnerId: 'bob', reason: 'concede' });
  });

  it('can be invoked outside the conceder\'s turn', () => {
    const initial = setup(); // alice active
    const { state } = applyAction(initial, { type: 'concede', playerId: 'bob' });
    expect(state.winnerId).toBe('alice');
    expect(state.phase).toBe('ended');
  });

  it('throws when the game has already ended', () => {
    const initial = setup();
    const ended = applyAction(initial, { type: 'concede', playerId: 'alice' }).state;
    expect(() => applyAction(ended, { type: 'concede', playerId: 'bob' })).toThrow(
      IllegalActionError,
    );
  });

  it('throws when the playerId is not in the game', () => {
    const initial = setup();
    expect(() => applyAction(initial, { type: 'concede', playerId: 'eve' })).toThrow(
      /not in this game/,
    );
  });
});
