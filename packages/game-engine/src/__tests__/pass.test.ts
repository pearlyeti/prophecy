import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGameInActionPhase } from '../state/new-game';
import { basicGameInput } from './fixtures';

function setup() {
  return newGameInActionPhase(basicGameInput({ seed: 'pass-test' }));
}

describe('applyAction({ type: "pass" })', () => {
  it('rotates the active player on a single pass', () => {
    const initial = setup();
    const activeAtStart = initial.activePlayerId!;
    const opponent = initial.playerOrder.find((id) => id !== activeAtStart)!;

    const { state, events } = applyAction(initial, { type: 'pass', playerId: activeAtStart });

    expect(state.activePlayerId).toBe(opponent);
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
    const first = a.activePlayerId!;
    const second = a.playerOrder.find((id) => id !== first)!;

    const b = applyAction(a, { type: 'pass', playerId: first }).state;
    const { state: c, events } = applyAction(b, { type: 'pass', playerId: second });

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
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'pool-test',
        playerOverrides: {
          alice: {
            diceInPool: [
              {
                instanceId: 'd1',
                cardId: 'CHAR_A',
                faceIndex: 0,
                face: { symbol: 'blank', value: 0, cost: 0, modifier: false },
              },
              {
                instanceId: 'd2',
                cardId: 'CHAR_A',
                faceIndex: 2,
                face: { symbol: 'melee', value: 1, cost: 0, modifier: false },
              },
            ],
          },
        },
      }),
    );

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;
    const after1 = applyAction(initial, { type: 'pass', playerId: first }).state;
    const final = applyAction(after1, { type: 'pass', playerId: second });

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

  it('upkeep draws each player back up to handSize', () => {
    // Start each player at 2 cards in hand so upkeep has to draw 3.
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'upkeep-draw',
        playerOverrides: {
          alice: {
            hand: ['alice.deck.0', 'alice.deck.1'],
            deck: [
              'alice.deck.2',
              'alice.deck.3',
              'alice.deck.4',
              'alice.deck.5',
              'alice.deck.6',
            ],
          },
          bob: {
            hand: ['bob.deck.0', 'bob.deck.1'],
            deck: ['bob.deck.2', 'bob.deck.3', 'bob.deck.4'],
          },
        },
      }),
    );

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;
    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    expect(after.state.players.alice?.hand).toEqual([
      'alice.deck.0',
      'alice.deck.1',
      'alice.deck.2',
      'alice.deck.3',
      'alice.deck.4',
    ]);
    expect(after.state.players.alice?.deck).toEqual(['alice.deck.5', 'alice.deck.6']);
    expect(after.state.players.bob?.hand).toEqual([
      'bob.deck.0',
      'bob.deck.1',
      'bob.deck.2',
      'bob.deck.3',
      'bob.deck.4',
    ]);
    expect(after.state.players.bob?.deck).toEqual([]);

    const upkeepAlice = after.events.find(
      (e) => e.type === 'upkeep.player' && (e.payload as { playerId: string }).playerId === 'alice',
    );
    expect((upkeepAlice?.payload as { cardsDrawn: number }).cardsDrawn).toBe(3);
  });

  it('upkeep readies all exhausted characters', () => {
    const initial = newGameInActionPhase(basicGameInput({ seed: 'upkeep-ready' }));
    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;
    // Pre-exhaust everybody's first character to prove upkeep readies them.
    const exhausted = {
      ...initial,
      players: Object.fromEntries(
        initial.playerOrder.map((id) => {
          const p = initial.players[id]!;
          const cid = p.characterOrder[0]!;
          return [
            id,
            {
              ...p,
              characters: {
                ...p.characters,
                [cid]: { ...p.characters[cid]!, exhausted: true },
              },
            },
          ];
        }),
      ),
    };
    for (const id of exhausted.playerOrder) {
      const cid = exhausted.players[id]!.characterOrder[0]!;
      expect(exhausted.players[id]?.characters[cid]?.exhausted).toBe(true);
    }

    const after = applyAction(
      applyAction(exhausted, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    for (const id of after.state.playerOrder) {
      const cid = after.state.players[id]!.characterOrder[0]!;
      expect(after.state.players[id]?.characters[cid]?.exhausted).toBe(false);
    }
  });

  it('upkeep does not draw past an empty deck', () => {
    const initial = newGameInActionPhase(
      basicGameInput({
        seed: 'upkeep-short-deck',
        playerOverrides: {
          alice: {
            hand: ['alice.deck.0'],
            deck: ['alice.deck.1', 'alice.deck.2'],
          },
        },
      }),
    );

    const first = initial.activePlayerId!;
    const second = initial.playerOrder.find((id) => id !== first)!;
    const after = applyAction(
      applyAction(initial, { type: 'pass', playerId: first }).state,
      { type: 'pass', playerId: second },
    );

    expect(after.state.players.alice?.hand).toEqual([
      'alice.deck.0',
      'alice.deck.1',
      'alice.deck.2',
    ]);
    expect(after.state.players.alice?.deck).toEqual([]);
  });

  it("throws IllegalActionError when it is not the player's turn", () => {
    const initial = setup();
    const inactive = initial.playerOrder.find((id) => id !== initial.activePlayerId)!;
    expect(() => applyAction(initial, { type: 'pass', playerId: inactive })).toThrow(
      IllegalActionError,
    );
  });

  it('throws IllegalActionError when the game has already ended', () => {
    const initial = setup();
    const ended = { ...initial, winnerId: 'alice' };
    expect(() => applyAction(ended, { type: 'pass', playerId: initial.activePlayerId! })).toThrow(
      /game has already ended/,
    );
  });

  it('throws IllegalActionError outside the action phase', () => {
    const initial = setup();
    const upkeeping = { ...initial, phase: 'upkeep' as const };
    expect(() =>
      applyAction(upkeeping, { type: 'pass', playerId: initial.activePlayerId! }),
    ).toThrow(/cannot act during upkeep phase/);
  });

  it('is deterministic: same seed + same actions produces identical state', () => {
    const sequence = (): { round: number; resources: number } => {
      let s = newGameInActionPhase(basicGameInput({ seed: 'determinism' }));
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
      applyAction(initial, {
        type: 'use-card-action',
        playerId: initial.activePlayerId!,
        cardId: 'X',
      }),
    ).toThrow(/not yet implemented/);
  });
});
