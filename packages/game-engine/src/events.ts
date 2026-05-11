// Typed engine events.
//
// `applyAction` returns a list of these alongside the new state. The
// game-server broadcasts them to clients; the client animation pipeline
// keys off `type` and reads `payload`. Adding a new event type means
// adding a variant here and emitting it from the handler that produces
// it — TypeScript's exhaustiveness check on a `switch (event.type)`
// keeps consumers honest.

import type { DieFace } from './state/types';

export type EngineEvent =
  | { readonly type: 'setup.battlefield-chosen'; readonly payload: SetupBattlefieldChosenPayload }
  | { readonly type: 'setup.shield-placed'; readonly payload: SetupShieldPlacedPayload }
  | { readonly type: 'setup.completed'; readonly payload: SetupCompletedPayload }
  | { readonly type: 'player.passed'; readonly payload: PlayerPassedPayload }
  | { readonly type: 'turn.advanced'; readonly payload: TurnAdvancedPayload }
  | { readonly type: 'battlefield.claimed'; readonly payload: BattlefieldClaimedPayload }
  | { readonly type: 'character.activated'; readonly payload: CharacterActivatedPayload }
  | { readonly type: 'upkeep.begin'; readonly payload: Empty }
  | { readonly type: 'upkeep.player'; readonly payload: UpkeepPlayerPayload }
  | { readonly type: 'upkeep.end'; readonly payload: Empty }
  | { readonly type: 'round.begin'; readonly payload: RoundBeginPayload }
  | { readonly type: 'game.ended'; readonly payload: GameEndedPayload };

export type EngineEventType = EngineEvent['type'];

export type Empty = Record<string, never>;

export interface PlayerPassedPayload {
  readonly playerId: string;
  readonly consecutivePasses: number;
  /**
   * True when the engine auto-passed for this player (e.g., they had
   * already claimed the battlefield this round). False or absent for
   * an explicit player-chosen pass.
   */
  readonly automatic?: boolean;
}

export interface BattlefieldClaimedPayload {
  readonly playerId: string;
  readonly previousControllerId: string | null;
}

export interface SetupBattlefieldChosenPayload {
  readonly chosenByPlayerId: string;
  readonly battlefieldOwnerId: string;
  readonly shieldRecipientId: string;
}

export interface SetupShieldPlacedPayload {
  readonly playerId: string;
  readonly characterId: string;
  readonly shieldsRemaining: number;
}

export interface SetupCompletedPayload {
  readonly battlefieldControllerId: string;
  readonly firstActivePlayerId: string;
}

export interface CharacterActivatedPayload {
  readonly playerId: string;
  readonly characterId: string;
  readonly rolledDice: readonly { instanceId: string; faceIndex: number; face: DieFace }[];
}

export interface TurnAdvancedPayload {
  readonly from: string;
  readonly to: string;
}

export interface UpkeepPlayerPayload {
  readonly playerId: string;
  readonly resourcesGained: number;
  readonly diceReturned: number;
}

export interface RoundBeginPayload {
  readonly roundNumber: number;
  readonly activePlayerId: string;
}

export interface GameEndedPayload {
  readonly winnerId: string | null;
  readonly reason: 'all-characters-defeated' | 'deck-and-hand-empty' | 'concede';
}
