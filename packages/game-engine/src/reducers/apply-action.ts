import { applyActivate } from '../actions/activate';
import { applyOrderTriggersAction } from '../actions/order-triggers';
import { applyClaim } from '../actions/claim';
import { applyConcede } from '../actions/concede';
import { applyPass } from '../actions/pass';
import { applyPlayCard } from '../actions/play-card';
import { applyRerollDice } from '../actions/reroll-dice';
import { applyResolveDice } from '../actions/resolve-dice';
import { applyChooseFirstPlayer, applyPlaceShield } from '../actions/setup';
import { IllegalActionError } from '../actions/illegal';
import type { Action } from '../actions/types';
import type { EngineEvent } from '../events';
import type { GameState } from '../state/types';

export type { EngineEvent } from '../events';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

/**
 * Pure reducer dispatch. Each action handler is a `(state, ...args) => result`
 * function that does its own validation and throws `IllegalActionError` on
 * illegal input. The dispatcher itself stays trivial.
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  switch (action.type) {
    case 'setup.choose-first-player':
      return applyChooseFirstPlayer(state, action.playerId, action.firstPlayerId);
    case 'setup.place-shield':
      return applyPlaceShield(state, action.playerId, action.characterId);
    case 'pass':
      return applyPass(state, action.playerId);
    case 'claim-battlefield':
      return applyClaim(state, action.playerId);
    case 'concede':
      return applyConcede(state, action.playerId);
    case 'activate':
      return applyActivate(state, action.playerId, action.cardId);
    case 'resolve-dice':
      return applyResolveDice(
        state,
        action.playerId,
        action.dieInstanceIds,
        action.targetCharacterId,
      );
    case 'play-card':
      return applyPlayCard(state, action.playerId, action.cardId, action.characterTargets);
    case 'reroll-dice':
      return applyRerollDice(
        state,
        action.playerId,
        action.discardCardId,
        action.dieInstanceIds,
      );
    case 'use-card-action':
      throw new IllegalActionError(`action type "${action.type}" not yet implemented`);
    case 'order-triggers':
      return applyOrderTriggersAction(state, action.playerId, action.order);
  }
}
