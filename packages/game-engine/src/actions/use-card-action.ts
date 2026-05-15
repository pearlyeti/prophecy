import { applyEffects, NotImplementedError, type DispatchContext } from '../abilities/dispatch.js';
import type { EngineEvent } from '../events.js';
import { drainQueue } from '../queue/drain.js';
import { collectAfterTriggers, commitTriggers } from '../queue/scan.js';
import { endTurn } from '../state/turn.js';
import type { GameState } from '../state/types.js';
import { IllegalActionError } from './illegal.js';
import { guardCanAct, runUpkeepAndStartRound, type ApplyResult } from './pass.js';

/**
 * Use a character's Action or Power Action ability.
 *
 * Server-authoritative: all legality checks happen here. The client
 * never owns game state — it only renders what the server sends back.
 *
 * Power actions are gated by `character.powerActionUsedThisRound`, which
 * the engine resets each upkeep. The client reads this field from the
 * authoritative GameState; it never tracks power-action usage itself.
 */
export function applyUseCardAction(
  state: GameState,
  playerId: string,
  cardId: string,
  abilityIndex: number,
): ApplyResult {
  guardCanAct(state, playerId);

  const player = state.players[playerId];
  if (!player) throw new Error(`player ${playerId} missing from state`);

  // use-card-action currently handles in-play character abilities only.
  const character = player.characters[cardId];
  if (!character) {
    throw new IllegalActionError(
      `card ${cardId} is not an in-play character for player ${playerId}`,
    );
  }

  const abilities = state.cardAbilities[cardId] ?? [];
  if (abilityIndex < 0 || abilityIndex >= abilities.length) {
    throw new IllegalActionError(
      `ability index ${abilityIndex} out of range for card ${cardId} (has ${abilities.length} abilities)`,
    );
  }
  const ability = abilities[abilityIndex]!;

  if (ability.kind !== 'action' && ability.kind !== 'powerAction') {
    throw new IllegalActionError(
      `ability ${abilityIndex} on card ${cardId} is kind "${ability.kind}", expected action or powerAction`,
    );
  }

  if (ability.kind === 'powerAction' && character.powerActionUsedThisRound) {
    throw new IllegalActionError(
      `power action on card ${cardId} has already been used this round`,
    );
  }

  // ── Pay costs ────────────────────────────────────────────────────────
  let working: GameState = state;
  const allEvents: EngineEvent[] = [];

  for (const cost of ability.costs ?? []) {
    switch (cost.kind) {
      case 'exhaust': {
        const c = working.players[playerId]!.characters[cardId]!;
        if (c.exhausted) {
          throw new IllegalActionError(`character ${cardId} is already exhausted`);
        }
        const p = working.players[playerId]!;
        working = {
          ...working,
          players: {
            ...working.players,
            [playerId]: {
              ...p,
              characters: { ...p.characters, [cardId]: { ...c, exhausted: true } },
            },
          },
        };
        break;
      }
      case 'spendResources': {
        const p = working.players[playerId]!;
        if (p.resources < cost.amount) {
          throw new IllegalActionError(
            `not enough resources: need ${cost.amount}, have ${p.resources}`,
          );
        }
        working = {
          ...working,
          players: {
            ...working.players,
            [playerId]: { ...p, resources: p.resources - cost.amount },
          },
        };
        break;
      }
      default:
        throw new NotImplementedError(`action cost "${cost.kind}"`);
    }
  }

  // ── Fire effects ─────────────────────────────────────────────────────
  const ctx: DispatchContext = {
    playerId,
    characterTargets: [],
    sourceCharacterId: cardId,
  };
  const effectResult = applyEffects(working, ctx, ability.effects);
  working = effectResult.state;
  allEvents.push(...effectResult.events);

  // ── Mark power action used ────────────────────────────────────────────
  if (ability.kind === 'powerAction') {
    const p = working.players[playerId]!;
    working = {
      ...working,
      players: {
        ...working.players,
        [playerId]: {
          ...p,
          characters: {
            ...p.characters,
            [cardId]: { ...p.characters[cardId]!, powerActionUsedThisRound: true },
          },
        },
      },
    };
  }

  allEvents.push({
    type: 'card.action-used',
    payload: { playerId, cardId, abilityIndex, abilityKind: ability.kind },
  });

  working = { ...working, consecutivePasses: 0 };

  // ── After triggers ───────────────────────────────────────────────────
  const actionUsedEvent = allEvents[allEvents.length - 1]!;
  const afterCandidates = collectAfterTriggers(working, [actionUsedEvent]);
  working = commitTriggers(working, afterCandidates);
  if (!working.pendingTriggers) {
    const drained = drainQueue(working);
    working = drained.state;
    allEvents.push(...drained.events);
  }

  if (working.winnerId !== null) {
    return { state: working, events: allEvents };
  }

  const rotated = endTurn(working, playerId, allEvents);
  if (rotated.allPlayersPassed) {
    return runUpkeepAndStartRound(rotated.state, rotated.events);
  }
  return { state: rotated.state, events: rotated.events };
}
