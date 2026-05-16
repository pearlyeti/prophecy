// Typed engine events.
//
// `applyAction` returns a list of these alongside the new state. The
// game-server broadcasts them to clients; the client animation pipeline
// keys off `type` and reads `payload`. Adding a new event type means
// adding a variant here and emitting it from the handler that produces
// it — TypeScript's exhaustiveness check on a `switch (event.type)`
// keeps consumers honest.

import type { DieFace } from './state/types.js';

export type EngineEvent =
  | { readonly type: 'setup.first-player-chosen'; readonly payload: SetupFirstPlayerChosenPayload }
  | { readonly type: 'setup.shield-placed'; readonly payload: SetupShieldPlacedPayload }
  | { readonly type: 'setup.completed'; readonly payload: SetupCompletedPayload }
  | { readonly type: 'player.passed'; readonly payload: PlayerPassedPayload }
  | { readonly type: 'turn.advanced'; readonly payload: TurnAdvancedPayload }
  | { readonly type: 'battlefield.claimed'; readonly payload: BattlefieldClaimedPayload }
  | { readonly type: 'character.activated'; readonly payload: CharacterActivatedPayload }
  | { readonly type: 'character.defeated'; readonly payload: CharacterDefeatedPayload }
  | { readonly type: 'card.played'; readonly payload: CardPlayedPayload }
  | { readonly type: 'card.action-used'; readonly payload: CardActionUsedPayload }
  | { readonly type: 'dice.resolved'; readonly payload: DiceResolvedPayload }
  | { readonly type: 'dice.rerolled'; readonly payload: DiceRerolledPayload }
  | { readonly type: 'damage.dealt'; readonly payload: DamageDealtPayload }
  | { readonly type: 'shields.placed'; readonly payload: ShieldsPlacedPayload }
  | { readonly type: 'shields.removed'; readonly payload: ShieldsRemovedPayload }
  | { readonly type: 'damage.healed'; readonly payload: DamageHealedPayload }
  | { readonly type: 'cards.drawn'; readonly payload: CardsDrawnPayload }
  | { readonly type: 'resources.gained'; readonly payload: ResourcesGainedPayload }
  | { readonly type: 'resources.lost'; readonly payload: ResourcesLostPayload }
  | { readonly type: 'upkeep.begin'; readonly payload: Empty }
  | { readonly type: 'upkeep.player'; readonly payload: UpkeepPlayerPayload }
  | { readonly type: 'upkeep.end'; readonly payload: Empty }
  | { readonly type: 'round.begin'; readonly payload: RoundBeginPayload }
  | { readonly type: 'game.ended'; readonly payload: GameEndedPayload }
  | { readonly type: 'trigger.queued'; readonly payload: TriggerQueuedPayload }
  | { readonly type: 'trigger.resolved'; readonly payload: TriggerResolvedPayload }
  | { readonly type: 'triggers.ordering-required'; readonly payload: TriggersOrderingRequiredPayload }
  | { readonly type: 'support.activated'; readonly payload: SupportActivatedPayload }
  | { readonly type: 'support.discarded'; readonly payload: SupportDiscardedPayload }
  | { readonly type: 'stability.lost'; readonly payload: StabilityLostPayload }
  | { readonly type: 'die.removed'; readonly payload: DieRemovedPayload }
  | { readonly type: 'die.turned'; readonly payload: DieTurnedPayload }
  | { readonly type: 'die.value-modified'; readonly payload: DieValueModifiedPayload }
  | { readonly type: 'deck.searched'; readonly payload: DeckSearchedPayload }
  | { readonly type: 'cards.revealed'; readonly payload: CardsRevealedPayload }
  | { readonly type: 'search.resolved'; readonly payload: SearchResolvedPayload };

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

export interface SetupFirstPlayerChosenPayload {
  readonly chosenByPlayerId: string;
  readonly firstPlayerId: string;
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
  readonly cardsDrawn: number;
}

