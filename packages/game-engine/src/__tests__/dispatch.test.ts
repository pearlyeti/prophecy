import { describe, expect, it } from 'vitest';

import { applyEffect, applyEffects, NotImplementedError } from '../abilities/dispatch';
import type { DispatchContext } from '../abilities/dispatch';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

// ────────────────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────────────────

function makeGame(overrides?: Parameters<typeof basicGameInput>[0]) {
  return newGameInActionPhase(basicGameInput(overrides ?? {}));
}

function ctx(state: ReturnType<typeof makeGame>, targets: string[] = []): DispatchContext {
  return { playerId: state.activePlayerId!, characterTargets: targets };
}

function oppCharId(state: ReturnType<typeof makeGame>) {
  const oppId = state.playerOrder.find((id) => id !== state.activePlayerId)!;
  return state.players[oppId]!.characterOrder[0]!;
}

function ownCharId(state: ReturnType<typeof makeGame>) {
  return state.players[state.activePlayerId!]!.characterOrder[0]!;
}

function ownerId(state: ReturnType<typeof makeGame>, charId: string) {
  return state.playerOrder.find((pid) => state.players[pid]?.characters[charId]) ?? '';
}

// ────────────────────────────────────────────────────────────────────
// gainResources
// ────────────────────────────────────────────────────────────────────

