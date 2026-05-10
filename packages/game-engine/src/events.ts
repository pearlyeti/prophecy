// Typed engine events.
//
// `applyAction` returns a list of these alongside the new state. The
// game-server broadcasts them to clients; the client animation pipeline
// keys off `type` and reads `payload`. Adding a new event type means
// adding a variant here and emitting it from the handler that produces
// it — TypeScript's exhaustiveness check on a `switch (event.type)`
// keeps consumers honest.

export type EngineEvent =
  | { readonly type: 'player.passed'; readonly payload: PlayerPassedPayload }
  | { readonly type: 'turn.advanced'; readonly payload: TurnAdvancedPayload }
  | { readonly type: 'battlefield.claimed'; readonly payload: BattlefieldClaimedPayload }
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
