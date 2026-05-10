import { describe, expect, it } from 'vitest';

import { IllegalActionError } from '../actions/illegal';
import { applyAction } from '../reducers/apply-action';
import { newGame } from '../state/new-game';
import { basicGameInput } from './fixtures';

describe('setup phase', () => {
  describe('setup.choose-battlefield', () => {
    it('lets the roll-off winner pick their own battlefield', () => {
      const initial = newGame(basicGameInput({ seed: 'choose-1' }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;

      const { state, events } = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: winner,
      });

      expect(state.battlefieldControllerId).toBe(winner);
      expect(state.setup?.step).toBe('place-shields');
      expect(state.setup?.shieldRecipientId).toBe(loser);
      expect(state.phase).toBe('setup');

      const event = events.find((e) => e.type === 'setup.battlefield-chosen');
      expect(event?.payload).toEqual({
        chosenByPlayerId: winner,
        battlefieldOwnerId: winner,
        shieldRecipientId: loser,
      });
    });

    it('lets the roll-off winner pick the opponent\'s battlefield (winner takes shields)', () => {
      const initial = newGame(basicGameInput({ seed: 'choose-2' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;

      const { state } = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: opponent,
      });

      expect(state.battlefieldControllerId).toBe(opponent);
      expect(state.setup?.shieldRecipientId).toBe(winner);
    });

    it('throws when called by the loser', () => {
      const initial = newGame(basicGameInput({ seed: 'choose-3' }));
      const winner = initial.setup!.rollOffWinnerId;
      const loser = initial.playerOrder.find((id) => id !== winner)!;

      expect(() =>
        applyAction(initial, {
          type: 'setup.choose-battlefield',
          playerId: loser,
          battlefieldOwnerId: loser,
        }),
      ).toThrow(/did not win the roll-off/);
    });

    it('throws when called outside the choose-battlefield step', () => {
      const initial = newGame(basicGameInput({ seed: 'choose-4' }));
      const winner = initial.setup!.rollOffWinnerId;
      const afterChoice = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: winner,
      }).state;

      // Try to choose again — should fail because step is now 'place-shields'.
      expect(() =>
        applyAction(afterChoice, {
          type: 'setup.choose-battlefield',
          playerId: winner,
          battlefieldOwnerId: winner,
        }),
      ).toThrow(/no longer applies/);
    });
  });

  describe('setup.place-shield', () => {
    it('places shields one at a time and transitions to action phase on the second', () => {
      const initial = newGame(basicGameInput({ seed: 'shield-1' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;

      const afterChoice = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: winner,
      }).state;

      const recipient = afterChoice.setup!.shieldRecipientId!;
      expect(recipient).toBe(opponent);
      const characterId = afterChoice.players[recipient]!.characterOrder[0]!;

      const afterFirst = applyAction(afterChoice, {
        type: 'setup.place-shield',
        playerId: recipient,
        characterId,
      }).state;
      expect(afterFirst.players[recipient]?.characters[characterId]?.shields).toBe(1);
      expect(afterFirst.setup?.shieldsRemaining).toBe(1);
      expect(afterFirst.phase).toBe('setup');

      const final = applyAction(afterFirst, {
        type: 'setup.place-shield',
        playerId: recipient,
        characterId,
      });
      expect(final.state.players[recipient]?.characters[characterId]?.shields).toBe(2);
      expect(final.state.phase).toBe('action');
      expect(final.state.setup).toBeNull();
      expect(final.state.activePlayerId).toBe(final.state.battlefieldControllerId);

      const eventTypes = final.events.map((e) => e.type);
      expect(eventTypes).toContain('setup.shield-placed');
      expect(eventTypes).toContain('setup.completed');
      expect(eventTypes).toContain('round.begin');
    });

    it('rejects placement on a non-recipient character', () => {
      const initial = newGame(basicGameInput({ seed: 'shield-2' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;
      const afterChoice = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: winner,
      }).state;

      // Try to place a shield on the winner's character instead.
      const winnerCharId = afterChoice.players[winner]!.characterOrder[0]!;
      expect(() =>
        applyAction(afterChoice, {
          type: 'setup.place-shield',
          playerId: opponent,
          characterId: winnerCharId,
        }),
      ).toThrow(/does not belong/);
    });

    it('rejects placement onto a character with already 3 shields', () => {
      const initial = newGame(basicGameInput({ seed: 'shield-3' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponent = initial.playerOrder.find((id) => id !== winner)!;
      const afterChoice = applyAction(initial, {
        type: 'setup.choose-battlefield',
        playerId: winner,
        battlefieldOwnerId: winner,
      }).state;
      const characterId = afterChoice.players[opponent]!.characterOrder[0]!;

      // Synthesize a state with the character already maxed.
      const maxed = {
        ...afterChoice,
        players: {
          ...afterChoice.players,
          [opponent]: {
            ...afterChoice.players[opponent]!,
            characters: {
              ...afterChoice.players[opponent]!.characters,
              [characterId]: {
                ...afterChoice.players[opponent]!.characters[characterId]!,
                shields: 3,
              },
            },
          },
        },
      };

      expect(() =>
        applyAction(maxed, {
          type: 'setup.place-shield',
          playerId: opponent,
          characterId,
        }),
      ).toThrow(/already has the maximum/);
    });

    it('rejects place-shield outside the place-shields step', () => {
      const initial = newGame(basicGameInput({ seed: 'shield-4' }));
      const winner = initial.setup!.rollOffWinnerId;
      const opponentCharId = initial.players[winner]!.characterOrder[0]!;
      // We're still at choose-battlefield step.
      expect(() =>
        applyAction(initial, {
          type: 'setup.place-shield',
          playerId: winner,
          characterId: opponentCharId,
        }),
      ).toThrow(IllegalActionError);
    });
  });
});
