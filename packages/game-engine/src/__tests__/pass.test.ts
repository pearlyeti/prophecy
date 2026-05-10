import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';

function setup() {
  return newGame({
    seed: 'pass-test',
    playerIds: ['alice', 'bob'],
    battlefieldControllerId: 'alice',
  });
}

describe('applyAction({ type: "pass" })', () => {
  it('rotates the active player on a single pass', () => {
    const initial = setup();
    const { state, events } = applyAction(initial, { type: 'pass', playerId: 'alice' });

    expect(state.activePlayerId).toBe('bob');
    expect(state.consecutivePasses).toBe(1);
    expect(state.phase).toBe('action');
    expect(state.roundNumber).toBe(1);
    expect(state.turnIndex).toBe(initial.turnIndex + 1);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain('player.passed');
    expect(eventTypes).toContain('turn.advanced');
  });

  it('after both players pass, runs upkeep and starts the next round', () => {
    const a = setup();
    const b = applyAction(a, { type: 'pass', playerId: 'alice' }).state;
    const { state: c, events } = applyAction(b, { type: 'pass', playerId: 'bob' });

    expect(c.roundNumber).toBe(2);
    expect(c.consecutivePasses).toBe(0);
    expect(c.activePlayerId).toBe(c.battlefieldControllerId);
    expect(c.phase).toBe('action');

    // Upkeep granted +2 resources to both
    expect(c.players.alice?.resources).toBe(4);
    expect(c.players.bob?.resources).toBe(4);

    // Event timeline
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toEqual([
      'player.passed',
      'upkeep.begin',
      'upkeep.player',
      'upkeep.player',
      'upkeep.end',
      'round.begin',
    ]);
  });

  it('upkeep clears the dice pool and reports the count returned', () => {
    const initial = newGame({
      seed: 'pool-test',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'alice',
      playerOverrides: {
        alice: {
          diceInPool: [
            { instanceId: 'd1', cardId: 'CHAR_A', faceIndex: 0 },
            { instanceId: 'd2', cardId: 'CHAR_A', faceIndex: 2 },
          ],
        },
      },
    });

    const after1 = applyAction(initial, { type: 'pass', playerId: 'alice' }).state;
    const final = applyAction(after1, { type: 'pass', playerId: 'bob' });

    expect(final.state.players.alice?.diceInPool).toEqual([]);
    expect(final.state.players.bob?.diceInPool).toEqual([]);

    const upkeepAlice = final.events.find(
      (e) =>
        e.type === 'upkeep.player' &&
        (e.payload as { playerId: string }).playerId === 'alice',
    );
    expect(upkeepAlice).toBeDefined();
    expect((upkeepAlice?.payload as { diceReturned: number }).diceReturned).toBe(2);
  });

  it('throws IllegalActionError when it is not the player\'s turn', () => {
    const initial = setup();
    expect(() => applyAction(initial, { type: 'pass', playerId: 'bob' })).toThrow(
      IllegalActionError,
    );
  });

  it('throws IllegalActionError when the game has already ended', () => {
    const initial = setup();
    const ended = { ...initial, winnerId: 'alice' };
    expect(() => applyAction(ended, { type: 'pass', playerId: 'alice' })).toThrow(
      /game has already ended/,
    );
  });

  it('throws IllegalActionError outside the action phase', () => {
    const initial = setup();
    const upkeeping = { ...initial, phase: 'upkeep' as const };
    expect(() => applyAction(upkeeping, { type: 'pass', playerId: 'alice' })).toThrow(
      /cannot act during upkeep phase/,
    );
  });

  it('is deterministic: same seed + same actions produces identical state', () => {
    const sequence = (): { round: number; resources: number } => {
      let s = newGame({
        seed: 'determinism',
        playerIds: ['alice', 'bob'],
        battlefieldControllerId: 'alice',
      });
      // Two full rounds of pass/pass.
      for (let i = 0; i < 4; i++) {
        const playerId = s.activePlayerId;
        if (!playerId) throw new Error('no active player');
        s = applyAction(s, { type: 'pass', playerId }).state;
      }
      return { round: s.roundNumber, resources: s.players.alice?.resources ?? -1 };
    };

    expect(sequence()).toEqual(sequence());
    expect(sequence().round).toBe(3);
    expect(sequence().resources).toBe(6); // 2 starting + 2 per round * 2 rounds
  });

  it('throws on actions that are not yet implemented (placeholder dispatch)', () => {
    const initial = setup();
    expect(() =>
      applyAction(initial, { type: 'activate', playerId: 'alice', cardId: 'X' }),
    ).toThrow(/not yet implemented/);
  });
});
