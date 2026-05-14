// Queue and pending-trigger types.
//
// After-abilities enter the queue at the tail. Before-abilities interrupt
// inline (never enter the queue). Simultaneous after-triggers require
// player ordering before entering the queue; that ordering is captured in
// PendingTriggers and resolved via the 'order-triggers' action.
//
// See README "Engine implementation notes" and rules-reference Part 7.

import type { Effect } from '../abilities/types.js';

// ────────────────────────────────────────────────────────────────────
// Queue entries
// ────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  /** Stable id within this game session, used for ordering submissions. */
  readonly id: string;
  /** Player whose card triggered this. */
  readonly playerId: string;
  /** Card instance that carries the ability. Used to resolve thisCharacter targets. */
  readonly sourceCardInstanceId: string;
  readonly effects: readonly Effect[];
  /** Pre-resolved character targets consumed by effects in order. */
  readonly characterTargets: readonly string[];
}

export interface Queue {
  readonly pending: readonly QueueEntry[];
}

export const emptyQueue: Queue = { pending: [] };

// ────────────────────────────────────────────────────────────────────
// Pending trigger ordering
//
// When two or more after-triggers fire simultaneously the engine waits
// for player ordering before they enter the queue.
//
// Phases:
//   'orderPlayers' — battlefield controller orders the player groups
//                    (only when >1 player has simultaneous triggers)
//   'orderEntries' — waitingForPlayerId orders their own entries
//                    (only when that player has >1 entry)
// ────────────────────────────────────────────────────────────────────

export interface PendingTriggerGroup {
  readonly playerId: string;
  readonly entries: readonly QueueEntry[];
}

export interface PendingTriggers {
  /** Groups not yet committed to the queue, processed in sequence. */
  readonly remainingGroups: readonly PendingTriggerGroup[];
  /** Entries already ordered, ready to append to the queue once all groups are processed. */
  readonly readyEntries: readonly QueueEntry[];
  readonly phase: 'orderPlayers' | 'orderEntries';
  readonly waitingForPlayerId: string;
}
