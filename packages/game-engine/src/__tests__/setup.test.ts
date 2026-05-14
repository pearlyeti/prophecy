import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal.js';
import { applyAction } from '../reducers/apply-action.js';
import { newGame } from '../state/new-game.js';
import { basicGameInput } from './fixtures.js';

describe('setup phase', () => {
  describe('setup.choose-first-player', () => {
    it('winner picks themselves: battlefield controller set, opponent becomes shield recipient, step advances to place-shields', () => {
      const initial = newGame(basicGameInput({ seed: 'first-1' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;

      const { state, events } = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      });

      expect(state.battlefieldControllerId).toBe(winner);
      expect(state.setup?.firstPlayerId).toBe(winner);
      expect(state.setup?.shieldRecipientId).toBe(opponent);
      expect(state.setup?.step).toBe('place-shields');
      expect(state.setup?.shieldsRemaining).toBe(2);

      const evt = events.find((e) => e.type === 'setup.first-player-chosen');
      expect(evt?.payload).toEqual({ chosenByPlayerId: winner, firstPlayerId: winner });
    });

    it('winner picks the opponent: opponent goes first, winner gets shields', () => {
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
      expect(state.setup?.shieldRecipientId).toBe(winner);
      expect(state.setup?.step).toBe('place-shields');
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

  describe('setup.place-shield', () => {
    function driveToShields(seed: string) {
      const initial = newGame(basicGameInput({ seed }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;
      const state = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;
      // With the winner first, the loser is automatically the shield recipient.
      return { state, winner, loser, recipientId: loser };
    }

    it('places shields one at a time and transitions to action phase on the second', () => {
      const { state, recipientId } = driveToShields('shield-1');
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
            bob: [
              { id: 'bob.c1', cardId: 'CHAR_TEST_001', elite: false },
              { id: 'bob.c2', cardId: 'CHAR_TEST_001', elite: false },
            ],
          },
        }),
      );
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;

      let state = applyAction(initial, {
        type: 'setup.choose-first-player',
        playerId: winner,
        firstPlayerId: winner,
      }).state;

      const order = state.players[loser]!.characterOrder;
      state = applyAction(state, {
        type: 'setup.place-shield',
        playerId: loser,
        characterId: order[0]!,
      }).state;
      const final = applyAction(state, {
        type: 'setup.place-shield',
        playerId: loser,
        characterId: order[1]!,
      });
      expect(final.state.players[loser]?.characters[order[0]!]?.shields).toBe(1);
      expect(final.state.players[loser]?.characters[order[1]!]?.shields).toBe(1);
      expect(final.state.phase).toBe('action');
    });

    it('rejects placement on a non-recipient character', () => {
      const { state, winner, recipientId } = driveToShields('shield-2');
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
      const { state, recipientId } = driveToShields('shield-3');
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

    it('rejects place-shield from a player who is not the shield recipient', () => {
      const { state, winner } = driveToShields('shield-5');
      const winnerCharId = state.players[winner]!.characterOrder[0]!;
      expect(() =>
        applyAction(state, {
          type: 'setup.place-shield',
          playerId: winner,
          characterId: winnerCharId,
        }),
      ).toThrow(/not the shield recipient/);
    });
  });
});
