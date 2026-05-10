import type { Action } from '../actions/types.js';
import type { GameState } from '../state/types.js';

export interface EngineEvent {
  readonly type: string;
  readonly payload: unknown;
}

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly EngineEvent[];
}

// Pure reducer: (state, action) => { state, events }.
// Implementation lands rule-by-rule; for now this is a typed stub.
export function applyAction(_state: GameState, _action: Action): ApplyResult {
  throw new Error('applyAction: not yet implemented');
}