export interface RoundBeginPayload {
  readonly roundNumber: number;
  readonly activePlayerId: string;
}

export interface GameEndedPayload {
  readonly winnerId: string | null;
  readonly reason: 'all-characters-defeated' | 'deck-and-hand-empty' | 'concede';
}

export interface CharacterDefeatedPayload {
  readonly playerId: string;
  readonly characterId: string;
}

export interface CardPlayedPayload {
  readonly playerId: string;
  readonly cardId: string;
  readonly costPaid: number;
}

export interface CardActionUsedPayload {
  readonly playerId: string;
  readonly cardId: string;
  readonly abilityIndex: number;
  readonly abilityKind: 'action' | 'powerAction';
}

export interface DiceResolvedPayload {
  readonly playerId: string;
  readonly dieInstanceIds: readonly string[];
  readonly symbol: string;
  readonly totalValue: number;
  readonly totalCost: number;
}

export interface DiceRerolledPayload {
  readonly playerId: string;
  readonly discardCardId: string;
  readonly rerolledDice: readonly {
    readonly instanceId: string;
    readonly faceIndex: number;
    readonly face: DieFace;
  }[];
}

export interface DamageDealtPayload {
  readonly characterId: string;
  readonly amount: number;
  readonly shieldsBlocked: number;
}

export interface ShieldsPlacedPayload {
  readonly characterId: string;
  readonly amount: number;
}

export interface ShieldsRemovedPayload {
  readonly characterId: string;
  readonly amount: number;
}

export interface DamageHealedPayload {
  readonly characterId: string;
  readonly amount: number;
}

export interface CardsDrawnPayload {
  readonly playerId: string;
  readonly count: number;
}

export interface TriggerQueuedPayload {
  readonly entryId: string;
  readonly playerId: string;
  readonly sourceCardInstanceId: string;
}

export interface TriggerResolvedPayload {
  readonly entryId: string;
  readonly playerId: string;
}

export interface TriggersOrderingRequiredPayload {
  readonly waitingForPlayerId: string;
  readonly phase: 'orderPlayers' | 'orderEntries';
}

export interface ResourcesGainedPayload {
  readonly playerId: string;
  readonly amount: number;
}

export interface ResourcesLostPayload {
  readonly playerId: string;
  readonly amount: number;
}

export interface SupportActivatedPayload {
  readonly playerId: string;
  readonly supportId: string;
  readonly rolledDice: readonly { instanceId: string; faceIndex: number; face: DieFace }[];
}

export interface SupportDiscardedPayload {
  readonly playerId: string;
  readonly supportId: string;
  readonly reason: 'stability-depleted' | 'effect';
}

export interface StabilityLostPayload {
  readonly playerId: string;
  readonly supportId: string;
  readonly amount: number;
}

export interface DieRemovedPayload {
  readonly playerId: string;
  readonly dieInstanceId: string;
  readonly face: DieFace;
}

export interface DieTurnedPayload {
  readonly playerId: string;
  readonly dieInstanceId: string;
  readonly fromSymbol: string;
  readonly toSymbol: string;
}

export interface DieValueModifiedPayload {
  readonly playerId: string;
  readonly dieInstanceId: string;
  readonly delta: number;
  readonly newValue: number;
}

export interface DeckSearchedPayload {
  readonly playerId: string;
  readonly source: 'ownDeck' | 'opponentDeck';
  /** Total number of cards drawn into the revealed set. */
  readonly revealedCount: number;
}

export interface CardsRevealedPayload {
  readonly playerId: string;
  /** Ordered card instance ids in the revealed set. Sent only to the revealing player. */
  readonly cardIds: readonly string[];
}

export interface SearchResolvedPayload {
  readonly playerId: string;
  /** Counts only — no card ids exposed to the opponent. */
  readonly selections: readonly { readonly disposition: string; readonly count: number }[];
}
