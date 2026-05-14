import { describe, expect, it } from 'vitest';

import { newGame, newGameInActionPhase } from '../state/new-game.js';
import { basicGameInput } from './fixtures.js';

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
    expect(state.setup?.step).toBe('choose-first-player');
    expect(state.setup?.firstPlayerId).toBeNull();
    expect(state.setup?.shieldRecipientId).toBeNull();
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
      expect(p.hand).toHaveLength(5);
      expect(p.handSize).toBe(5);
      expect(p.deck).toHaveLength(25);
      // Every dealt id should be unique and drawn from the player's deck pool.
      const all = new Set([...p.hand, ...p.deck]);
      expect(all.size).toBe(30);
      for (const cid of all) {
        expect(cid.startsWith(`${id}.deck.`)).toBe(true);
      }
      expect(p.resources).toBe(2);
      expect(p.diceInPool).toEqual([]);
      expect(p.discard).toEqual([]);
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
          bob: { resources: 7, hand: ['custom.1', 'custom.2', 'custom.3'] },
        },
      }),
    );
    expect(state.players.bob?.resources).toBe(7);
    expect(state.players.bob?.hand).toEqual(['custom.1', 'custom.2', 'custom.3']);
    expect(state.players.alice?.resources).toBe(2);
  });

  describe('initial deal', () => {
    it('deals deterministically — same seed → same hand and deck order', () => {
      const a = newGame(basicGameInput({ seed: 'deal-determinism' }));
      const b = newGame(basicGameInput({ seed: 'deal-determinism' }));

      for (const id of ['alice', 'bob']) {
        expect(a.players[id]?.hand).toEqual(b.players[id]?.hand);
        expect(a.players[id]?.deck).toEqual(b.players[id]?.deck);
      }
    });

    it('a different seed shuffles to a different order', () => {
      const a = newGame(basicGameInput({ seed: 'deal-a' }));
      const b = newGame(basicGameInput({ seed: 'deal-b' }));
      // It is theoretically possible for two seeds to land on the same
      // permutation; the chance for a 30-card deck is vanishing.
      expect(a.players.alice?.hand).not.toEqual(b.players.alice?.hand);
    });

    it("each player's hand and deck are disjoint and total the deck size", () => {
      const state = newGame(basicGameInput({ seed: 'disjoint-check' }));
      for (const id of ['alice', 'bob']) {
        const p = state.players[id]!;
        const intersect = p.hand.filter((c) => p.deck.includes(c));
        expect(intersect).toEqual([]);
        expect(p.hand.length + p.deck.length).toBe(30);
      }
    });
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
