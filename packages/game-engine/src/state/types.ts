// Core type definitions for the rules engine.
// These mirror the abstract game system in docs/rules-reference.md.
// Implementation comes incrementally; this file exists so dependent
// packages can refer to the public surface.

export type Faction = 'light' | 'shadow' | 'neutral';

export type Color = 'red' | 'blue' | 'yellow' | 'gray';

export type CardType = 'character' | 'upgrade' | 'support' | 'event' | 'plot' | 'battlefield';

export type DieSymbol =
  | 'melee'
  | 'ranged'
  | 'indirect'
  | 'shield'
  | 'resource'
  | 'disrupt'
  | 'discard'
  | 'focus'
  | 'special'
  | 'blank';

export type Keyword = 'ambush' | 'guardian' | 'modify' | 'redeploy';

export interface DieFace {
  readonly symbol: DieSymbol;
  readonly value: number;
  readonly cost: number;
  readonly modifier: boolean;
}

export interface DieDefinition {
  readonly id: string;
  readonly faces: readonly [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];
}

export interface CardId {
  readonly id: string;
}

export interface Damage {
  readonly amount: number;
  readonly kind: 'melee' | 'ranged' | 'indirect' | 'unspecified';
  readonly unblockable?: boolean;
}

export interface Shield {
  readonly count: number;
}

export interface DieInPool {
  readonly instanceId: string;
  readonly cardId: string;
  readonly faceIndex: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface PlayerState {
  readonly id: string;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discardIds: readonly string[];
  readonly resources: number;
  readonly handSize: number;
  readonly characterIds: readonly string[];
  readonly battlefieldId: string | null;
  readonly diceInPool: readonly DieInPool[];
}

export type Phase = 'setup' | 'action' | 'upkeep' | 'ended';

export interface GameState {
  readonly seed: string;
  readonly turnIndex: number;
  readonly roundNumber: number;
  readonly phase: Phase;
  readonly battlefieldControllerId: string | null;
  readonly playerOrder: readonly string[];
  readonly activePlayerId: string | null;
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly consecutivePasses: number;
  readonly winnerId: string | null;
}
