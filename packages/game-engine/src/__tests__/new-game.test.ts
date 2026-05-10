import { describe, expect, it } from 'vitest';

import { newGame, newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

describe('newGame', () => {
  it('starts in the setup phase with the roll-off already resolved', () => {
    const state = newGame(basicGameInput({ seed: 'seed-1' }));

    expect(state.phase).toBe('setup');
    expect(state.activePlayerId).toBeNull();
    expect(state.battlefieldControllerId).toBeNull();
    expect(state.roundNumber).toBe(1);
    expect(state.consecutivePasses).toBe(0);
    expect(state.winnerId).toBeNull();

    expect(state.setup).not.toBeNull();
    expect(state.setup?.step).toBe('choose-battlefield');
    expect(['alice', 'bob']).toContain(state.setup?.rollOffWinnerId);
    expect(state.setup?.shieldsRemaining).toBe(2);
  });

  it('roll-off is deterministic for a given seed', () => {
    const a = newGame(basicGameInput({ seed: 'deterministic' }));
    const b = newGame(basicGameInput({ seed: 'deterministic' }));
    expect(a.setup?.rollOffWinnerId).toBe(b.setup?.rollOffWinnerId);
    expect(a.setup?.rollOffValues).toEqual(b.setup?.rollOffValues);
  });

  it('initialises both players with the post-deal defaults', () => {
    const state = newGame(basicGameInput({ seed: 'seed-2' }));

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
      expect(p.characterOrder).toHaveLength(1);
      const charId = p.characterOrder[0]!;
      expect(p.characters[charId]).toMatchObject({
        damage: 0,
        shields: 0,
        exhausted: false,
        elite: false,
      });
    }
  });

  it('rejects a player with zero characters', () => {
    expect(() =>
      newGame(
        basicGameInput({
          playerCharacters: {
            alice: [],
            bob: [{ id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false }],
          },
        }),
      ),
    ).toThrow(/no characters/);
  });

  it('rejects a player without a battlefield', () => {
    expect(() =>
      newGame(
        basicGameInput({
          playerBattlefieldCardIds: { alice: 'BF_TEST_ALICE' } as Record<string, string>,
        }),
      ),
    ).toThrow(/did not bring a battlefield/);
  });

  it('honours per-player overrides (used by tests to seed scenarios)', () => {
    const state = newGame(
      basicGameInput({
        seed: 'seed-3',
        playerOverrides: {
          bob: { resources: 7, handCount: 3 },
        },
      }),
    );
    expect(state.players.bob?.resources).toBe(7);
    expect(state.players.bob?.handCount).toBe(3);
    expect(state.players.alice?.resources).toBe(2);
  });
});

describe('newGameInActionPhase test helper', () => {
  it('drives setup to completion with deterministic choices', () => {
    const state = newGameInActionPhase(basicGameInput({ seed: 'helper-1' }));

    expect(state.phase).toBe('action');
    expect(state.setup).toBeNull();
    expect(state.battlefieldControllerId).toBeDefined();
    expect(state.activePlayerId).toBe(state.battlefieldControllerId);

    // Two shields landed on the loser's first character.
    const loserId = state.playerOrder.find((id) => id !== state.battlefieldControllerId)!;
    const loser = state.players[loserId]!;
    const firstCharId = loser.characterOrder[0]!;
    expect(loser.characters[firstCharId]?.shields).toBe(2);
  });
});
