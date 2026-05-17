import { applySteps } from '../abilities/dispatch.js';
import { createRng } from '../rng/seeded-rng.js';
import type { EngineEvent } from '../events.js';
import type { GameState, PlayerState } from '../state/types.js';
import type { SearchDisposition } from '../abilities/types.js';
import { IllegalActionError } from './illegal.js';

export function applyResolveSearch(
  state: GameState,
  playerId: string,
  selections: readonly { readonly choiceIndex: number; readonly cardIds: readonly string[] }[],
): { state: GameState; events: readonly EngineEvent[] } {
  const { pendingSearch } = state;
  if (!pendingSearch) throw new IllegalActionError('no pending search to resolve');
  if (pendingSearch.waitingForPlayerId !== playerId) {
    throw new IllegalActionError(`resolve-search: waiting for ${pendingSearch.waitingForPlayerId}, got ${playerId}`);
  }

  // ── Validate ──────────────────────────────────────────────────────
  const usedCardIds = new Set<string>();
  for (const sel of selections) {
    const choice = pendingSearch.choices[sel.choiceIndex];
    if (choice === undefined) {
      throw new IllegalActionError(`resolve-search: invalid choiceIndex ${sel.choiceIndex}`);
    }
    if (sel.cardIds.length > choice.count) {
      throw new IllegalActionError(
        `resolve-search: choice ${sel.choiceIndex} allows at most ${choice.count} cards, got ${sel.cardIds.length}`,
      );
    }
    for (const cid of sel.cardIds) {
      if (!pendingSearch.revealedCardIds.includes(cid)) {
        throw new IllegalActionError(`resolve-search: card ${cid} not in revealed set`);
      }
      if (usedCardIds.has(cid)) {
        throw new IllegalActionError(`resolve-search: card ${cid} appears in multiple selections`);
      }
      if (choice.filter?.type !== undefined && state.cardTypes[cid] !== choice.filter.type) {
        throw new IllegalActionError(
          `resolve-search: card ${cid} does not satisfy filter type "${choice.filter.type}"`,
        );
      }
      if (choice.filter?.color !== undefined && state.cardMeta[cid]?.color !== choice.filter.color) {
        throw new IllegalActionError(
          `resolve-search: card ${cid} does not satisfy filter color "${choice.filter.color}"`,
        );
      }
      usedCardIds.add(cid);
    }
  }

  // ── Apply dispositions ────────────────────────────────────────────
  const sourcePlayerId =
    pendingSearch.source === 'ownDeck'
      ? playerId
      : (state.playerOrder.find((id) => id !== playerId) ?? playerId);

  const chosenCardIds = new Set<string>();
  let needsShuffle = false;

  // Build per-disposition card lists.
  const toHand: string[] = [];
  const toTop: string[] = [];
  const toBottom: string[] = [];
  const toShuffle: string[] = [];
  const toDiscard: string[] = [];

  const bucket = (cids: readonly string[], d: SearchDisposition) => {
    switch (d) {
      case 'toHand': toHand.push(...cids); break;
      case 'toTopOfDeck': toTop.push(...cids); break;
      case 'toBottomOfDeck': toBottom.push(...cids); break;
      case 'shuffleIntoDeck': toShuffle.push(...cids); needsShuffle = true; break;
      case 'discard': toDiscard.push(...cids); break;
    }
  };

  for (const sel of selections) {
    if (sel.cardIds.length === 0) continue;
    const choice = pendingSearch.choices[sel.choiceIndex]!;
    for (const cid of sel.cardIds) chosenCardIds.add(cid);
    bucket(sel.cardIds, choice.disposition);
  }

  const unchosen = pendingSearch.revealedCardIds.filter((cid) => !chosenCardIds.has(cid));
  if (unchosen.length > 0) bucket(unchosen, pendingSearch.defaultDisposition);

  // Apply all buckets in one pass.
  let searchingPlayer = state.players[playerId]!;
  let sourcePlayer = state.players[sourcePlayerId]!;

  if (toHand.length > 0) {
    searchingPlayer = { ...searchingPlayer, hand: [...searchingPlayer.hand, ...toHand] };
  }
  if (toTop.length > 0) {
    sourcePlayer = { ...sourcePlayer, deck: [...toTop, ...sourcePlayer.deck] };
  }
  if (toBottom.length > 0) {
    sourcePlayer = { ...sourcePlayer, deck: [...sourcePlayer.deck, ...toBottom] };
  }
  if (toDiscard.length > 0) {
    sourcePlayer = { ...sourcePlayer, discard: [...sourcePlayer.discard, ...toDiscard] };
  }
  if (toShuffle.length > 0) {
    sourcePlayer = { ...sourcePlayer, deck: [...sourcePlayer.deck, ...toShuffle] };
  }

  // Write updated players back to state.
  // When source and searching player are the same, merge both sets of changes.
  const updatedPlayers = { ...state.players };
  if (sourcePlayerId !== playerId) {
    updatedPlayers[sourcePlayerId] = sourcePlayer;
    updatedPlayers[playerId] = searchingPlayer;
  } else {
    updatedPlayers[playerId] = { ...sourcePlayer, hand: searchingPlayer.hand };
  }
  state = { ...state, players: updatedPlayers };

  // Shuffle the source deck if any cards went to shuffleIntoDeck.
  if (needsShuffle) {
    const rng = createRng(state.seed).fork(`search-shuffle:${state.turnIndex}`);
    const deck = [...state.players[sourcePlayerId]!.deck];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = rng.rollDie(i + 1);
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    state = {
      ...state,
      players: {
        ...state.players,
        [sourcePlayerId]: { ...state.players[sourcePlayerId]!, deck },
      },
    };
  }

  // ── Events and continuation ───────────────────────────────────────
  const events: EngineEvent[] = [
    {
      type: 'search.resolved',
      payload: {
        playerId,
        selections: selections.map((sel) => ({
          disposition: pendingSearch.choices[sel.choiceIndex]!.disposition,
          count: sel.cardIds.length,
        })),
      },
    },
  ];

  const { remainingSteps, resumePlayerId } = pendingSearch;
  state = { ...state, pendingSearch: null };

  if (remainingSteps.length > 0) {
    const { state: s2, events: e2 } = applySteps(
      state,
      { playerId: resumePlayerId, characterTargets: [] },
      remainingSteps,
    );
    state = s2;
    events.push(...e2);
  }

  return { state, events };
}
