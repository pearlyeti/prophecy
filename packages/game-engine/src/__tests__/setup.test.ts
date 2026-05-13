import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';
import { basicGameInput } from './fixtures';

describe('setup phase', () => {
  describe('setup.choose-first-player', () => {
    it('winner picks themselves: battlefieldController is set, step advances', () => {
      const initial = newGame(basicGameInput({ seed: 'first-1' }));
      const winner = initial.setup!.rollOffWinnerId;

      const { state, events } = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      });

      expect(state.battlefieldControllerId).toBe(winner);
      expect(state.setup?.firstPlayerId).toBe(winner);
      expect(state.setup?.step).toBe('choose-shield-recipient');
      expect(state.setup?.shieldRecipientId).toBeNull();

      const evt = events.find((e) => e.type === 'setup.first-player-chosen');
      expect(evt?.payload).toEqual({ chosenByPlayerId: winner, firstPlayerId: winner });
    });

    it('winner picks the opponent: opponent becomes the battlefield controller', () => {
      const initial = newGame(basicGameInput({ seed: 'first-2' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;
      const { state } = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: opponent,
      });
      expect(state.battlefieldControllerId).toBe(opponent);
      expect(state.setup?.firstPlayerId).toBe(opponent);
    });

    it('throws when called by the loser', () => {
      const initial = newGame(basicGameInput({ seed: 'first-3' }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;
      expect(() =>
        applyAction(initial, {
          type: 'setup.choose-first-player',
          playerId: loser,
          firstPlayerId: loser,
        }),
      ).toThrow(/did not win the roll-off/);
    });

    it('throws when re-issued after the step has advanced', () => {
      const initial = newGame(basicGameInput({ seed: 'first-4' }));
      const winner = initial.setup!.rollOffWinnerId;
      const after = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      expect(() =>
        applyAction(after, {
          type: 'setup.choose-first-player',
          playerId: winner,
          firstPlayerId: winner,
        }),
      ).toThrow(/no longer applies/);
    });
  });

  describe('setup.choose-shield-recipient', () => {
    it('winner picks either player; step advances to place-shields', () => {
      const initial = newGame(basicGameInput({ seed: 'sr-1' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;
      const afterFirst = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;

      const { state, events } = applyAction(afterFirst, {
        type: 'setup.choose-shield-recipient',
        playerId: winner,
        shieldRecipientId: opponent,
      });

      expect(state.setup?.shieldRecipientId).toBe(opponent);
      expect(state.setup?.step).toBe('place-shields');
      const evt = events.find((e) => e.type === 'setup.shield-recipient-chosen');
      expect(evt?.payload).toEqual({ chosenByPlayerId: winner, shieldRecipientId: opponent });
    });

    it('winner is allowed to hand shields to themselves', () => {
      const initial = newGame(basicGameInput({ seed: 'sr-2' }));
      const winner = initial.setup!.rollOffWinnerId;
      const afterFirst = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      const { state } = applyAction(afterFirst, {
        type: 'setup.choose-shield-recipient',
        playerId: winner,
        shieldRecipientId: winner,
      });
      expect(state.setup?.shieldRecipientId).toBe(winner);
    });

    it('throws when called by the loser', () => {
      const initial = newGame(basicGameInput({ seed: 'sr-3' }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;
      const afterFirst = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      expect(() =>
        applyAction(afterFirst, {
          type: 'setup.choose-shield-recipient',
          playerId: loser,
          shieldRecipientId: loser,
        }),
      ).toThrow(/did not win the roll-off/);
    });
  });

  describe('setup.place-shield', () => {
    function driveTo(seed: string, shieldRecipient: 'winner' | 'loser') {
      const initial = newGame(basicGameInput({ seed }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;
      const after1 = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      const recipientId = shieldRecipient === 'winner' ? winner : loser;
      const after2 = applyAction(after1, {
        type: 'setup.choose-shield-recipient',
        playerId: winner,
        shieldRecipientId: recipientId,
      }).state;
      return { state: after2, winner, loser, recipientId };
    }

    it('places shields one at a time and transitions to action phase on the second', () => {
      const { state, recipientId } = driveTo('shield-1', 'loser');
      const characterId = state.players[recipientId]!.characterOrder[0]!;

      const after1 = applyAction(state, {
        type: 'setup.place-shield',
        playerId: recipientId,
        characterId,
      }).state;
      expect(after1.players[recipientId]?.characters[characterId]?.shields).toBe(1);
      expect(after1.setup?.shieldsRemaining).toBe(1);
      expect(after1.phase).toBe('setup');

      const final = applyAction(after1, {
        type: 'setup.place-shield',
        playerId: recipientId,
        characterId,
      });
      expect(final.state.players[recipientId]?.characters[characterId]?.shields).toBe(2);
      expect(final.state.phase).toBe('action');
      expect(final.state.setup).toBeNull();
      expect(final.state.activePlayerId).toBe(final.state.battlefieldControllerId);

      const eventTypes = final.events.map((e) => e.type);
      expect(eventTypes).toContain('setup.shield-placed');
      expect(eventTypes).toContain('setup.completed');
      expect(eventTypes).toContain('round.begin');
    });

    it('allows splitting shields across two characters when the recipient has more than one', () => {
      const initial = newGame(
        basicGameInput({
          seed: 'shield-split',
          playerCharacters: {
            alice: [
              { id: 'alice.c1', cardId: 'CHAR_TEST_001', elite: false },
              { id: 'alice.c2', cardId: 'CHAR_TEST_001', elite: false },
            ],
            bob: [{ id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false }],
          },
        }),
      );
      const winner = initial.setup!.rollOffWinnerId;
      // Recipient is the player with two characters (whichever they are).
      const alice = initial.players.alice!;
      const recipientId = alice.characterOrder.length === 2 ? 'alice' : 'bob';

      let state = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      state = applyAction(state, {
        type: 'setup.choose-shield-recipient',
        playerId: winner,
        shieldRecipientId: recipientId,
      }).state;

      const order = state.players[recipientId]!.characterOrder;
      if (order.length < 2) return; // recipient doesn't have two characters; skip split assertion
      state = applyAction(state, {
        type: 'setup.place-shield',
        playerId: recipientId,
        characterId: order[0]!,
      }).state;
      const final = applyAction(state, {
        type: 'setup.place-shield',
        playerId: recipientId,
        characterId: order[1]!,
      });
      expect(final.state.players[recipientId]?.characters[order[0]!]?.shields).toBe(1);
      expect(final.state.players[recipientId]?.characters[order[1]!]?.shields).toBe(1);
      expect(final.state.phase).toBe('action');
    });

    it('rejects placement on a non-recipient character', () => {
      const { state, winner, recipientId } = driveTo('shield-2', 'loser');
      // Try to place a shield on the winner's character when winner is not recipient.
      if (winner === recipientId) return;
      const winnerCharId = state.players[winner]!.characterOrder[0]!;
      expect(() =>
        applyAction(state, {
          type: 'setup.place-shield',
          playerId: recipientId,
          characterId: winnerCharId,
        }),
      ).toThrow(/does not belong/);
    });

    it('rejects placement onto a character with already 3 shields', () => {
      const { state, recipientId } = driveTo('shield-3', 'loser');
      const characterId = state.players[recipientId]!.characterOrder[0]!;
      const maxed = {
        ...state,
        players: {
          ...state.players,
          [recipientId]: {
            ...state.players[recipientId]!,
            characters: {
              ...state.players[recipientId]!.characters,
              [characterId]: {
                ...state.players[recipientId]!.characters[characterId]!,
                shields: 3,
              },
            },
          },
        },
      };
      expect(() =>
        applyAction(maxed, {
          type: 'setup.place-shield',
          playerId: recipientId,
          characterId,
        }),
      ).toThrow(/already has the maximum/);
    });

    it('rejects place-shield outside the place-shields step', () => {
      const initial = newGame(basicGameInput({ seed: 'shield-4' }));
      const winner = initial.setup!.rollOffWinnerId;
      const winnerCharId = initial.players[winner]!.characterOrder[0]!;
      // We're still at choose-first-player step.
      expect(() =>
        applyAction(initial, {
          type: 'setup.place-shield',
          playerId: winner,
          characterId: winnerCharId,
        }),
      ).toThrow(IllegalActionError);
    });
  });
});
