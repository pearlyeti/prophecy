// Queue drain: runs queued after-abilities in FIFO order.
//
// After each entry resolves, new after-triggers are scanned from the
// emitted events and added to the tail. This naturally handles test (d):
// "after-trigger spawned mid-resolution resolves at the queue's tail."
//
// Drain-spawned triggers are auto-ordered (tail-added without pendingTriggers)
// because interactive ordering during drain would require pausing the drain
// loop — deferred to a future card.

import { applySteps } from '../abilities/dispatch.js';
import type { DispatchContext } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import type { GameState } from '../state/types.js';
import { addTriggersToTail } from './scan.js';

export function drainQueue(state: GameState): { state: GameState; events: EngineEvent[] } {
  const allEvents: EngineEvent[] = [];
  let current = state;

  while (current.queue.pending.length > 0 && current.winnerId === null) {
    // Pop the head entry
    const [entry, ...rest] = current.queue.pending;
    if (!entry) break;
    current = { ...current, queue: { pending: rest } };

    const ctx: DispatchContext = {
      playerId: entry.playerId,
      characterTargets: entry.characterTargets,
      sourceCharacterId: entry.sourceCardInstanceId,
    };

    const result = applySteps(current, ctx, entry.steps);
    current = result.state;
    allEvents.push(...result.events);

    // Scan for new after-triggers spawned by this entry's effects.
    // Added to tail, not through pendingTriggers (drain-time auto-order).
    if (result.events.length > 0) {
      current = addTriggersToTail(current, result.events);
    }
  }

  return { state: current, events: allEvents };
}
