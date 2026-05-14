// Trigger scanner: maps engine events to triggered abilities and collects
// QueueEntry candidates. Called after each significant action event to
// determine which cards have triggered.
//
// Before-triggers use a separate path (applyBeforeTriggers) and never
// enter this scan. This file only handles 'after' triggers.

import type { TriggeredAbility } from '../abilities/types.js';
import type { EngineEvent } from '../events.js';
import type { GameState } from '../state/types.js';
import {
  emptyQueue,
  type PendingTriggers,
  type PendingTriggerGroup,
  type QueueEntry,
} from './types.js';

// ────────────────────────────────────────────────────────────────────
// After-trigger collection
// ────────────────────────────────────────────────────────────────────

/**
 * Scan all characters in play for after-triggered abilities that match
 * any of the provided engine events. Returns the list of QueueEntry
 * candidates grouped by player, ready to pass to `commitTriggers`.
 *
 * Called by action handlers after their primary events are emitted.
 * During queue drain, use `addTriggersToTail` instead (bypasses ordering).
 */
export function collectAfterTriggers(
  state: GameState,
  events: readonly EngineEvent[],
): readonly { playerId: string; entry: QueueEntry }[] {
  const results: { playerId: string; entry: QueueEntry }[] = [];

  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) continue;

    for (const charId of player.characterOrder) {
      const abilities = state.cardAbilities[charId] ?? [];
      for (let ai = 0; ai < abilities.length; ai++) {
        const ability = abilities[ai]!;
        if (ability.kind !== 'triggered') continue;

        // Check each event — a single ability can only trigger once per scan
        // even if multiple matching events were emitted.
        for (const event of events) {
          if (!matchesAfterTrigger(ability, event, playerId, charId, state)) continue;

          results.push({
            playerId,
            entry: {
              id: `q-${state.nextQueueEntryId + results.length}`,
              playerId,
              sourceCardInstanceId: charId,
              effects: ability.effects,
              characterTargets: [],
            },
          });
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Commit collected after-triggers into the game state.
 *
 * - 0 triggers: no change
 * - 1 trigger: added directly to queue tail
 * - >1 triggers from 1 player: pendingTriggers for that player to order
 * - >1 triggers from multiple players: pendingTriggers for BC to order players
 *
 * Increments `state.nextQueueEntryId` for each entry created.
 */
export function commitTriggers(
  state: GameState,
  candidates: readonly { playerId: string; entry: QueueEntry }[],
): GameState {
  if (candidates.length === 0) return state;

  const idOffset = state.nextQueueEntryId;
  const nextId = idOffset + candidates.length;

  if (candidates.length === 1) {
    const entry = candidates[0]!.entry;
    return {
      ...state,
      queue: { pending: [...state.queue.pending, entry] },
      nextQueueEntryId: nextId,
    };
  }

  // Group by player (preserve discovery order within each group)
  const groupMap = new Map<string, QueueEntry[]>();
  for (const { playerId, entry } of candidates) {
    const group = groupMap.get(playerId) ?? [];
    group.push(entry);
    groupMap.set(playerId, group);
  }

  const groups: PendingTriggerGroup[] = [];
  for (const [pid, entries] of groupMap) {
    groups.push({ playerId: pid, entries });
  }

  const withNextId: GameState = { ...state, nextQueueEntryId: nextId };

  if (groups.length === 1) {
    const group = groups[0]!;
    if (group.entries.length === 1) {
      // Single entry from one player — straight to queue
      return {
        ...withNextId,
        queue: { pending: [...state.queue.pending, ...group.entries] },
      };
    }
    // One player with multiple entries — needs their ordering
    return setPendingTriggers(withNextId, groups, 'orderEntries', group.playerId);
  }

  // Multiple players — battlefield controller orders the groups first
  const bcId = state.battlefieldControllerId ?? state.playerOrder[0]!;
  return setPendingTriggers(withNextId, groups, 'orderPlayers', bcId);
}

/**
 * Add triggers directly to the queue tail without ordering.
 * Used during queue drain when new after-triggers fire mid-resolution —
 * they go to the tail per the rules, and interactive ordering for
 * drain-spawned triggers is deferred to a future card.
 */
export function addTriggersToTail(
  state: GameState,
  events: readonly EngineEvent[],
): GameState {
  const candidates = collectAfterTriggers(state, events);
  if (candidates.length === 0) return state;

  const newEntries = candidates.map((c) => c.entry);
  return {
    ...state,
    queue: { pending: [...state.queue.pending, ...newEntries] },
    nextQueueEntryId: state.nextQueueEntryId + newEntries.length,
  };
}

// ────────────────────────────────────────────────────────────────────
// Before-trigger collection
// ────────────────────────────────────────────────────────────────────

export interface BeforeTriggerCandidate {
  readonly playerId: string;
  readonly sourceCardInstanceId: string;
  readonly ability: TriggeredAbility;
}

/**
 * Scan all characters in play for before-triggered abilities matching
 * the given trigger kind. Results are used by action handlers to run
 * before-triggers inline.
 *
 * Only covers trigger kinds that can fire 'before': beforeActivate,
 * beforeTakeDamage, beforeCharacterDefeated.
 */
export function collectBeforeTriggers(
  state: GameState,
  triggerKind: 'beforeActivate' | 'beforeTakeDamage' | 'beforeCharacterDefeated',
  context: BeforeContext,
): readonly BeforeTriggerCandidate[] {
  const results: BeforeTriggerCandidate[] = [];

  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) continue;

    for (const charId of player.characterOrder) {
      const abilities = state.cardAbilities[charId] ?? [];
      for (const ability of abilities) {
        if (ability.kind !== 'triggered') continue;
        if (ability.triggerEvent.kind !== triggerKind) continue;
        if (!matchesBeforeContext(ability.triggerEvent.kind, context, playerId, charId, state)) continue;

        results.push({ playerId, sourceCardInstanceId: charId, ability });
      }
    }
  }

  return results;
}

export interface BeforeContext {
  /** For beforeActivate: who is activating */
  activatingPlayerId?: string;
  activatingCharacterId?: string;
  /** For beforeTakeDamage / beforeCharacterDefeated: which character */
  targetCharacterId?: string;
  targetOwnerId?: string;
}

// ────────────────────────────────────────────────────────────────────
// Matching helpers
// ────────────────────────────────────────────────────────────────────

function matchesAfterTrigger(
  ability: TriggeredAbility,
  event: EngineEvent,
  ownerPlayerId: string,
  sourceCharId: string,
  state: GameState,
): boolean {
  const t = ability.triggerEvent;

  switch (t.kind) {
    case 'afterActivateCharacter': {
      if (event.type !== 'character.activated') return false;
      const ownOnly = t.ownOnly ?? true;
      return !ownOnly || event.payload.playerId === ownerPlayerId;
    }
    case 'afterDealDamage': {
      return event.type === 'damage.dealt';
    }
    case 'afterTakeDamage': {
      if (event.type !== 'damage.dealt') return false;
      // Only fires for the player whose character took the damage
      return state.players[ownerPlayerId]?.characters[event.payload.characterId] !== undefined;
    }
    case 'afterCharacterDefeated': {
      if (event.type !== 'character.defeated') return false;
      const whose = t.whose ?? 'any';
      const defeatedOwner = event.payload.playerId;
      if (whose === 'own' && defeatedOwner !== ownerPlayerId) return false;
      if (whose === 'opponent' && defeatedOwner === ownerPlayerId) return false;
      return true;
    }
    case 'afterPlayCard':
      return event.type === 'card.played';
    case 'afterClaimBattlefield':
      return event.type === 'battlefield.claimed';
    case 'afterResolveDie':
      return event.type === 'dice.resolved';
    case 'afterActivateSupport':
    case 'afterPlayUpgrade':
    case 'afterDieRolledSymbol':
    case 'afterRemoveDice':
      // Not yet wired to engine events
      return false;
    default:
      return false;
  }
}

function matchesBeforeContext(
  kind: 'beforeActivate' | 'beforeTakeDamage' | 'beforeCharacterDefeated',
  ctx: BeforeContext,
  ownerPlayerId: string,
  _sourceCharId: string,
  state: GameState,
): boolean {
  switch (kind) {
    case 'beforeActivate': {
      // Fires for the owner of the triggering card when they activate
      if (!ctx.activatingPlayerId) return false;
      return ctx.activatingPlayerId === ownerPlayerId;
    }
    case 'beforeTakeDamage': {
      // Fires for the player whose character is about to take damage
      if (!ctx.targetCharacterId) return false;
      return state.players[ownerPlayerId]?.characters[ctx.targetCharacterId] !== undefined;
    }
    case 'beforeCharacterDefeated': {
      if (!ctx.targetCharacterId) return false;
      return state.players[ownerPlayerId]?.characters[ctx.targetCharacterId] !== undefined;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Pending trigger helpers
// ────────────────────────────────────────────────────────────────────

function setPendingTriggers(
  state: GameState,
  groups: PendingTriggerGroup[],
  phase: PendingTriggers['phase'],
  waitingForPlayerId: string,
): GameState {
  return {
    ...state,
    pendingTriggers: {
      remainingGroups: groups,
      readyEntries: [],
      phase,
      waitingForPlayerId,
    },
  };
}

/**
 * Process the `order-triggers` action. Advances the pending ordering
 * state machine until all groups are resolved or the next player needs
 * to submit their order.
 *
 * `order` meaning:
 * - phase 'orderPlayers': ordered list of player IDs
 * - phase 'orderEntries': ordered list of entry IDs within the current player's group
 */
export function applyOrderTriggers(
  state: GameState,
  _playerId: string,
  order: readonly string[],
): GameState {
  const pt = state.pendingTriggers;
  if (!pt) return state;

  if (pt.phase === 'orderPlayers') {
    // BC is ordering the player groups
    const reordered = order
      .map((pid) => pt.remainingGroups.find((g) => g.playerId === pid))
      .filter((g): g is PendingTriggerGroup => g !== undefined);

    // Fill in any groups not mentioned (keep them at the end)
    const mentioned = new Set(order);
    const rest = pt.remainingGroups.filter((g) => !mentioned.has(g.playerId));

    return advanceOrdering(state, [...reordered, ...rest], pt.readyEntries);
  } else {
    // A player is ordering their own entries
    const currentGroup = pt.remainingGroups[0];
    if (!currentGroup) return { ...state, pendingTriggers: null };

    const reorderedEntries = order
      .map((id) => currentGroup.entries.find((e) => e.id === id))
      .filter((e): e is QueueEntry => e !== undefined);

    // Fill in any entries not mentioned
    const mentioned = new Set(order);
    const rest = currentGroup.entries.filter((e) => !mentioned.has(e.id));

    const orderedEntries = [...reorderedEntries, ...rest];
    const newReady = [...pt.readyEntries, ...orderedEntries];

    return advanceOrdering(state, pt.remainingGroups.slice(1), newReady);
  }
}

/**
 * Advance the ordering state machine with the remaining groups and
 * already-ready entries. Processes single-entry groups automatically.
 */
function advanceOrdering(
  state: GameState,
  remaining: PendingTriggerGroup[],
  ready: readonly QueueEntry[],
): GameState {
  // Process leading single-entry groups automatically
  let groups = remaining;
  let entries = ready;

  while (groups.length > 0 && groups[0]!.entries.length === 1) {
    entries = [...entries, ...groups[0]!.entries];
    groups = groups.slice(1);
  }

  if (groups.length === 0) {
    // All done — commit to queue
    return {
      ...state,
      queue: { pending: [...state.queue.pending, ...entries] },
      pendingTriggers: null,
    };
  }

  // Next group needs player ordering
  const nextGroup = groups[0]!;
  return {
    ...state,
    pendingTriggers: {
      remainingGroups: groups,
      readyEntries: entries,
      phase: 'orderEntries',
      waitingForPlayerId: nextGroup.playerId,
    },
  };
}

// Export emptyQueue re-export for convenience
export { emptyQueue };
