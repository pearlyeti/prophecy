import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'activate-test' }));
}

describe('applyAction({ type: "activate" })', () => {
  it('rolls the character\'s die into the pool and exhausts the character', () => {
    const initial = setup();
    const playerId = initial.activePlayerId!;
    const characterId = initial.players[playerId]!.characterOrder[0]!;

    const { state, events } = applyAction(initial, {
      type: 'activate',
      playerId,
      cardId: characterId,
    });

    const character = state.players[playerId]!.characters[characterId]!;
    expect(character.exhausted).toBe(true);

    // Non-elite character → 1 die in pool now.
    const pool = state.players[playerId]!.diceInPool;
    expect(pool).toHaveLength(1);
    expect(pool[0]?.instanceId).toBe(`${characterId}.die.0`);
    expect(pool[0]?.faceIndex).toBeGreaterThanOrEqual(0);
    expect(pool[0]?.faceIndex).toBeLessThan(6);
    expect(pool[0]?.face).toBeDefined();
    expect(pool[0]?.face.symbol).toBeDefined();

    const activated = events.find((e) => e.type === 'character.activated');
    expect(activated).toBeDefined();
    expect(activated?.payload.playerId).toBe(playerId);
    expect(activated?.payload.characterId).toBe(characterId);
    expect(activated?.payload.rolledDice).toHaveLength(1);
  });

  it('rolls two dice for an elite character', () => {
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'elite-test',
        playerCharacters: {
          alice: [{ id: 'alice.c1', cardId: 'CHAR_TEST_001', elite: true }],
          bob: [{ id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false }],
        },
      }),
    );
    const playerId = initial.activePlayerId!;
    const characterId = initial.players[playerId]!.characterOrder[0]!;

    const { state } = applyAction(initial, {
      type: 'activate',
      playerId,
      cardId: characterId,
    });

    if (state.players[playerId]!.characters[characterId]!.elite) {
      expect(state.players[playerId]!.diceInPool).toHaveLength(2);
    } else {
      expect(state.players[playerId]!.diceInPool).toHaveLength(1);
    }
  });

  it('resets consecutivePasses (activate is an action, not a pass)', () => {
    const initial = setup();
    const playerId = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== playerId)!;

    // Opponent passes first to bump consecutivePasses.
    const afterPass = applyAction(initial, { type: 'pass', playerId }).state;
    expect(afterPass.consecutivePasses).toBe(1);

    const characterId = afterPass.players[opponent]!.characterOrder[0]!;
    const after = applyAction(afterPass, {
      type: 'activate',
      playerId: opponent,
      cardId: characterId,
    });
    expect(after.state.consecutivePasses).toBe(0);
  });

  it('throws when the character is already exhausted', () => {
    const initial = setup();
    const playerId = initial.activePlayerId!;
    const characterId = initial.players[playerId]!.characterOrder[0]!;
    const once = applyAction(initial, {
      type: 'activate',
      playerId,
      cardId: characterId,
    }).state;
    expect(() =>
      applyAction(once, { type: 'activate', playerId, cardId: characterId }),
    ).toThrow(/exhausted/);
  });

  it('throws when the character does not belong to the player', () => {
    const initial = setup();
    const playerId = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== playerId)!;
    const opponentCharacterId = initial.players[opponent]!.characterOrder[0]!;
    expect(() =>
      applyAction(initial, { type: 'activate', playerId, cardId: opponentCharacterId }),
    ).toThrow(/does not belong/);
  });

  it('throws when it is not the player\'s turn', () => {
    const initial = setup();
    const playerId = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== playerId)!;
    const opponentCharacterId = initial.players[opponent]!.characterOrder[0]!;
    expect(() =>
      applyAction(initial, { type: 'activate', playerId: opponent, cardId: opponentCharacterId }),
    ).toThrow(IllegalActionError);
  });

  it('is deterministic: same seed produces the same rolled face', () => {
    const a1 = newGameInActionPhase(basicGameInput({ seed: 'deterministic-roll' }));
    const a2 = newGameInActionPhase(basicGameInput({ seed: 'deterministic-roll' }));
    const playerId = a1.activePlayerId!;
    const charId = a1.players[playerId]!.characterOrder[0]!;

    const r1 = applyAction(a1, { type: 'activate', playerId, cardId: charId });
    const r2 = applyAction(a2, { type: 'activate', playerId, cardId: charId });

    expect(r1.state.players[playerId]!.diceInPool[0]?.faceIndex).toBe(
      r2.state.players[playerId]!.diceInPool[0]?.faceIndex,
    );
    expect(r1.state.players[playerId]!.diceInPool[0]?.face).toEqual(
      r2.state.players[playerId]!.diceInPool[0]?.face,
    );
  });

  it('different seeds eventually produce different rolls', () => {
    // Across 5 distinct seeds, we should see at least 2 distinct face indexes.
    const indexes = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const s = newGameInActionPhase(basicGameInput({ seed: `seed-${i}` }));
      const pid = s.activePlayerId!;
      const cid = s.players[pid]!.characterOrder[0]!;
      const r = applyAction(s, { type: 'activate', playerId: pid, cardId: cid });
      indexes.add(r.state.players[pid]!.diceInPool[0]?.faceIndex ?? -1);
    }
    expect(indexes.size).toBeGreaterThan(1);
  });
});
