import type { EngineEvent } from '../events';
import type { CharacterState, GameState, PlayerState } from '../state/types';
import { IllegalActionError } from './illegal';
import type { ApplyResult } from './pass';

/**
 * setup.choose-first-player
 *
 * The roll-off winner picks which player acts first each round. That
 * player is the battlefield controller; their brought-in battlefield
 * card is the one in play. The OTHER player automatically becomes the
 * shield recipient and proceeds to distribute the 2 starting shields.
 */
export function applyChooseFirstPlayer(
  state: GameState,
  playerId: string,
  firstPlayerId: string,
): ApplyResult {
  if (state.phase !== 'setup' || state.setup === null) {
    throw new IllegalActionError(`cannot choose first player outside the setup phase`);
  }
  if (state.setup.step !== 'choose-first-player') {
    throw new IllegalActionError(
      `setup is at step "${state.setup.step}"; choose-first-player no longer applies`,
    );
  }
  if (playerId !== state.setup.rollOffWinnerId) {
    throw new IllegalActionError(
      `${playerId} did not win the roll-off (winner: ${state.setup.rollOffWinnerId})`,
    );
  }
  if (!state.playerOrder.includes(firstPlayerId)) {
    throw new IllegalActionError(`${firstPlayerId} is not in this game`);
  }

  const shieldRecipientId = state.playerOrder.find((id) => id !== firstPlayerId);
  if (shieldRecipientId === undefined) {
    throw new Error('cannot derive shield recipient — only one player in game');
  }

  const events: EngineEvent[] = [
    {
      type: 'setup.first-player-chosen',
      payload: { chosenByPlayerId: playerId, firstPlayerId },
    },
  ];

  return {
    state: {
      ...state,
      battlefieldControllerId: firstPlayerId,
      setup: {
        ...state.setup,
        step: 'place-shields',
        firstPlayerId,
        shieldRecipientId,
      },
    },
    events,
  };
}

/**
 * setup.place-shield
 *
 * The shield recipient places one shield onto one of their characters.
 * Repeated until shieldsRemaining reaches 0, at which point the engine
 * transitions to phase = 'action' and seats the battlefield controller
 * (= the chosen first player) as the active player.
 */
export function applyPlaceShield(
  state: GameState,
  playerId: string,
  characterId: string,
): ApplyResult {
  if (state.phase !== 'setup' || state.setup === null) {
    throw new IllegalActionError(`cannot place shields outside the setup phase`);
  }
  if (state.setup.step !== 'place-shields') {
    throw new IllegalActionError(
      `setup is at step "${state.setup.step}"; place-shield no longer applies`,
    );
  }
  if (state.setup.shieldRecipientId === null) {
    throw new Error('place-shields step entered without a shieldRecipientId');
  }
  if (playerId !== state.setup.shieldRecipientId) {
    throw new IllegalActionError(
      `${playerId} is not the shield recipient (${state.setup.shieldRecipientId})`,
    );
  }
  if (state.setup.shieldsRemaining <= 0) {
    throw new IllegalActionError('no shields remaining to place');
  }

  const player = state.players[playerId];
  if (player === undefined) {
    throw new Error(`player ${playerId} missing from state`);
  }
  const character = player.characters[characterId];
  if (character === undefined) {
    throw new IllegalActionError(
      `character ${characterId} does not belong to ${playerId}`,
    );
  }
  if (character.shields >= 3) {
    throw new IllegalActionError(
      `character ${characterId} already has the maximum 3 shields`,
    );
  }

  const updatedCharacter: CharacterState = {
    ...character,
    shields: character.shields + 1,
  };
  const updatedPlayer: PlayerState = {
    ...player,
    characters: {
      ...player.characters,
      [characterId]: updatedCharacter,
    },
  };

  const shieldsRemaining = state.setup.shieldsRemaining - 1;

  const events: EngineEvent[] = [
    {
      type: 'setup.shield-placed',
      payload: { playerId, characterId, shieldsRemaining },
    },
  ];

  if (shieldsRemaining > 0) {
    return {
      state: {
        ...state,
        players: { ...state.players, [playerId]: updatedPlayer },
        setup: { ...state.setup, shieldsRemaining },
      },
      events,
    };
  }

  // All shields placed — transition into the action phase.
  if (state.battlefieldControllerId === null) {
    throw new Error('setup completed without a battlefield controller set');
  }

  events.push({
    type: 'setup.completed',
    payload: {
      battlefieldControllerId: state.battlefieldControllerId,
      firstActivePlayerId: state.battlefieldControllerId,
    },
  });
  events.push({
    type: 'round.begin',
    payload: { roundNumber: 1, activePlayerId: state.battlefieldControllerId },
  });

  return {
    state: {
      ...state,
      players: { ...state.players, [playerId]: updatedPlayer },
      phase: 'action',
      activePlayerId: state.battlefieldControllerId,
      setup: null,
    },
    events,
  };
}
