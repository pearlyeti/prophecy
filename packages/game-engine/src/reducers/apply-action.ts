import { applyPass } from '../actions/pass';
import { IllegalActionError } from '../actions/illegal';
import type { Action } from '../actions/types';
import type { GameState } from '../state/types';

export interface EngineEvent {
  readonly type: string;
  readonly payload: unknown;
}

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
    case 'pass':
      return applyPass(state, action.playerId);
    case 'activate':
    case 'resolve-dice':
    case 'reroll-dice':
    case 'play-card':
    case 'use-card-action':
    case 'claim-battlefield':
      throw new IllegalActionError(`action type "${action.type}" not yet implemented`);
  }
}
