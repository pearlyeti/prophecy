import { describe, expect, it } from 'vitest';

import { newGame } from '../state/new-game';

describe('newGame', () => {
  it('places the battlefield controller on the first action turn', () => {
    const state = newGame({
      seed: 'seed-1',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'bob',
    });

    expect(state.phase).toBe('action');
    expect(state.activePlayerId).toBe('bob');
    expect(state.battlefieldControllerId).toBe('bob');
    expect(state.roundNumber).toBe(1);
    expect(state.consecutivePasses).toBe(0);
    expect(state.winnerId).toBeNull();
  });

  it('initialises both players with the post-setup defaults', () => {
    const state = newGame({
      seed: 'seed-2',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'alice',
    });

    for (const id of ['alice', 'bob']) {
      const p = state.players[id];
      expect(p, `player ${id} should exist`).toBeDefined();
      if (!p) return;
      expect(p.handCount).toBe(5);
      expect(p.handSize).toBe(5);
      expect(p.deckCount).toBe(25);
      expect(p.resources).toBe(2);
      expect(p.diceInPool).toEqual([]);
      expect(p.discardIds).toEqual([]);
    }
  });

  it('rejects a battlefield controller that is not in the player list', () => {
    expect(() =>
      newGame({
        seed: 'seed-x',
        playerIds: ['alice', 'bob'],
        battlefieldControllerId: 'charlie',
      }),
    ).toThrow(/not in playerIds/);
  });

  it('honours per-player overrides (used by tests to seed scenarios)', () => {
    const state = newGame({
      seed: 'seed-3',
      playerIds: ['alice', 'bob'],
      battlefieldControllerId: 'alice',
      playerOverrides: {
        bob: { resources: 7, handCount: 3 },
      },
    });
    expect(state.players.bob?.resources).toBe(7);
    expect(state.players.bob?.handCount).toBe(3);
    // alice keeps the defaults
    expect(state.players.alice?.resources).toBe(2);
  });
});
