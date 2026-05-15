import { applyActivate } from '../actions/activate.js';
import { applyOrderTriggersAction } from '../actions/order-triggers.js';
import { applyClaim } from '../actions/claim.js';
import { applyConcede } from '../actions/concede.js';
import { applyPass } from '../actions/pass.js';
import { applyPlayCard } from '../actions/play-card.js';
import { applyRerollDice } from '../actions/reroll-dice.js';
import { applyResolveDice } from '../actions/resolve-dice.js';
import { applyUseCardAction } from '../actions/use-card-action.js';
import { applyChooseFirstPlayer, applyPlaceShield } from '../actions/setup.js';
import { IllegalActionError } from '../actions/illegal.js';
import type { Action } from '../actions/types.js';
import type { EngineEvent } from '../events.js';
import type { GameState } from '../state/types.js';

export type { EngineEvent } from '../events.js';

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
      return applyUseCardAction(state, action.playerId, action.cardId, action.abilityIndex);
    case 'order-triggers':
      return applyOrderTriggersAction(state, action.playerId, action.order);
  }
}
