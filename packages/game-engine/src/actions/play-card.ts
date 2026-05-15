import { applyEffects } from '../abilities/dispatch.js';
import type { CatalogDieEntry } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, commitTriggers } from '../queue/scan.js';
import { endTurn } from '../state/turn.js';
import type { GameState, PlayerState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound } from './pass.js';
import type { ApplyResult } from './pass.js';

/**
 * Play-card action.
 *
 * Pays the card's resource cost, moves the instance from hand → discard
 * (or set-aside if the ability's `cardDisposition` says so), then fires
 * any `immediate` abilities on the card in sequence. Triggered /
 * action / powerAction abilities do not fire here; the queue wiring
 * lands in ENGINE-7.
 *
 * `characterTargets` is an ordered list of pre-resolved character
 * instance IDs for effects that need a character selection. Tests
 * supply these directly; the game-server collects them from the client
 * before dispatching.
 */
export function applyPlayCard(
  state: GameState,
  playerId: string,
  cardId: string,
  characterTargets: readonly string[] = [],
  catalog?: readonly CatalogDieEntry[],
): ApplyResult {
  guardCanAct(state, playerId);

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  if (!player.hand.includes(cardId)) {
    throw new IllegalActionError(`card ${cardId} is not in ${playerId}'s hand`);
  }

  const cost = state.cardCosts[cardId] ?? 0;
  if (player.resources < cost) {
    throw new IllegalActionError(
      `${playerId} cannot afford ${cardId}: cost ${cost}, resources ${player.resources}`,
    );
  }

  const events: EngineEvent[] = [
    { type: 'card.played', payload: { playerId, cardId, costPaid: cost } },
  ];

  // Determine card disposition from the first immediate ability that
  // specifies one, defaulting to 'discard'.
  const abilities = state.cardAbilities[cardId] ?? [];
  const immediateAbilities = abilities.filter((a) => a.kind === 'immediate');
  const disposition =
    immediateAbilities.find((a) => a.kind === 'immediate' && a.cardDisposition)?.cardDisposition ??
    'discard';

  // Pay cost and move card from hand.
  const handAfter = player.hand.filter((id) => id !== cardId);
  const discardAfter = disposition === 'discard' ? [...player.discard, cardId] : player.discard;

  const updatedPlayer: PlayerState = {
    ...player,
    resources: player.resources - cost,
    hand: handAfter,
    discard: discardAfter,
  };

  let working: GameState = {
    ...state,
    players: { ...state.players, [playerId]: updatedPlayer },
    consecutivePasses: 0,
  };

  // Run immediate abilities in order.
  const ctx = {
    playerId,
    characterTargets,
    sourceCharacterId: cardId,
    ...(catalog !== undefined ? { catalog } : {}),
  };
  for (const ability of immediateAbilities) {
    if (ability.kind !== 'immediate') continue;
    const result = applyEffects(working, ctx, ability.effects);
    working = result.state;
    events.push(...result.events);
    if (working.winnerId !== null) {
      return { state: working, events };
    }
  }

  // After triggers: scan for afterPlayCard triggers.
  const afterCandidates = collectAfterTriggers(working, events);
  working = commitTriggers(working, afterCandidates);

  if (!working.pendingTriggers) {
    const drained = drainQueue(working);
    working = drained.state;
    events.push(...drained.events);
  }

  if (working.winnerId !== null) {
    return { state: working, events };
  }

  const rotated = endTurn(working, playerId, events);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
