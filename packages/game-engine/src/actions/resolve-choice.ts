import { applySteps } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import type { GameState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';

export function applyResolveChoice(
  state: GameState,
  playerId: string,
  picks: readonly number[],
): { state: GameState; events: readonly EngineEvent[] } {
  const { pendingChoice } = state;
  if (!pendingChoice) throw new IllegalActionError('no pending choice to resolve');
  if (pendingChoice.playerId !== playerId) {
    throw new IllegalActionError(
      `resolve-choice: waiting for ${pendingChoice.playerId}, got ${playerId}`,
    );
  }

  // ── Validate ──────────────────────────────────────────────────────
  if (picks.length !== pendingChoice.count) {
    throw new IllegalActionError(
      `resolve-choice: expected ${pendingChoice.count} pick(s), got ${picks.length}`,
    );
  }
  for (const pick of picks) {
    if (pick < 0 || pick >= pendingChoice.branches.length) {
      throw new IllegalActionError(
        `resolve-choice: pick ${pick} out of range (0..${pendingChoice.branches.length - 1})`,
      );
    }
  }
  if (new Set(picks).size !== picks.length) {
    throw new IllegalActionError('resolve-choice: duplicate branch indices in picks');
  }

  // ── Run chosen branches in order ──────────────────────────────────
  const { remainingSteps, resumePlayerId } = pendingChoice;
  state = { ...state, pendingChoice: null };

  const events: EngineEvent[] = [];
  for (const pick of picks) {
    const branch = pendingChoice.branches[pick]!;
    if (branch.steps.length > 0) {
      const { state: s2, events: e2 } = applySteps(
        state,
        { playerId: resumePlayerId, characterTargets: [] },
        branch.steps,
      );
      state = s2;
      events.push(...e2);
    }
  }

  // ── Resume remaining steps ────────────────────────────────────────
  if (remainingSteps.length > 0) {
    const { state: s3, events: e3 } = applySteps(
      state,
      { playerId: resumePlayerId, characterTargets: [] },
      remainingSteps,
    );
    state = s3;
    events.push(...e3);
  }

  return { state, events };
}