describe('gainResources', () => {
  it('adds resources to the active player', () => {
    const state = makeGame();
    const before = state.players[state.activePlayerId!]!.resources;
    const { state: after } = applyEffect(state, ctx(state), { op: 'gainResources', amount: 3 });
    expect(after.players[state.activePlayerId!]!.resources).toBe(before + 3);
  });

  it('emits resources.gained event', () => {
    const state = makeGame();
    const { events } = applyEffect(state, ctx(state), { op: 'gainResources', amount: 2 });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'resources.gained', payload: expect.objectContaining({ amount: 2 }) }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// loseResources
// ────────────────────────────────────────────────────────────────────

describe('loseResources', () => {
  it('removes resources from opponent', () => {
    const state = makeGame();
    const oppId = state.playerOrder.find((id) => id !== state.activePlayerId)!;
    const before = state.players[oppId]!.resources;
    const { state: after } = applyEffect(state, ctx(state), { op: 'loseResources', amount: 1, target: 'opponent' });
    expect(after.players[oppId]!.resources).toBe(Math.max(0, before - 1));
  });

  it("removes all opponent resources when amount is 'all'", () => {
    const state = makeGame();
    const oppId = state.playerOrder.find((id) => id !== state.activePlayerId)!;
    const { state: after } = applyEffect(state, ctx(state), { op: 'loseResources', amount: 'all', target: 'opponent' });
    expect(after.players[oppId]!.resources).toBe(0);
  });

  it('does not go below 0', () => {
    const state = makeGame();
    const oppId = state.playerOrder.find((id) => id !== state.activePlayerId)!;
    const { state: after } = applyEffect(state, ctx(state), { op: 'loseResources', amount: 999, target: 'opponent' });
    expect(after.players[oppId]!.resources).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// drawCards
// ────────────────────────────────────────────────────────────────────

describe('drawCards', () => {
  it('active player draws N cards', () => {
    const state = makeGame();
    const pid = state.activePlayerId!;
    const before = state.players[pid]!.hand.length;
    const { state: after } = applyEffect(state, ctx(state), { op: 'drawCards', player: 'self', amount: 2 });
    expect(after.players[pid]!.hand.length).toBe(before + 2);
  });

  it('eachPlayer draws', () => {
    const state = makeGame();
    const beforeHands = Object.fromEntries(
      state.playerOrder.map((id) => [id, state.players[id]!.hand.length]),
    );
    const { state: after } = applyEffect(state, ctx(state), { op: 'drawCards', player: 'eachPlayer', amount: 1 });
    for (const id of state.playerOrder) {
      expect(after.players[id]!.hand.length).toBe(beforeHands[id]! + 1);
    }
  });

  it('toHandSize draws up to hand size, not beyond', () => {
    const state = makeGame();
    const pid = state.activePlayerId!;
    const player = state.players[pid]!;
    // Add cards to the hand to be at hand size already
    const full = { ...state, players: { ...state.players, [pid]: { ...player, hand: Array(player.handSize).fill('x') } } };
    const { state: after } = applyEffect(full, ctx(full), { op: 'drawCards', player: 'self', toHandSize: true });
    expect(after.players[pid]!.hand.length).toBe(player.handSize);
  });
});

// ────────────────────────────────────────────────────────────────────
// dealDamage
// ────────────────────────────────────────────────────────────────────

describe('dealDamage', () => {
  it('deals damage to the specified opponent character', () => {
    const base = makeGame();
    const charId = oppCharId(base);
    const owner = ownerId(base, charId);
    // Strip any setup shields so damage is deterministic
    const state = {
      ...base, players: { ...base.players, [owner]: { ...base.players[owner]!,
        characters: { ...base.players[owner]!.characters,
          [charId]: { ...base.players[owner]!.characters[charId]!, shields: 0 } } } },
    };
    const { state: after } = applyEffect(state, ctx(state, [charId]),
      { op: 'dealDamage', amount: 3, target: { kind: 'opponentCharacter' } });
    expect(after.players[owner]!.characters[charId]!.damage).toBe(3);
  });

  it('damage is blocked by shields', () => {
    const state = makeGame();
    const charId = oppCharId(state);
    const owner = ownerId(state, charId);
    // Give the character 2 shields first
    const withShields = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...state.players[owner]!,
          characters: {
            ...state.players[owner]!.characters,
            [charId]: { ...state.players[owner]!.characters[charId]!, shields: 2 },
          },
        },
      },
    };
    const { state: after } = applyEffect(withShields, ctx(withShields, [charId]),
      { op: 'dealDamage', amount: 3, target: { kind: 'opponentCharacter' } });
    // 3 damage - 2 shields = 1 net damage
    expect(after.players[owner]!.characters[charId]!.damage).toBe(1);
    expect(after.players[owner]!.characters[charId]!.shields).toBe(0);
  });

  it('unblockable damage ignores shields', () => {
    const state = makeGame();
    const charId = oppCharId(state);
    const owner = ownerId(state, charId);
    const withShields = {
      ...state,
      players: {
        ...state.players,
        [owner]: {
          ...state.players[owner]!,
          characters: {
            ...state.players[owner]!.characters,
            [charId]: { ...state.players[owner]!.characters[charId]!, shields: 3 },
          },
        },
      },
    };
    const { state: after } = applyEffect(withShields, ctx(withShields, [charId]),
      { op: 'dealDamage', amount: 2, unblockable: true, target: { kind: 'opponentCharacter' } });
    expect(after.players[owner]!.characters[charId]!.damage).toBe(2);
    expect(after.players[owner]!.characters[charId]!.shields).toBe(3);
  });

  it('eachOpponentCharacter targets all opponent characters without selection', () => {
    const base = makeGame();
    const oppId = base.playerOrder.find((id) => id !== base.activePlayerId)!;
    // Strip shields so damage is not blocked
    const stripShields = (s: typeof base) => ({
      ...s, players: { ...s.players, [oppId]: { ...s.players[oppId]!,
        characters: Object.fromEntries(Object.entries(s.players[oppId]!.characters)
          .map(([id, c]) => [id, { ...c, shields: 0 }])) } },
    });
    const state = stripShields(base);
    const { state: after } = applyEffect(state, ctx(state),
      { op: 'dealDamage', amount: 1, target: { kind: 'eachOpponentCharacter' } });
    for (const charId of state.players[oppId]!.characterOrder) {
      expect(after.players[oppId]!.characters[charId]?.damage).toBe(1);
    }
  });

  it('throws if a character selection is required but not provided', () => {
    const state = makeGame();
    expect(() =>
      applyEffect(state, ctx(state, []),
        { op: 'dealDamage', amount: 1, target: { kind: 'opponentCharacter' } }),
    ).toThrow(/character target/);
  });
});

// ────────────────────────────────────────────────────────────────────
// addShields
// ────────────────────────────────────────────────────────────────────

describe('addShields', () => {
  it('adds shields to a character', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const { state: after } = applyEffect(state, ctx(state, [charId]),
      { op: 'addShields', amount: 2, target: { kind: 'ownCharacter' } });
    expect(after.players[owner]!.characters[charId]!.shields).toBe(2);
  });

  it('caps shields at 3', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const { state: after } = applyEffect(state, ctx(state, [charId]),
      { op: 'addShields', amount: 99, target: { kind: 'ownCharacter' } });
    expect(after.players[owner]!.characters[charId]!.shields).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────────
// removeShields
// ────────────────────────────────────────────────────────────────────

describe('removeShields', () => {
  it('removes a specific number of shields', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const withShields = {
      ...state,
      players: { ...state.players, [owner]: {
        ...state.players[owner]!,
        characters: { ...state.players[owner]!.characters,
          [charId]: { ...state.players[owner]!.characters[charId]!, shields: 3 } },
      }},
    };
    const { state: after } = applyEffect(withShields, ctx(withShields, [charId]),
      { op: 'removeShields', amount: 2, target: { kind: 'anyCharacter' } });
    expect(after.players[owner]!.characters[charId]!.shields).toBe(1);
  });

  it("removes all shields when amount is 'all'", () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const withShields = {
      ...state,
      players: { ...state.players, [owner]: {
        ...state.players[owner]!,
        characters: { ...state.players[owner]!.characters,
          [charId]: { ...state.players[owner]!.characters[charId]!, shields: 3 } },
      }},
    };
    const { state: after } = applyEffect(withShields, ctx(withShields, [charId]),
      { op: 'removeShields', amount: 'all', target: { kind: 'anyCharacter' } });
    expect(after.players[owner]!.characters[charId]!.shields).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// healDamage
// ────────────────────────────────────────────────────────────────────

describe('healDamage', () => {
  it('removes damage from a character', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const damaged = {
      ...state,
      players: { ...state.players, [owner]: {
        ...state.players[owner]!,
        characters: { ...state.players[owner]!.characters,
          [charId]: { ...state.players[owner]!.characters[charId]!, damage: 4 } },
      }},
    };
    const { state: after } = applyEffect(damaged, ctx(damaged, [charId]),
      { op: 'healDamage', amount: 2, target: { kind: 'ownCharacter' } });
    expect(after.players[owner]!.characters[charId]!.damage).toBe(2);
  });

  it('does not heal below 0', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const { state: after } = applyEffect(state, ctx(state, [charId]),
      { op: 'healDamage', amount: 99, target: { kind: 'ownCharacter' } });
    expect(after.players[owner]!.characters[charId]!.damage).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Stub ops throw NotImplementedError
// ────────────────────────────────────────────────────────────────────

describe('stub ops', () => {
  it('throws NotImplementedError for unimplemented ops', () => {
    const state = makeGame();
    expect(() =>
      applyEffect(state, ctx(state), { op: 'removeDie' } as Parameters<typeof applyEffect>[2]),
    ).toThrow(NotImplementedError);
  });

  it('error message names the op', () => {
    const state = makeGame();
    expect(() =>
      applyEffect(state, ctx(state), { op: 'rerollDice' } as Parameters<typeof applyEffect>[2]),
    ).toThrow('rerollDice');
  });
});

// ────────────────────────────────────────────────────────────────────
// Sequential effects (applyEffects)
// ────────────────────────────────────────────────────────────────────

describe('applyEffects — sequencing', () => {
  it('threads state across multiple effects', () => {
    const state = makeGame();
    const pid = state.activePlayerId!;
    const before = state.players[pid]!.resources;
    const { state: after } = applyEffects(state, ctx(state), [
      { op: 'gainResources', amount: 3 },
      { op: 'gainResources', amount: 2 },
    ]);
    expect(after.players[pid]!.resources).toBe(before + 5);
  });

  it('consumes character targets in order across effects', () => {
    const state = makeGame();
    const charId = ownCharId(state);
    const owner = ownerId(state, charId);
    const damaged = {
      ...state,
      players: { ...state.players, [owner]: {
        ...state.players[owner]!,
        characters: { ...state.players[owner]!.characters,
          [charId]: { ...state.players[owner]!.characters[charId]!, damage: 4 } },
      }},
    };
    // Two heal effects targeting the same character; each consumes one target slot
    const { state: after } = applyEffects(damaged, { playerId: state.activePlayerId!, characterTargets: [charId, charId] }, [
      { op: 'healDamage', amount: 1, target: { kind: 'ownCharacter' } },
      { op: 'healDamage', amount: 1, target: { kind: 'ownCharacter' } },
    ]);
    expect(after.players[owner]!.characters[charId]!.damage).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// Integration: play-card fires immediate ability
// ────────────────────────────────────────────────────────────────────

describe('play-card integration — immediate ability fires', () => {
  it('dealDamage effect lands on target when card is played', () => {
    const base = newGameInActionPhase(basicGameInput());
    const pid = base.activePlayerId!;
    const oppId = base.playerOrder.find((id) => id !== pid)!;
    const oppChar = base.players[oppId]!.characterOrder[0]!;
    const cardId = base.players[pid]!.hand[0]!;

    // Strip shields from opponent character so damage lands cleanly
    const noShieldBase = {
      ...base,
      players: { ...base.players, [oppId]: { ...base.players[oppId]!,
        characters: { ...base.players[oppId]!.characters,
          [oppChar]: { ...base.players[oppId]!.characters[oppChar]!, shields: 0 } } } },
    };
    const state = {
      ...noShieldBase,
      cardAbilities: {
        [cardId]: [{
          kind: 'immediate' as const,
          effects: [{ op: 'dealDamage' as const, amount: 2, target: { kind: 'opponentCharacter' as const } }],
        }],
      },
    };

    const { state: after, events } = applyAction(state, {
      type: 'play-card',
      playerId: pid,
      cardId,
      characterTargets: [oppChar],
    });

    expect(after.players[oppId]!.characters[oppChar]?.damage).toBe(2);
    expect(events.some((e) => e.type === 'damage.dealt')).toBe(true);
    expect(after.players[pid]!.hand).not.toContain(cardId);
    expect(after.players[pid]!.discard).toContain(cardId);
  });

  it('gainResources effect fires without any target', () => {
    const base = newGameInActionPhase(basicGameInput());
    const pid = base.activePlayerId!;
    const cardId = base.players[pid]!.hand[0]!;
    const before = base.players[pid]!.resources;

    const state = {
      ...base,
      cardAbilities: {
        [cardId]: [{
          kind: 'immediate' as const,
          effects: [{ op: 'gainResources' as const, amount: 2 }],
        }],
      },
    };

    const { state: after } = applyAction(state, { type: 'play-card', playerId: pid, cardId });
    expect(after.players[pid]!.resources).toBe(before - 0 + 2); // cost 0, gain 2
  });

  it('card with no abilities still plays cleanly', () => {
    const base = newGameInActionPhase(basicGameInput());
    const pid = base.activePlayerId!;
    const cardId = base.players[pid]!.hand[0]!;

    const { state: after } = applyAction(base, { type: 'play-card', playerId: pid, cardId });
    expect(after.players[pid]!.discard).toContain(cardId);
  });
});
