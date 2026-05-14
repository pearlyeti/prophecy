import { drainQueue } from '../queue/drain';
import { applyOrderTriggers } from '../queue/scan';
import type { GameState } from '../state/types';
import { IllegalActionError } from './illegal';
import type { ApplyResult } from './pass';

/**
 * Submit an ordering for simultaneous pending triggers.
 *
 * When multiple after-triggers fire at the same time, the engine waits
 * for player ordering before committing them to the queue. This action
 * advances that ordering state machine.
 *
 * Once all pending groups are resolved the queue drains automatically.
 */
export function applyOrderTriggersAction(
  state: GameState,
  playerId: string,
  order: readonly string[],
): ApplyResult {
  if (!state.pendingTriggers) {
    throw new IllegalActionError('no pending triggers to order');
  }
  if (state.pendingTriggers.waitingForPlayerId !== playerId) {
    throw new IllegalActionError(
      `waiting for ${state.pendingTriggers.waitingForPlayerId} to order triggers, not ${playerId}`,
    );
  }

  const ordered = applyOrderTriggers(state, playerId, order);

  // If ordering is complete, drain the queue now.
  if (!ordered.pendingTriggers) {
    const { state: drained, events } = drainQueue(ordered);
    return { state: drained, events };
  }

  return { state: ordered, events: [] };
}
