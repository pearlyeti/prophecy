import { getLegalActions, type DieSymbol, type DieInPool, type DieFace, type CharacterState } from '@prophecy/game-engine';
import type { Action, Card, EngineEvent, GameState, LobbyState } from '@prophecy/protocol';
import { isError } from '@prophecy/protocol';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const DicePool3D = lazy(() => import('./DicePool3D.js'));

import { fetchCards } from './designer/api.js';
import { CARD_COLORS, FALLBACK_COLOR, symLabel } from '../lib/dieFaceTexture.js';
import type { FacePickEvent } from '../store.js';

import { getSocket } from '../lib/socket.js';
import { useApp, type ActiveFlow, type SelectionMode } from '../store.js';

// Bare-bones in-game UI. Renders the public game state and exposes the
// implemented actions as buttons. Pretty UI comes later — first goal is
// proving end-to-end multiplayer with two real clients.
type HandMode = 'browse' | 'play' | 'reroll';

export function Game() {
  const playerId = useApp((s) => s.playerId);
  const lobby = useApp((s) => s.lobby);
  const game = useApp((s) => s.game);
  const events = useApp((s) => s.recentEvents);
  const setError = useApp((s) => s.setError);
  const selectionMode = useApp((s) => s.selectionMode);
  const exitSelectionMode = useApp((s) => s.exitSelectionMode);
  const enterRerollMode = useApp((s) => s.enterRerollMode);
  const setActiveFlow = useApp((s) => s.setActiveFlow);

  const [catalog, setCatalog] = useState<Card[]>([]);
  const [handMode, setHandMode] = useState<HandMode | null>(null);
  const [handFocusId, setHandFocusId] = useState<string | null>(null);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

  useEffect(() => {
    fetchCards().then(setCatalog).catch(() => {});
  }, []);

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  // Drop selection-mode state if the turn rotates away or the game
  // leaves the action phase. Without this, a lingering selection from
  // a prior turn would re-render the bottom bar over a state where it
  // makes no sense.
  const isMyTurn = game?.activePlayerId === playerId;
  const inActionPhase = game?.phase === 'action';
  useEffect(() => {
    if (!isMyTurn || !inActionPhase) {
      exitSelectionMode();
      setActiveFlow(null);
    }
  }, [isMyTurn, inActionPhase, exitSelectionMode, setActiveFlow]);

  // Close hand overlay on turn rotation too.
  useEffect(() => {
    if (!inActionPhase) { setHandMode(null); setHandFocusId(null); }
  }, [inActionPhase]);

  // Close action panel when it's no longer relevant.
  useEffect(() => {
    if (!isMyTurn || !inActionPhase) setActionPanelOpen(false);
  }, [isMyTurn, inActionPhase]);


  if (!lobby || !game) return null;

  const send = (action: Action) => {
    getSocket().emit(
      'game.action',
      { playerId, roomId: lobby.roomId, action },
      (resp) => {
        if (isError(resp)) setError(resp.message);
      },
    );
  };

  const ended = game.phase === 'ended';
  const myPlayer = game.players[playerId];

  const openHand = (mode: HandMode, focusId?: string) => {
    const firstCard = myPlayer?.hand[0] ?? null;
    setHandMode(mode);
    setHandFocusId(focusId ?? firstCard);
  };
  const closeHand = () => { setHandMode(null); setHandFocusId(null); };

  const handlePlay = (instanceId: string) => {
    send({ type: 'play-card', playerId, cardId: instanceId });
    closeHand();
  };
  const handleReroll = (instanceId: string) => {
    enterRerollMode(instanceId);
    closeHand();
  };

  const dragEnabled = isMyTurn && inActionPhase && selectionMode === null && handMode === null;
  const drag = useDragToPlay(
    (instanceId) => send({ type: 'play-card', playerId, cardId: instanceId }),
    dragEnabled,
  );

  return (
    <main
      data-droptarget="play"
      className={`flex h-dvh flex-col overflow-hidden ${drag.dragging && drag.overZone ? 'outline outline-2 outline-emerald-500 outline-offset-[-4px]' : ''}`}
    >
      {/* ── Setup modal ──────────────────────────────────────────── */}
      {!ended && game.phase === 'setup' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md overflow-y-auto rounded-2xl shadow-2xl" style={{ maxHeight: '80dvh' }}>
            <SetupPanel game={game} playerId={playerId} send={send} />
          </div>
        </div>
      )}

      {/* ── Ended banner ─────────────────────────────────────────── */}
      {ended && <EndedBanner game={game} playerId={playerId} />}

      {/* ── Actions overlay ──────────────────────────────────────── */}
      {actionPanelOpen && !ended && game.phase === 'action' && !selectionMode && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close actions"
            onClick={() => setActionPanelOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl">
            <ActionPanel
              game={game}
              playerId={playerId}
              send={send}
              isMyTurn={isMyTurn}
              onOpenHand={openHand}
              onActionDispatched={() => setActionPanelOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Battle zone — fills all space ────────────────────────── */}
      <BattleZone
        game={game}
        playerId={playerId}
        catalogById={catalogById}
        send={send}
        isMyTurn={isMyTurn}
        onOpenActionPanel={() => setActionPanelOpen(true)}
        onOpenHand={openHand}
        getDragHandlers={drag.getHandlers}
        className="min-h-0 flex-1"
      />

      {drag.dragging && (
        <DragArtifact
          card={drag.dragging}
          overZone={drag.overZone}
          artifactRef={drag.artifactRef}
        />
      )}

      {handMode && myPlayer && (
        <HandOverlay
          hand={myPlayer.hand}
          game={game}
          playerId={playerId}
          mode={handMode}
          catalogById={catalogById}
          initialFocusId={handFocusId}
          isMyTurn={isMyTurn}
          onPlay={handlePlay}
          onReroll={handleReroll}
          onClose={closeHand}
        />
      )}

    </main>
  );
}

function SetupPanel({
  game,
  playerId,
  send,
}: {
  game: GameState;
  playerId: string;
  send: (a: Action) => void;
}) {
  if (!game.setup) return null;
  const lobby = useApp.getState().lobby!;
  const isWinner = playerId === game.setup.rollOffWinnerId;
  const winnerName = lobby.members.find((m) => m.playerId === game.setup!.rollOffWinnerId)?.displayName;
  const isShieldRecipient = playerId === game.setup.shieldRecipientId;
  const myCharacters = game.players[playerId]?.characterOrder ?? [];

  return (
    <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-3 text-sm text-neutral-300">
        Roll-off:&nbsp;
        {Object.entries(game.setup.rollOffValues).map(([id, val]) => {
          const name = lobby.members.find((m) => m.playerId === id)?.displayName ?? id;
          return (
            <span key={id} className="mr-3">
              <span className="text-neutral-400">{name}</span>{' '}
              <span className="font-mono text-neutral-100">{val}</span>
            </span>
          );
        })}
        <span className="ml-2 text-neutral-500">→ winner: {winnerName}</span>
      </div>

      {game.setup.step === 'choose-first-player' && isWinner && (
        <div className="space-y-2">
          <div className="text-sm text-neutral-300">Choose who goes first (their battlefield is in play):</div>
          <div className="flex flex-wrap gap-2">
            {lobby.members.map((m) => (
              <button
                key={m.playerId}
                type="button"
                onClick={() =>
                  send({
                    type: 'setup.choose-first-player',
                    playerId,
                    firstPlayerId: m.playerId,
                  })
                }
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm hover:border-neutral-500"
              >
                {m.playerId === playerId ? 'I go first' : `${m.displayName} goes first`}
              </button>
            ))}
          </div>
        </div>
      )}

      {game.setup.step === 'choose-first-player' && !isWinner && (
        <div className="text-sm text-neutral-400">Waiting for {winnerName} to choose who goes first…</div>
      )}

      {game.setup.step === 'place-shields' && isShieldRecipient && (
        <div className="space-y-2">
          <div className="text-sm text-neutral-300">
            Place a shield ({game.setup.shieldsRemaining} remaining):
          </div>
          <div className="flex flex-wrap gap-2">
            {myCharacters.map((cid) => {
              const c = game.players[playerId]!.characters[cid]!;
              const full = c.shields >= 3;
              return (
                <button
                  key={cid}
                  type="button"
                  disabled={full}
                  onClick={() => send({ type: 'setup.place-shield', playerId, characterId: cid })}
                  className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Character {cid.replace(/^.*\./, '')}
                  <span className="ml-2 text-xs text-neutral-500">(shields: {c.shields}/3)</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {game.setup.step === 'place-shields' && !isShieldRecipient && (
        <div className="text-sm text-neutral-400">
          Waiting for opponent to distribute shields…
        </div>
      )}
    </section>
  );
}

type OpenOverlay =
  | { kind: 'activate' }
  | { kind: 'confirm-claim' }
  | { kind: 'confirm-concede' };

function ActionPanel({
  game,
  playerId,
  send,
  isMyTurn,
  onOpenHand,
  onActionDispatched,
}: {
  game: GameState;
  playerId: string;
  send: (a: Action) => void;
  isMyTurn: boolean;
  onOpenHand: (mode: HandMode) => void;
  onActionDispatched?: () => void;
}) {
  const [overlay, setOverlay] = useState<OpenOverlay | null>(null);
  const enterResolveMode = useApp((s) => s.enterResolveMode);
  const legal = getLegalActions(game, playerId);
  const close = () => setOverlay(null);
  const dispatch = (a: Action) => { send(a); close(); onActionDispatched?.(); };
  const me = game.players[playerId];

  return (
    <div className="p-4">
      <div className="mb-3 text-sm text-neutral-300">
        {isMyTurn ? 'Your turn — pick an action:' : 'Waiting for opponent…'}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <ActionButton
          label="Activate"
          subLabel="character"
          enabled={legal.activatableCharacterIds.length > 0}
          onClick={() => setOverlay({ kind: 'activate' })}
        />
        <ActionButton
          label="Resolve dice"
          subLabel={legal.resolvableSymbols.length > 0 ? `${me?.diceInPool.length ?? 0} in pool` : 'pool empty'}
          enabled={legal.resolvableSymbols.length > 0}
          onClick={() => { enterResolveMode(); onActionDispatched?.(); }}
        />
        <ActionButton
          label="Play card"
          subLabel={legal.canPlayCard ? `${me?.hand.length ?? 0} in hand` : 'no card affordable'}
          enabled={legal.canPlayCard}
          onClick={() => { onOpenHand('play'); onActionDispatched?.(); }}
        />
        <ActionButton
          label="Discard to reroll"
          subLabel={
            isMyTurn
              ? (me?.hand.length ?? 0) > 0
                ? `${me?.hand.length} in hand`
                : 'no cards to discard'
              : ''
          }
          enabled={isMyTurn && (me?.hand.length ?? 0) > 0}
          onClick={() => { onOpenHand('reroll'); onActionDispatched?.(); }}
        />
        <ActionButton
          label="Pass"
          enabled={legal.canPass}
          onClick={() => dispatch({ type: 'pass', playerId })}
        />
        <ActionButton
          label="Claim battlefield"
          subLabel={game.playerWhoClaimedThisRound !== null ? 'taken this round' : 'destructive'}
          enabled={legal.canClaim}
          tone="warning"
          onClick={() => setOverlay({ kind: 'confirm-claim' })}
        />
        <ActionButton
          label="Concede"
          subLabel="destructive"
          enabled={legal.canConcede}
          tone="danger"
          onClick={() => setOverlay({ kind: 'confirm-concede' })}
        />
      </div>

      {overlay?.kind === 'activate' && (
        <ActionOverlay title="Activate which character?" onClose={close}>
          <TargetGrid>
            {me?.characterOrder.map((cid) => {
              const c = me.characters[cid]!;
              const enabled = legal.activatableCharacterIds.includes(cid);
              return (
                <TargetButton
                  key={cid}
                  enabled={enabled}
                  onClick={() => dispatch({ type: 'activate', playerId, cardId: cid })}
                >
                  <div className="text-sm">Character {cid.replace(/^.*\./, '')}</div>
                  <div className="text-[11px] text-neutral-400">
                    {c.dice.length}d{c.elite ? ' · elite' : ''}
                    {c.exhausted ? ' · exhausted' : ''}
                  </div>
                </TargetButton>
              );
            })}
          </TargetGrid>
        </ActionOverlay>
      )}

      {overlay?.kind === 'confirm-claim' && (
        <ConfirmOverlay
          title="Claim the battlefield?"
          body="You'll skip the rest of your turns this round. Other players' turns continue until they pass."
          confirmLabel="Claim"
          tone="warning"
          onConfirm={() => dispatch({ type: 'claim-battlefield', playerId })}
          onCancel={close}
        />
      )}

      {overlay?.kind === 'confirm-concede' && (
        <ConfirmOverlay
          title="Concede the game?"
          body="Your opponent wins immediately. This cannot be undone."
          confirmLabel="Concede"
          tone="danger"
          onConfirm={() => dispatch({ type: 'concede', playerId })}
          onCancel={close}
        />
      )}
    </div>
  );
}

function ActionButton({
  label,
  subLabel,
  enabled,
  onClick,
  tone = 'default',
}: {
  label: string;
  subLabel?: string;
  enabled: boolean;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-red-900 bg-red-950/40 text-red-200 hover:border-red-700'
      : tone === 'warning'
        ? 'border-amber-900 bg-amber-950/30 text-amber-100 hover:border-amber-700'
        : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      // min-h-[44px] enforces the touch-first 44×44 rule from working
      // agreement #10. Disabled buttons stay visible (dimmed) so the
      // player can see what's available next turn.
      className={`flex min-h-[44px] flex-col items-start rounded-lg border px-3 py-2 text-left transition ${toneClasses} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="text-sm font-medium">{label}</span>
      {subLabel && (
        <span className="text-[11px] text-neutral-500">{subLabel}</span>
      )}
    </button>
  );
}

// Bottom-sheet on touch widths, centered modal on sm+. Closes on
// backdrop tap. Escape key closes too (keyboard parity with touch).
function ActionOverlay({
  title,
  children,
  onClose,
  backLabel,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  backLabel?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-md px-3 text-xs uppercase tracking-wider text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          >
            {backLabel ?? 'Close'}
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function TargetGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

function TargetButton({
  enabled,
  onClick,
  children,
}: {
  enabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="flex min-h-[44px] flex-col items-start rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-neutral-100 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ConfirmOverlay({
  title,
  body,
  confirmLabel,
  tone,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'warning' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmClasses =
    tone === 'danger'
      ? 'border-red-700 bg-red-900 text-red-50 hover:bg-red-800'
      : 'border-amber-700 bg-amber-900 text-amber-50 hover:bg-amber-800';
  return (
    <ActionOverlay title={title} onClose={onCancel}>
      <p className="mb-4 text-sm text-neutral-300">{body}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm ${confirmClasses}`}
        >
          {confirmLabel}
        </button>
      </div>
    </ActionOverlay>
  );
}

function EndedBanner({ game, playerId }: { game: GameState; playerId: string }) {
  const lobby = useApp.getState().lobby!;
  const winnerName = game.winnerId
    ? lobby.members.find((m) => m.playerId === game.winnerId)?.displayName ?? game.winnerId
    : 'no one';
  const isWinner = game.winnerId === playerId;
  return (
    <section
      className={`mb-4 rounded-xl border p-4 text-center ${isWinner ? 'border-emerald-700 bg-emerald-950/30' : 'border-neutral-800 bg-neutral-900/40'}`}
    >
      <div className="text-sm uppercase tracking-wider text-neutral-400">
        {isWinner ? 'Victory' : 'Defeat'}
      </div>
      <div className="text-lg font-semibold">{winnerName} wins.</div>
      <button
        type="button"
        onClick={() => useApp.getState().reset()}
        className="mt-3 min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
      >
        Leave game
      </button>
    </section>
  );
}

// ─── Activity log ────────────────────────────────────────────────────────────

const LOG_CHIP_COLORS: Record<string, string> = {
  melee:    'bg-red-900 text-red-200',
  ranged:   'bg-orange-900 text-orange-200',
  shield:   'bg-blue-900 text-blue-200',
  resource: 'bg-green-900 text-green-200',
  disrupt:  'bg-purple-900 text-purple-200',
  focus:    'bg-yellow-900 text-yellow-100',
  discard:  'bg-neutral-700 text-neutral-300',
  modifier: 'bg-neutral-700 text-neutral-300',
};

function DieChip({ symbol, value, modifier }: { symbol: string; value: number; modifier: boolean }) {
  const cls = LOG_CHIP_COLORS[symbol] ?? 'bg-neutral-700 text-neutral-300';
  const label = symbol.charAt(0).toUpperCase() + symbol.slice(1);
  return (
    <span className={`inline-flex items-baseline rounded px-1 py-0.5 font-mono text-[10px] leading-none ${cls}`}>
      {modifier && '+'}{value > 0 ? `${value} ` : ''}{label}
    </span>
  );
}

type LogEntry =
  | { readonly kind: 'divider'; readonly key: string; readonly label: string }
  | { readonly kind: 'entry'; readonly key: string; readonly node: ReactNode };

function buildLogEntries(
  events: readonly EngineEvent[],
  lobby: LobbyState | null,
  game: GameState,
  catalogById: Map<string, Card>,
): LogEntry[] {
  const pn = (pid: string) => (
    <strong className="font-semibold text-neutral-100">
      {lobby?.members.find((m) => m.playerId === pid)?.displayName ?? pid.slice(-6)}
    </strong>
  );
  const cn = (cid: string) => {
    const catId = game.cardCatalogIds[cid];
    const name = catId ? catalogById.get(catId)?.name : undefined;
    return <strong className="font-semibold text-neutral-100">{name ?? cid.split('.').pop()}</strong>;
  };
  const inn = (iid: string) => {
    const catId = game.cardCatalogIds[iid];
    const name = catId ? catalogById.get(catId)?.name : undefined;
    return <strong className="font-semibold text-neutral-100">{name ?? iid.split('.').pop()}</strong>;
  };

  const out: LogEntry[] = [];
  let i = 0;

  while (i < events.length) {
    const e = events[i];
    if (!e) { i++; continue; }
    const key = `${i}:${e.type}`;

    switch (e.type) {
      case 'round.begin':
        out.push({ kind: 'divider', key, label: `Round ${e.payload.roundNumber}` });
        break;

      case 'game.ended': {
        const { winnerId, reason } = e.payload;
        const why = reason === 'concede' ? 'concession'
          : reason === 'all-characters-defeated' ? 'all characters defeated'
          : 'deck exhausted';
        out.push({ kind: 'entry', key, node: <>{winnerId ? pn(winnerId) : 'Nobody'} wins ({why})</> });
        break;
      }

      case 'character.activated': {
        const { playerId, characterId, rolledDice } = e.payload;
        out.push({
          kind: 'entry', key,
          node: (
            <>
              {pn(playerId)} activates {cn(characterId)} — rolls{' '}
              {rolledDice.map((d, di) => (
                <span key={di}>
                  <DieChip symbol={d.face.symbol} value={d.face.value} modifier={d.face.modifier} />{' '}
                </span>
              ))}
            </>
          ),
        });
        break;
      }

      case 'dice.resolved': {
        const { playerId, symbol, totalValue } = e.payload;
        const resolveChip = <DieChip symbol={symbol} value={totalValue} modifier={false} />;
        const next = events[i + 1];

        if (next?.type === 'damage.dealt') {
          const { characterId, amount, shieldsBlocked } = next.payload;
          out.push({
            kind: 'entry', key,
            node: (
              <>
                {pn(playerId)} resolves {resolveChip} against {cn(characterId)} — deals {amount} damage
                {shieldsBlocked > 0 && ` (${shieldsBlocked} blocked)`}
              </>
            ),
          });
          i++;
        } else if (next?.type === 'shields.placed') {
          const { characterId, amount } = next.payload;
          out.push({
            kind: 'entry', key,
            node: (
              <>
                {pn(playerId)} resolves {resolveChip} — places {amount} shield{amount !== 1 && 's'} on {cn(characterId)}
              </>
            ),
          });
          i++;
        } else if (next?.type === 'resources.gained') {
          out.push({
            kind: 'entry', key,
            node: <>{pn(playerId)} resolves {resolveChip} — gains {next.payload.amount} resources</>,
          });
          i++;
        } else if (next?.type === 'resources.lost') {
          out.push({
            kind: 'entry', key,
            node: <>{pn(playerId)} resolves {resolveChip} — disrupts {next.payload.amount} resources</>,
          });
          i++;
        } else {
          out.push({ kind: 'entry', key, node: <>{pn(playerId)} resolves {resolveChip}</> });
        }
        break;
      }

      case 'shields.placed': {
        const { characterId, amount } = e.payload;
        out.push({
          kind: 'entry', key,
          node: <>Places {amount} shield{amount !== 1 && 's'} on {cn(characterId)}</>,
        });
        break;
      }

      case 'character.defeated':
        out.push({ kind: 'entry', key, node: <>{cn(e.payload.characterId)} is defeated</> });
        break;

      case 'battlefield.claimed':
        out.push({ kind: 'entry', key, node: <>{pn(e.payload.playerId)} claims the battlefield</> });
        break;

      case 'card.played': {
        const { playerId, cardId, costPaid } = e.payload;
        out.push({
          kind: 'entry', key,
          node: <>{pn(playerId)} plays {inn(cardId)} (cost {costPaid})</>,
        });
        break;
      }

      case 'dice.rerolled': {
        const { playerId, discardCardId, rerolledDice } = e.payload;
        const n = rerolledDice.length;
        out.push({
          kind: 'entry', key,
          node: (
            <>
              {pn(playerId)} rerolls {n} {n === 1 ? 'die' : 'dice'} (discards {inn(discardCardId)})
              {n > 0 && (
                <> →{' '}
                  {rerolledDice.map((d, di) => (
                    <span key={di}>
                      <DieChip symbol={d.face.symbol} value={d.face.value} modifier={d.face.modifier} />{' '}
                    </span>
                  ))}
                </>
              )}
            </>
          ),
        });
        break;
      }

      case 'player.passed':
        if (!e.payload.automatic) {
          out.push({ kind: 'entry', key, node: <>{pn(e.payload.playerId)} passes</> });
        }
        break;

      case 'upkeep.player': {
        const { playerId, cardsDrawn, resourcesGained } = e.payload;
        if (cardsDrawn > 0 || resourcesGained > 0) {
          out.push({
            kind: 'entry', key,
            node: <>{pn(playerId)} draws {cardsDrawn} and gains {resourcesGained} resources</>,
          });
        }
        break;
      }

      default:
        break;
    }

    i++;
  }

  return out.slice(-30);
}

function EventLog({ game, catalogById }: { game: GameState; catalogById: Map<string, Card> }) {
  const events = useApp((s) => s.recentEvents);
  const lobby = useApp((s) => s.lobby);
  const entries = useMemo(
    () => buildLogEntries(events, lobby, game, catalogById),
    [events, lobby, game, catalogById],
  );

  if (entries.length === 0) return null;

  return (
    <details className="border-t border-neutral-800">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500 hover:text-neutral-400">
        Activity log ({entries.length})
      </summary>
      <ol
        className="max-h-48 overflow-y-auto px-3 pb-2 text-xs text-neutral-400"
        aria-label="Activity log"
        aria-live="polite"
        aria-atomic="false"
      >
        {entries.map((entry) =>
          entry.kind === 'divider' ? (
            <li key={entry.key} role="separator" className="my-1 text-center text-[10px] tracking-widest text-neutral-600">
              — {entry.label} —
            </li>
          ) : (
            <li key={entry.key} className="py-0.5 leading-snug">
              {entry.node}
            </li>
          ),
        )}
      </ol>
    </details>
  );
}

/**
 * Whether a pool die can be added to a reroll-mode selection.
 * Gates out blank dice — no face the player would want to commit a discard to.
 */
function canRerollDie(d: DieInPool): boolean {
  return d.face.symbol !== 'blank';
}

function canSelectDie(d: DieInPool, lockedSymbol: DieSymbol | null): boolean {
  if (d.face.symbol === 'blank') return false;
  // Engine doesn't resolve these yet — gate them out of v1 selection.
  if (
    d.face.symbol === 'special' ||
    d.face.symbol === 'indirect' ||
    d.face.symbol === 'discard' ||
    d.face.symbol === 'draw'
  ) {
    return false;
  }
  // Focus dice are only selectable as focusers (first tap, no locked symbol).
  // Once a non-focus symbol is locked, focus dice cannot join the selection.
  if (d.face.symbol === 'focus') {
    return lockedSymbol === null;
  }
  if (lockedSymbol === null) {
    // First tap: must be a non-modifier (modifier-only resolution is
    // illegal). 'modifier'-symbol faces are always modifiers, so this
    // implicitly bars them too.
    return !d.face.modifier;
  }
  // Locked: same symbol always OK; symbolless modifiers ('modifier'
  // symbol) join any locked-symbol resolution as wild +N.
  return d.face.symbol === lockedSymbol || d.face.symbol === 'modifier';
}

function SelectionActionBar({
  game,
  playerId,
  send,
}: {
  game: GameState;
  playerId: string;
  send: (a: Action) => void;
}) {
  const selectionMode = useApp((s) => s.selectionMode);
  const exitSelectionMode = useApp((s) => s.exitSelectionMode);
  const [pickingTarget, setPickingTarget] = useState(false);

  const me = game.players[playerId];
  if (!selectionMode || !me) return null;

  const selectedDice = selectionMode.selectedDieIds
    .map((id) => me.diceInPool.find((d) => d.instanceId === id))
    .filter((d): d is DieInPool => Boolean(d));

  const cancel = () => {
    setPickingTarget(false);
    exitSelectionMode();
  };

  if (selectionMode.kind === 'reroll') {
    const dispatchReroll = () => {
      send({
        type: 'reroll-dice',
        playerId,
        discardCardId: selectionMode.discardCardId,
        dieInstanceIds: selectedDice.map((d) => d.instanceId),
      });
      exitSelectionMode();
    };
    const discardLabel = selectionMode.discardCardId.replace(/^.*\./, '');
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="text-sm">
            <span className="text-neutral-400">Discarding</span>{' '}
            <span className="font-mono text-neutral-100">{discardLabel}</span>
            <span className="ml-2 text-xs text-neutral-500">
              · rerolling {selectedDice.length} die{selectedDice.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={dispatchReroll}
              className="min-h-[44px] rounded-lg border border-amber-700 bg-amber-900 px-4 py-2 text-sm text-amber-50 hover:bg-amber-800"
            >
              Reroll selected dice
            </button>
          </div>
        </div>
      </div>
    );
  }

  // selectionMode.kind === 'resolve'
  const totalValue = selectedDice.reduce((s, d) => s + d.face.value, 0);
  const totalCost = selectedDice.reduce((s, d) => s + d.face.cost, 0);
  const lockedSymbol = selectedDice[0]?.face.symbol ?? null;
  const hasNonModifier = selectedDice.some((d) => !d.face.modifier);
  const affordable = me.resources >= totalCost;
  const canResolve = selectedDice.length > 0 && hasNonModifier && affordable;
  const needsTarget =
    lockedSymbol === 'melee' || lockedSymbol === 'ranged' || lockedSymbol === 'shield';

  const dispatchResolve = (targetCharacterId?: string) => {
    send({
      type: 'resolve-dice',
      playerId,
      dieInstanceIds: selectedDice.map((d) => d.instanceId),
      ...(targetCharacterId ? { targetCharacterId } : {}),
    });
    setPickingTarget(false);
    exitSelectionMode();
  };

  const opponent = game.playerOrder
    .map((id) => game.players[id])
    .find((p): p is NonNullable<typeof p> => !!p && p.id !== playerId);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="text-sm">
            {selectedDice.length === 0 ? (
              <span className="text-neutral-400">Tap a die in your pool to start.</span>
            ) : (
              <>
                <span className="font-mono text-neutral-100">{totalValue}</span>{' '}
                <span className="uppercase tracking-wider text-neutral-300">
                  {lockedSymbol}
                </span>
                <span className="ml-2 text-xs text-neutral-500">
                  {selectedDice.length} die{selectedDice.length === 1 ? '' : 's'} · cost{' '}
                  {totalCost}
                </span>
                {!hasNonModifier && (
                  <span className="ml-2 text-xs text-amber-400">need a non-modifier</span>
                )}
                {!affordable && (
                  <span className="ml-2 text-xs text-amber-400">
                    cost &gt; resources ({me.resources})
                  </span>
                )}
              </>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canResolve}
              onClick={() => {
                if (needsTarget) setPickingTarget(true);
                else dispatchResolve();
              }}
              className="min-h-[44px] rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-2 text-sm text-emerald-50 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {needsTarget ? 'Next: pick target' : 'Resolve'}
            </button>
          </div>
        </div>
      </div>

      {pickingTarget && lockedSymbol && (
        <ActionOverlay
          title={
            lockedSymbol === 'shield'
              ? 'Place shields on which character?'
              : 'Target which character?'
          }
          onClose={() => setPickingTarget(false)}
          backLabel="Back to dice"
        >
          <TargetGrid>
            {lockedSymbol === 'shield'
              ? me.characterOrder.map((cid) => {
                  const c = me.characters[cid]!;
                  const room = 3 - c.shields;
                  return (
                    <TargetButton
                      key={cid}
                      enabled={room > 0}
                      onClick={() => dispatchResolve(cid)}
                    >
                      <div className="text-sm">Character {cid.replace(/^.*\./, '')}</div>
                      <div className="text-[11px] text-neutral-400">
                        shields {c.shields}/3
                      </div>
                    </TargetButton>
                  );
                })
              : opponent?.characterOrder.map((cid) => {
                  const c = opponent.characters[cid]!;
                  return (
                    <TargetButton key={cid} enabled onClick={() => dispatchResolve(cid)}>
                      <div className="text-sm">Character {cid.replace(/^.*\./, '')}</div>
                      <div className="text-[11px] text-neutral-400">
                        ♥ {c.damage}/{c.health} · shields {c.shields}
                      </div>
                    </TargetButton>
                  );
                })}
          </TargetGrid>
        </ActionOverlay>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag-to-play (WEB-8)
// ─────────────────────────────────────────────────────────────────────────────

interface DragCardInfo {
  instanceId: string;
  name: string;
  type: string;
  cost: number;
  artUrl?: string | null | undefined;
  artFrameX?: number | null | undefined;
  artFrameY?: number | null | undefined;
  artFrameZoom?: number | null | undefined;
}

type DragHandlers = Pick<React.HTMLAttributes<HTMLButtonElement>, 'onTouchStart' | 'onMouseDown'>;

function useDragToPlay(onPlay: (id: string) => void, enabled: boolean) {
  const [dragging, setDragging] = useState<DragCardInfo | null>(null);
  const [overZone, setOverZone] = useState(false);

  const artifactRef = useRef<HTMLDivElement>(null);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // All mutable drag state lives here so effect listeners never go stale.
  const s = useRef({
    active: false,
    instanceId: null as string | null,
    over: false,
    pending: null as null | {
      instanceId: string;
      info: DragCardInfo;
      x: number;
      y: number;
      timer: ReturnType<typeof setTimeout>;
    },
  });

  const moveArtifact = (x: number, y: number) => {
    if (artifactRef.current) {
      // Position the artifact centered horizontally, lifted above the finger.
      artifactRef.current.style.transform = `translate(${x - 36}px, ${y - 90}px)`;
    }
  };

  const setOver = (over: boolean) => {
    if (over === s.current.over) return;
    s.current.over = over;
    setOverZone(over);
  };

  const hitTest = (x: number, y: number) => {
    // Hide artifact briefly so it doesn't block elementFromPoint.
    if (artifactRef.current) artifactRef.current.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    if (artifactRef.current) artifactRef.current.style.pointerEvents = '';
    setOver(!!el?.closest('[data-droptarget="play"]'));
  };

  const begin = (info: DragCardInfo, x: number, y: number) => {
    s.current.active = true;
    s.current.instanceId = info.instanceId;
    setDragging(info);
    requestAnimationFrame(() => moveArtifact(x, y));
  };

  const finish = (commit: boolean, suppressClick = false) => {
    const id = s.current.instanceId;
    const over = s.current.over;
    s.current.active = false;
    s.current.instanceId = null;
    setOver(false);
    setDragging(null);
    if (suppressClick) {
      // Prevent the mouseup from also firing a click on the card button.
      const absorb = (e: Event) => { e.stopPropagation(); document.removeEventListener('click', absorb, true); };
      document.addEventListener('click', absorb, true);
    }
    if (commit && over && id) onPlayRef.current(id);
  };

  const clearPending = () => {
    if (s.current.pending) { clearTimeout(s.current.pending.timer); s.current.pending = null; }
  };

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const { clientX: x, clientY: y } = touch;
      const p = s.current.pending;
      if (p && Math.hypot(x - p.x, y - p.y) > 8) {
        clearTimeout(p.timer);
        s.current.pending = null;
        begin(p.info, x, y);
      }
      if (s.current.active) {
        e.preventDefault(); // stop page scroll during drag
        moveArtifact(x, y);
        hitTest(x, y);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const wasActive = s.current.active;
      clearPending();
      if (wasActive) { e.preventDefault(); finish(true); }
    };

    const onTouchCancel = () => { clearPending(); if (s.current.active) finish(false); };

    const onMouseMove = (e: MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      const p = s.current.pending;
      if (p && Math.hypot(x - p.x, y - p.y) > 8) {
        clearTimeout(p.timer);
        s.current.pending = null;
        begin(p.info, x, y);
      }
      if (s.current.active) { moveArtifact(x, y); hitTest(x, y); }
    };

    const onMouseUp = () => { clearPending(); if (s.current.active) finish(true, true); };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchCancel);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []); // all mutable state via refs — no stale closures

  const getHandlers = useCallback((info: DragCardInfo): DragHandlers => ({
    onTouchStart: (e: React.TouchEvent) => {
      if (!enabledRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const { clientX: x, clientY: y } = touch;
      const timer = setTimeout(() => {
        if (s.current.pending?.instanceId === info.instanceId) {
          s.current.pending = null;
          begin(info, x, y);
        }
      }, 120);
      s.current.pending = { instanceId: info.instanceId, info, x, y, timer };
    },
    onMouseDown: (e: React.MouseEvent) => {
      if (!enabledRef.current || e.button !== 0) return;
      const { clientX: x, clientY: y } = e;
      const timer = setTimeout(() => {
        if (s.current.pending?.instanceId === info.instanceId) {
          s.current.pending = null;
          begin(info, x, y);
        }
      }, 120);
      s.current.pending = { instanceId: info.instanceId, info, x, y, timer };
    },
  }), []); // stable — closes over refs only

  return { dragging, overZone, artifactRef, getHandlers };
}

function DragArtifact({
  card,
  overZone,
  artifactRef,
}: {
  card: DragCardInfo;
  overZone: boolean;
  artifactRef: React.RefObject<HTMLDivElement | null>;
}) {
  return createPortal(
    <div
      ref={artifactRef}
      style={{ position: 'fixed', left: 0, top: 0, zIndex: 100, pointerEvents: 'none', willChange: 'transform' }}
    >
      <div className={`relative flex h-[96px] w-[72px] overflow-hidden rounded-lg border shadow-2xl ${
        overZone ? 'border-emerald-400' : 'border-neutral-500'
      }`}>
        <CardArtBg artUrl={card.artUrl} type={card.type} frameX={card.artFrameX} frameY={card.artFrameY} frameZoom={card.artFrameZoom} />
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white">
          {card.cost}
        </span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3">
          <span className="line-clamp-2 text-center text-[9px] leading-tight text-white">{card.name}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand strip + expanded overlay (WEB-4)
// ─────────────────────────────────────────────────────────────────────────────

/** Fills its parent with card art if available, or falls back to the type-color gradient. */
function CardArtBg({
  artUrl, type, frameX, frameY, frameZoom, className = '',
}: {
  artUrl?: string | null | undefined;
  type: string;
  frameX?: number | null | undefined;
  frameY?: number | null | undefined;
  frameZoom?: number | null | undefined;
  className?: string;
}) {
  if (artUrl) {
    const x = frameX ?? 50;
    const y = frameY ?? 50;
    const zoom = frameZoom ?? 1;
    return (
      <img
        src={artUrl}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
        style={{
          objectPosition: `${x}% ${y}%`,
          transform: zoom > 1 ? `scale(${zoom})` : undefined,
          transformOrigin: `${x}% ${y}%`,
        }}
      />
    );
  }
  return <div className={`absolute inset-0 bg-gradient-to-b ${cardArtGradient(type)} ${className}`} />;
}

function cardTypeBand(type: string): string {
  switch (type) {
    case 'character': return 'bg-amber-500';
    case 'upgrade': return 'bg-blue-500';
    case 'event': return 'bg-purple-500';
    case 'support': return 'bg-teal-500';
    default: return 'bg-neutral-600';
  }
}

function cardArtGradient(type: string): string {
  switch (type) {
    case 'character': return 'from-amber-800 to-amber-950';
    case 'upgrade': return 'from-blue-800 to-blue-950';
    case 'event': return 'from-purple-800 to-purple-950';
    case 'support': return 'from-teal-800 to-teal-950';
    default: return 'from-neutral-700 to-neutral-950';
  }
}

function dieFaceChipClass(symbol: string): string {
  switch (symbol) {
    case 'melee': return 'border-red-700 bg-red-950 text-red-300';
    case 'ranged': return 'border-orange-700 bg-orange-950 text-orange-300';
    case 'shield': return 'border-blue-700 bg-blue-950 text-blue-300';
    case 'resource': return 'border-green-700 bg-green-950 text-green-300';
    case 'disrupt': return 'border-purple-700 bg-purple-950 text-purple-300';
    case 'focus': return 'border-yellow-700 bg-yellow-950 text-yellow-300';
    case 'special': return 'border-neutral-600 bg-neutral-900 text-neutral-400';
    case 'modifier': return 'border-neutral-700 bg-neutral-950 text-neutral-400';
    default: return 'border-neutral-800 bg-neutral-950 text-neutral-600';
  }
}

function DieFaceChip({ face }: { face: DieFace }) {
  const label = face.modifier && face.symbol === 'modifier'
    ? `+${face.value}`
    : face.value > 0
      ? `${face.modifier ? '+' : ''}${face.value} ${symbolLabel(face.symbol)}`
      : symbolLabel(face.symbol);
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] leading-tight ${dieFaceChipClass(face.symbol)}`}>
      {label}
    </span>
  );
}


// Compact card tile used in the hand strip — art placeholder top, name + cost bottom.
function HandCardTile({
  instanceId,
  game,
  catalogById,
  eligible,
  onTap,
  dragHandlers,
}: {
  instanceId: string;
  game: GameState;
  catalogById: Map<string, Card>;
  eligible: boolean;
  onTap: () => void;
  dragHandlers?: DragHandlers;
}) {
  const catalogId = game.cardCatalogIds[instanceId];
  const card = catalogId ? catalogById.get(catalogId) : undefined;
  const cost = game.cardCosts[instanceId] ?? 0;

  return (
    <button
      type="button"
      onClick={onTap}
      {...dragHandlers}
      className={`relative flex h-[96px] min-w-0 flex-1 overflow-hidden rounded-lg border text-left transition active:scale-95 ${
        eligible
          ? 'border-emerald-500 shadow-[0_0_8px_1px_rgba(16,185,129,0.3)]'
          : 'border-neutral-700'
      }`}
    >
      <CardArtBg artUrl={card?.artUrl} type={card?.type ?? ''} frameX={card?.artFrameX} frameY={card?.artFrameY} frameZoom={card?.artFrameZoom} />
      {/* cost badge — top-right */}
      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-white">
        {cost}
      </span>
      {/* name scrim — bottom of art */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3">
        <span className="line-clamp-2 text-center text-[9px] leading-tight text-white">
          {card?.name ?? '—'}
        </span>
      </div>
    </button>
  );
}


// Single-card expanded view with prev/next navigation.
function HandOverlay({
  hand,
  game,
  playerId,
  mode,
  catalogById,
  initialFocusId,
  isMyTurn,
  onPlay,
  onReroll,
  onClose,
}: {
  hand: readonly string[];
  game: GameState;
  playerId: string;
  mode: HandMode;
  catalogById: Map<string, Card>;
  initialFocusId: string | null;
  isMyTurn: boolean;
  onPlay: (instanceId: string) => void;
  onReroll: (instanceId: string) => void;
  onClose: () => void;
}) {
  const initialIndex = Math.max(0, hand.indexOf(initialFocusId ?? ''));
  const [index, setIndex] = useState(initialIndex);
  const me = game.players[playerId];
  const legal = isMyTurn ? getLegalActions(game, playerId) : null;

  const currentId = hand[index] ?? null;
  const catalogId = currentId ? game.cardCatalogIds[currentId] : undefined;
  const card = catalogId ? catalogById.get(catalogId) : undefined;
  const cost = currentId ? (game.cardCosts[currentId] ?? 0) : 0;
  const affordable = (me?.resources ?? 0) >= cost;
  const canPlay = isMyTurn && affordable && (legal?.canPlayCard ?? false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(hand.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, hand.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* card sheet */}
      <div className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: '90dvh' }}
      >
        {/* header: back + position counter + close */}
        <div className="flex shrink-0 items-center justify-between px-2 py-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
            className="min-h-[44px] min-w-[44px] rounded-lg text-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-20"
          >
            ‹
          </button>
          <span className="text-xs text-neutral-500">{index + 1} of {hand.length}</span>
          <button
            type="button"
            disabled={index === hand.length - 1}
            onClick={() => setIndex((i) => i + 1)}
            className="min-h-[44px] min-w-[44px] rounded-lg text-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-20"
          >
            ›
          </button>
        </div>

        {/* art area */}
        <div className="relative mx-4 shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: '5/7' }}>
          <CardArtBg artUrl={card?.artUrl} type={card?.type ?? ''} frameX={card?.cardFrameX} frameY={card?.cardFrameY} frameZoom={card?.cardFrameZoom} />
        </div>

        {/* card info + text, scrollable */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3">
          {/* name row */}
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="text-base font-semibold leading-tight text-neutral-100">
                {card?.name ?? '—'}
              </div>
              {card && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] text-white ${cardTypeBand(card.type)}`}>
                    {card.type}{card.subtypes?.length ? ` · ${card.subtypes.join(', ')}` : ''}
                  </span>
                  <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {card.faction}{card.color ? ` · ${card.color}` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-bold text-neutral-200">
              {cost}
            </div>
          </div>

          {/* ability text */}
          {card?.displayText ? (
            <p className="text-sm leading-relaxed text-neutral-300">{card.displayText}</p>
          ) : (
            <p className="text-sm italic text-neutral-600">No ability text.</p>
          )}

          {/* die faces */}
          {card?.dieFaces && (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">Die faces</div>
              <div className="flex flex-wrap gap-1.5">
                {card.dieFaces.map((face, i) => (
                  <DieFaceChip key={i} face={face} />
                ))}
              </div>
            </div>
          )}

          {/* action button */}
          {mode === 'play' && currentId && (
            <button
              type="button"
              disabled={!canPlay}
              onClick={() => onPlay(currentId)}
              className="mt-auto min-h-[44px] w-full rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-2 text-sm font-medium text-emerald-50 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {affordable ? 'Play this card' : `Need ${cost} resources (have ${me?.resources ?? 0})`}
            </button>
          )}
          {mode === 'reroll' && currentId && (
            <button
              type="button"
              onClick={() => onReroll(currentId)}
              className="mt-auto min-h-[44px] w-full rounded-lg border border-amber-700 bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-800"
            >
              Discard to reroll
            </button>
          )}

          {/* close */}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Battle zone — four-column board layout (WEB-10)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Small icon + stat helpers ───────────────────────────────────────────────

function HeartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 14S1 9.5 1 5a4 4 0 0 1 7-2.65A4 4 0 0 1 15 5c0 4.5-7 9-7 9Z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="10" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1 14 3.5V8c0 3.5-3 6-6 7C5 14 2 11.5 2 8V3.5Z" />
    </svg>
  );
}

/** HP and optional shield count, centered above a character card. */
function CharStatsRow({ hp, shields }: { hp: number; shields: number }) {
  return (
    <div className="flex items-center justify-center gap-3 text-[11px] font-semibold leading-none">
      {shields > 0 && (
        <span className="flex items-center gap-1 text-blue-300">
          <ShieldIcon />
          {shields}
        </span>
      )}
      <span className="flex items-center gap-1 text-red-300">
        <HeartIcon />
        {hp}
      </span>
    </div>
  );
}

/**
 * Build a map of characterId → pool dice for one player.
 * Uses ownerInstanceId when present; otherwise falls back to matching
 * DieInPool.instanceId against each character's CardDie.instanceId so
 * games started before ownerInstanceId was introduced still render.
 */
function buildDiceByOwner(
  player: { diceInPool: readonly DieInPool[]; characters: Record<string, { dice: readonly { instanceId: string }[] }>; characterOrder: readonly string[] } | null | undefined,
): Map<string, DieInPool[]> {
  const m = new Map<string, DieInPool[]>();
  if (!player) return m;

  // Build die-instanceId → characterId reverse lookup for the fallback path.
  const dieToChar = new Map<string, string>();
  for (const cid of player.characterOrder) {
    for (const die of player.characters[cid]?.dice ?? []) {
      dieToChar.set(die.instanceId, cid);
    }
  }

  for (const d of player.diceInPool) {
    const key = d.ownerInstanceId ?? dieToChar.get(d.instanceId) ?? '';
    m.set(key, [...(m.get(key) ?? []), d]);
  }
  return m;
}

/**
 * Split charIds into rows of at most maxPerRow, distributing extras into
 * front rows. rows[0] is always the front row (closest to the opponent).
 */
// Greedy front-fill: pack front rows to maxPerRow first, remainder goes to back rows.
// e.g. 4 chars, max 3 → [3, 1]; 5 → [3, 2]; 7 → [3, 3, 1]
function distributeToRows(charIds: readonly string[], maxPerRow = 4): string[][] {
  if (charIds.length === 0) return [[]];
  if (charIds.length <= maxPerRow) return [[...charIds]];
  const rows: string[][] = [];
  let idx = 0;
  while (idx < charIds.length) {
    const remaining = charIds.length - idx;
    const rowsLeft = Math.ceil(remaining / maxPerRow);
    const size = rowsLeft > 1 ? maxPerRow : remaining;
    rows.push([...charIds].slice(idx, idx + size));
    idx += size;
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Battle zone — mobile-first layout shell (WEB-11)
// Five stacked regions: AvatarBar / OpponentZone / PlayerZone / HandStrip / ActionBar
// ─────────────────────────────────────────────────────────────────────────────

/** Top-to-bottom mobile-first game shell. */
function BattleZone({
  game,
  playerId,
  catalogById,
  send,
  isMyTurn,
  onOpenActionPanel,
  onOpenHand,
  getDragHandlers,
  className = '',
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  send: (a: Action) => void;
  isMyTurn: boolean;
  onOpenActionPanel: () => void;
  onOpenHand: (mode: HandMode, focusId?: string) => void;
  getDragHandlers: (info: DragCardInfo) => DragHandlers;
  className?: string;
}) {
  const [detailId, setDetailId] = useState<{ ownerId: string; charId: string } | null>(null);
  const [upgradeDetailId, setUpgradeDetailId] = useState<{ ownerId: string; upgradeId: string } | null>(null);

  const opponentId = game.playerOrder.find((id) => id !== playerId);
  const detailChar = detailId ? game.players[detailId.ownerId]?.characters[detailId.charId] : null;
  const upgradeDetailCatalogId = upgradeDetailId ? game.cardCatalogIds[upgradeDetailId.upgradeId] : undefined;
  const upgradeDetailCard = upgradeDetailCatalogId ? catalogById.get(upgradeDetailCatalogId) : undefined;

  return (
    <>
      <section className={`flex h-full w-full flex-col ${className}`} aria-label="Battle zone">
        {/* 1 ── Avatar bar */}
        <AvatarBar game={game} playerId={playerId} catalogById={catalogById} isMyTurn={isMyTurn} onOpenActionPanel={onOpenActionPanel} />

        {/* 2 ── Opponent zone (placeholder — WEB-12 fills this in) */}
        <OpponentZone
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          onDetailTap={(charId) => opponentId && setDetailId({ ownerId: opponentId, charId })}
          onUpgradeTap={(uid) => opponentId && setUpgradeDetailId({ ownerId: opponentId, upgradeId: uid })}
        />

        {/* Center divider — white line with breathing room on both sides */}
        <div className="shrink-0 px-4 py-3">
          <div className="h-px w-full bg-white" />
        </div>

        {/* 3 ── Player zone */}
        <PlayerZone
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          onDetailTap={(charId) => setDetailId({ ownerId: playerId, charId })}
          onUpgradeTap={(uid) => setUpgradeDetailId({ ownerId: playerId, upgradeId: uid })}
        />

        {/* Face picker panel — visible during focus face-pick flow */}
        <FacePickerPanel game={game} playerId={playerId} />

        {/* 4 ── Hand strip — always visible, compact, expands on tap */}
        <InlineHandStrip
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          isMyTurn={isMyTurn}
          onCardTap={(id) => onOpenHand(isMyTurn ? 'play' : 'browse', id)}
          getDragHandlers={getDragHandlers}
        />

        {/* 5 ── Action bar — Undo (future) | Commit */}
        <ActionBar game={game} playerId={playerId} send={send} isMyTurn={isMyTurn} />

        {/* 6 ── Activity log — collapsed by default on mobile */}
        <EventLog game={game} catalogById={catalogById} />
      </section>

      {detailChar && detailId && (
        <CardDetailOverlay char={detailChar} game={game} catalogById={catalogById} onClose={() => setDetailId(null)} />
      )}
      {upgradeDetailCard && (
        <UpgradeDetailOverlay card={upgradeDetailCard} onClose={() => setUpgradeDetailId(null)} />
      )}
    </>
  );
}

/** Top bar: player info (left) | battlefield card + ⚡ (center) | opponent info (right). */
function AvatarBar({
  game,
  playerId,
  catalogById,
  isMyTurn,
  onOpenActionPanel,
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  isMyTurn: boolean;
  onOpenActionPanel: () => void;
}) {
  const lobby = useApp.getState().lobby!;
  const me = lobby.members.find((m) => m.playerId === playerId);
  const opponent = lobby.members.find((m) => m.playerId !== playerId);
  const opponentId = game.playerOrder.find((id) => id !== playerId);
  const myPlayer = game.players[playerId];
  const oppPlayer = opponentId ? game.players[opponentId] : null;
  const inActionPhase = game.phase === 'action';

  const activeFlow = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  // Battlefield card — battlefieldCardId is a catalog ID, look up directly
  const controllerId = game.battlefieldControllerId;
  const controllerIsMe = controllerId === playerId;
  const bfCatalogId = myPlayer?.battlefieldCardId ?? oppPlayer?.battlefieldCardId ?? null;
  const bfCard = bfCatalogId ? catalogById.get(bfCatalogId) : null;
  const canClaim = isMyTurn && inActionPhase && activeFlow === null &&
    getLegalActions(game, playerId).canClaim;
  const isClaiming = activeFlow?.kind === 'claim';

  const phaseLabel =
    game.phase === 'action' ? `R${game.roundNumber}`
    : game.phase === 'upkeep' ? 'Upkeep'
    : game.phase === 'setup' ? 'Setup'
    : 'Ended';

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-2">
      {/* ── Player (left) ── */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-neutral-100">{me?.displayName ?? 'You'}</span>
        <span className="text-[11px] text-neutral-400">
          💰 {myPlayer?.resources ?? 0}
          <span className="mx-1 text-neutral-700">·</span>
          🂠 {myPlayer?.deck.length ?? 0}
          {(myPlayer?.discard.length ?? 0) > 0 && (
            <span className="ml-1 text-neutral-600">({myPlayer!.discard.length} disc)</span>
          )}
        </span>
      </div>

      {/* ── Battlefield card + phase + ⚡ (center) ── */}
      <div className="flex shrink-0 flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            if (isClaiming) setActiveFlow(null);
            else if (canClaim) setActiveFlow({ kind: 'claim' });
          }}
          className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors ${
            canClaim || isClaiming
              ? 'ring-1 ring-emerald-500/60 border border-emerald-600'
              : 'border border-transparent'
          }`}
        >
          <span className={`text-[8px] ${controllerIsMe ? 'text-emerald-400' : 'text-neutral-500'}`}>
            {controllerIsMe ? '◀' : ''}
          </span>
          <span className="max-w-[80px] truncate text-center text-[10px] font-medium text-neutral-300">
            {bfCard?.name ?? '—'}
          </span>
          <span className={`text-[8px] ${!controllerIsMe && controllerId ? 'text-emerald-400' : 'text-neutral-500'}`}>
            {!controllerIsMe && controllerId ? '▶' : ''}
          </span>
        </button>
        <span className="text-[9px] uppercase tracking-wider text-neutral-600">{phaseLabel}</span>
        {isMyTurn && inActionPhase && (
          <button
            type="button"
            onClick={onOpenActionPanel}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-lg hover:border-neutral-500 active:bg-neutral-800"
            aria-label="Open actions"
          >
            ⚡
          </button>
        )}
      </div>

      {/* ── Opponent (right) ── */}
      <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
        <span className="truncate text-sm font-semibold text-neutral-100">{opponent?.displayName ?? '…'}</span>
        <span className="text-[11px] text-neutral-400">
          💰 {oppPlayer?.resources ?? 0}
          <span className="mx-1 text-neutral-700">·</span>
          🂠 {oppPlayer?.hand.length ?? 0} hand
          <span className="mx-1 text-neutral-700">·</span>
          🂠 {oppPlayer?.deck.length ?? 0}
        </span>
      </div>
    </div>
  );
}

// ─── Battlefield column constants ───────────────────────────────────────────
const DIE_SIZE = 44;  // min tap target (used for touch target sizing)
const DIE_TILE_SIZE = 40; // visual tile size in horizontal mode (h-10 w-10)
const DIE_GAP = 4;
const MIN_DICE_COLS = 3;
const MAX_CHARS_PER_ROW = 3;
// Card column width is fixed independently of die size.
const CHAR_COL_WIDTH = 92;

// ─── Shared battlefield row renderer ────────────────────────────────────────

type ZoneSide = 'player' | 'opponent';

function BattlefieldRow({
  rowIds,
  playerState,
  diceByOwner,
  game,
  playerId,
  catalogById,
  side,
  diceInteractive,
  selectionMode,
  activatableIds,
  resolvableSymbols,
  isEligibleForAbility,
  onDetailTap,
  onUpgradeTap,
}: {
  rowIds: string[];
  playerState: NonNullable<ReturnType<typeof Object.values<ReturnType<typeof Object.values>>>>[number];
  diceByOwner: Map<string, DieInPool[]>;
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  side: ZoneSide;
  diceInteractive: boolean;
  selectionMode: SelectionMode | null;
  activatableIds: readonly string[];
  resolvableSymbols: readonly string[];
  /** True when it's this player's turn, action phase, and no active flow — badges can go green. */
  isEligibleForAbility?: boolean;
  onDetailTap: (charId: string) => void;
  onUpgradeTap: (upgradeId: string) => void;
}) {
  const activeFlow = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);

  return (
    <div className="flex shrink-0 flex-row items-end justify-center gap-4 px-3">
      {rowIds.map((cid) => {
        const char = (playerState as any).characters[cid] as CharacterState;
        if (!char) return null;
        const dice = diceByOwner.get(cid) ?? [];
        const hp = char.health - char.damage;

        // Activation flow
        const eligible = activatableIds.includes(cid) && activeFlow === null;
        const isActivating = activeFlow?.kind === 'activate' && activeFlow.charId === cid;

        // Resolve flow targeting
        const inResolveFlow = activeFlow?.kind === 'resolve';
        const resolveSym = inResolveFlow ? activeFlow!.symbol : null;
        const isDmg = resolveSym === 'melee' || resolveSym === 'ranged' || resolveSym === 'indirect';
        const isShield = resolveSym === 'shield';
        const hasSelections = inResolveFlow && (activeFlow as any).selectedDieIds.length > 0;
        const resolveFlow = inResolveFlow && activeFlow?.kind === 'resolve' ? activeFlow : null;
        const isCurrentTarget = resolveFlow ? resolveFlow.pendingTargets.some(t => t.targetCharacterId === cid) : false;
        let targetRing: 'damage' | 'shield' | undefined;
        if (hasSelections) {
          if (isDmg && side === 'opponent') targetRing = 'damage';
          if (isShield && side === 'player') targetRing = 'shield';
        }
        let pendingCounter: { value: number; kind: 'damage' | 'shield' } | undefined;
        if (resolveFlow && (isDmg || isShield)) {
          const group = resolveFlow.pendingTargets.find(t => t.targetCharacterId === cid);
          if (group) {
            const myPool = game.players[playerId]?.diceInPool ?? [];
            const groupValue = group.dieInstanceIds.reduce((sum, id) => {
              const d = myPool.find(p => p.instanceId === id);
              return sum + (d?.face.value ?? 0);
            }, 0);
            if (groupValue > 0) pendingCounter = { value: groupValue, kind: isDmg ? 'damage' : 'shield' };
          }
        }

        // Ability badges — action/powerAction abilities on this character's catalog card.
        const charCatalogId = game.cardCatalogIds[cid];
        const charCard = charCatalogId ? catalogById.get(charCatalogId) : undefined;
        const abilityBadges = (charCard?.abilities ?? [])
          .map((ab, i) => ({ abilityIndex: i, kind: ab.kind as 'action' | 'powerAction', eligible: false }))
          .filter((b) => b.kind === 'action' || b.kind === 'powerAction')
          .map((b) => {
            // Power action eligibility reads from authoritative engine state — never tracked client-side.
            const notUsed = b.kind !== 'powerAction' || !char.powerActionUsedThisRound;
            return { ...b, eligible: !!(isEligibleForAbility && notUsed) };
          });

        const handleTap = () => {
          if (targetRing && activeFlow?.kind === 'resolve') {
            const flow = activeFlow;
            const newGroup = { dieInstanceIds: flow.selectedDieIds, targetCharacterId: cid };
            const existingIdx = flow.pendingTargets.findIndex(t => t.targetCharacterId === cid);
            const newPendingTargets = existingIdx >= 0
              ? flow.pendingTargets.map((t, i) => i === existingIdx ? newGroup : t)
              : [...flow.pendingTargets, newGroup];
            setActiveFlow({ ...flow, pendingTargets: newPendingTargets, selectedDieIds: [] });
            return;
          }
          if (isActivating) { setActiveFlow(null); return; }
          if (eligible) { setActiveFlow({ kind: 'activate', charId: cid }); return; }
          onDetailTap(cid);
        };

        const handleAbilityBadgeTap = (abilityIndex: number, abilityKind: 'action' | 'powerAction') => {
          setActiveFlow({ kind: 'cardAction', cardId: cid, abilityIndex, abilityKind });
        };

        const dieCardColor = charCard?.color ?? null;
        const tumblingCharId = isActivating ? cid : null;

        // Compute face overrides for focus-pick preview on player dice.
        // Reads the latest flip for each target die from the face-pick history.
        const faceOverrides: Record<string, { faceIndex: number; face: import('@prophecy/game-engine').DieFace }> = {};
        if (side === 'player' && activeFlow?.kind === 'face-pick') {
          for (const event of activeFlow.history) {
            if (event.kind !== 'flip') continue;
            const poolDie = dice.find((d) => d.instanceId === event.targetDieId);
            if (!poolDie?.ownerInstanceId) continue;
            const ownerChar = (playerState as any).characters?.[poolDie.ownerInstanceId];
            const dieSpec = ownerChar?.dice?.find((d: any) => d.instanceId === event.targetDieId);
            if (!dieSpec) continue;
            faceOverrides[event.targetDieId] = { faceIndex: event.faceIndex, face: dieSpec.faces[event.faceIndex] };
          }
        }

        return (
          <div key={cid} className="flex shrink-0 flex-col gap-3" style={{ width: CHAR_COL_WIDTH }}>
            {side === 'player' && (
              <Suspense fallback={
                <DiceStack
                  dice={dice}
                  diceInteractive={diceInteractive}
                  selectionMode={selectionMode}
                  horizontal
                  eligibleSymbols={resolvableSymbols}
                />
              }>
                <DicePool3D
                  dice={dice}
                  diceInteractive={diceInteractive}
                  selectionMode={selectionMode}
                  eligibleSymbols={resolvableSymbols}
                  cardColor={dieCardColor}
                  tumblingCharId={tumblingCharId}
                  {...(Object.keys(faceOverrides).length > 0 ? { faceOverrides } : {})}
                />
              </Suspense>
            )}
            <CharacterCard
              char={char}
              game={game}
              catalogById={catalogById}
              className="w-full"
              tipDirection="right"
              hp={hp}
              shields={char.shields}
              eligible={eligible}
              pendingExhaust={isActivating}
              {...(targetRing ? { targetRing } : {})}
              {...(abilityBadges.length > 0 ? { abilityBadges } : {})}
              {...(pendingCounter ? { pendingCounter } : {})}
              onAbilityBadgeTap={handleAbilityBadgeTap}
              onTap={handleTap}
              onUpgradeTap={onUpgradeTap}
            />
            {side === 'opponent' && (
              <Suspense fallback={
                <DiceStack
                  dice={dice}
                  diceInteractive={false}
                  selectionMode={selectionMode}
                  horizontal
                />
              }>
                <DicePool3D
                  dice={dice}
                  diceInteractive={false}
                  selectionMode={selectionMode}
                  cardColor={dieCardColor}
                />
              </Suspense>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** How many character columns fit side-by-side given a container pixel width. */
function useMaxPerRow(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const colWithGap = CHAR_COL_WIDTH + DIE_GAP; // 132 + 4 = 136px per slot
  const [maxPerRow, setMaxPerRow] = useState(() =>
    Math.min(MAX_CHARS_PER_ROW, Math.max(1, Math.floor((window.innerWidth - 16) / colWithGap))),
  );
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = entry.contentRect.width;
      setMaxPerRow(Math.min(MAX_CHARS_PER_ROW, Math.max(1, Math.floor(w / colWithGap))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, colWithGap]);
  return maxPerRow;
}

/** Opponent character/support cards with dice below. Front row at bottom (closest to player). */
function OpponentZone({
  game,
  playerId,
  catalogById,
  onDetailTap,
  onUpgradeTap,
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  onDetailTap: (charId: string) => void;
  onUpgradeTap: (upgradeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxPerRow = useMaxPerRow(containerRef);
  const selectionMode = useApp((s) => s.selectionMode);
  const opponentId = game.playerOrder.find((id) => id !== playerId);
  const oppPlayer = opponentId ? game.players[opponentId] : null;
  const diceByOwner = useMemo(() => buildDiceByOwner(oppPlayer), [oppPlayer]);
  const rows = useMemo(
    () => distributeToRows(oppPlayer?.characterOrder ?? [], maxPerRow).reverse(),
    [oppPlayer, maxPerRow],
  );

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden pb-1">
      {oppPlayer && rows.map((rowIds, i) => (
        <BattlefieldRow
          key={i}
          rowIds={rowIds}
          playerState={oppPlayer as any}
          diceByOwner={diceByOwner}
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          side="opponent"
          diceInteractive={false}
          selectionMode={selectionMode}
          activatableIds={[]}
          resolvableSymbols={[]}
          onDetailTap={onDetailTap}
          onUpgradeTap={onUpgradeTap}
        />
      ))}
    </div>
  );
}

/** Player character/support cards with dice above. Front row at top (closest to opponent). */
function PlayerZone({
  game,
  playerId,
  catalogById,
  onDetailTap,
  onUpgradeTap,
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  onDetailTap: (charId: string) => void;
  onUpgradeTap: (upgradeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxPerRow = useMaxPerRow(containerRef);
  const selectionMode = useApp((s) => s.selectionMode);
  const activeFlow = useApp((s) => s.activeFlow);
  const isMyTurn = game.activePlayerId === playerId;
  const inActionPhase = game.phase === 'action';
  const diceInteractive = isMyTurn && inActionPhase && selectionMode === null;
  const myPlayer = game.players[playerId];
  const diceByOwner = useMemo(() => buildDiceByOwner(myPlayer), [myPlayer]);
  const rows = useMemo(
    () => distributeToRows(myPlayer?.characterOrder ?? [], maxPerRow),
    [myPlayer, maxPerRow],
  );

  // Compute eligible actions — only when it's my turn, in action phase, no active flow
  const legalActions = useMemo(
    () => (isMyTurn && inActionPhase && activeFlow === null)
      ? getLegalActions(game, playerId)
      : null,
    [game, playerId, isMyTurn, inActionPhase, activeFlow],
  );
  const activatableIds = legalActions?.activatableCharacterIds ?? [];
  const resolvableSymbols = legalActions?.resolvableSymbols ?? [];
  const isEligibleForAbility = isMyTurn && inActionPhase && activeFlow === null;

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col justify-start gap-2 overflow-hidden pt-1">
      {myPlayer && rows.map((rowIds, i) => (
        <BattlefieldRow
          key={i}
          rowIds={rowIds}
          playerState={myPlayer as any}
          diceByOwner={diceByOwner}
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          side="player"
          diceInteractive={diceInteractive}
          selectionMode={selectionMode}
          activatableIds={activatableIds}
          resolvableSymbols={resolvableSymbols}
          isEligibleForAbility={isEligibleForAbility}
          onDetailTap={onDetailTap}
          onUpgradeTap={onUpgradeTap}
        />
      ))}
    </div>
  );
}

/**
 * Always-visible compact hand strip. Each card shows a type-color band, name,
 * and cost. Tapping a card toggles an inline expansion revealing ability text.
 * Eligible-to-play cards get a green border.
 */
function InlineHandStrip({
  game,
  playerId,
  catalogById,
  isMyTurn,
  onCardTap,
  getDragHandlers,
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  isMyTurn: boolean;
  onCardTap: (instanceId: string) => void;
  getDragHandlers: (info: DragCardInfo) => DragHandlers;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeFlow = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  const me = game.players[playerId];
  const hand = me?.hand ?? [];
  const legal = isMyTurn ? getLegalActions(game, playerId) : null;
  const pickingCardForReroll = activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-card';
  const pickingDiceForReroll = activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice';
  const rerollDiscardId = activeFlow?.kind === 'reroll' ? activeFlow.discardCardId : null;
  const inRerollMode = pickingCardForReroll || pickingDiceForReroll;

  const handleTap = (id: string) => {
    if (pickingCardForReroll) {
      // Select this card to discard, advance to pick-dice step
      setActiveFlow({ kind: 'reroll', step: 'pick-dice', discardCardId: id, selectedDieIds: [] });
      return;
    }
    if (expandedId === id) setExpandedId(null);
    else setExpandedId(id);
  };

  return (
    <div className={`shrink-0 border-t bg-neutral-950 ${inRerollMode ? 'border-amber-700' : 'border-neutral-800'}`}>
      {pickingCardForReroll && (
        <div className="px-3 pt-1.5 text-[10px] font-medium text-amber-400">Choose a card to discard:</div>
      )}
      {pickingDiceForReroll && (
        <div className="px-3 pt-1.5 text-[10px] font-medium text-amber-400">Select dice to reroll:</div>
      )}
      {hand.length === 0 ? (
        <div className="px-3 py-2 text-[11px] text-neutral-600">Hand empty</div>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto px-2 py-2">
          {hand.map((id) => {
            const cost = game.cardCosts[id] ?? 0;
            const affordable = (me?.resources ?? 0) >= cost;
            const eligible = !inRerollMode && isMyTurn && affordable && (legal?.canPlayCard ?? false);
            const isSelectedForDiscard = id === rerollDiscardId;
            const catalogId = game.cardCatalogIds[id];
            const card = catalogId ? catalogById.get(catalogId) : undefined;
            const isExpanded = expandedId === id;
            const dragHandlers = eligible
              ? getDragHandlers({ instanceId: id, name: card?.name ?? '—', type: card?.type ?? '', cost, artUrl: card?.artUrl, artFrameX: card?.artFrameX, artFrameY: card?.artFrameY, artFrameZoom: card?.artFrameZoom })
              : undefined;

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleTap(id)}
                {...(dragHandlers ?? {})}
                className={`shrink-0 flex flex-col overflow-hidden rounded-lg border bg-neutral-900 text-left transition-all duration-150 ${
                  pickingCardForReroll
                    ? 'border-amber-600'
                    : pickingDiceForReroll && isSelectedForDiscard
                      ? 'border-amber-500 ring-1 ring-amber-500/50'
                      : pickingDiceForReroll
                        ? 'border-neutral-800 opacity-30'
                        : eligible
                          ? 'border-emerald-600'
                          : 'border-neutral-700'
                }`}
                style={{ width: isExpanded ? 180 : 80, minHeight: 44 }}
                aria-pressed={isExpanded}
              >
                {/* Type color band */}
                <div className={`h-1 w-full shrink-0 ${cardTypeBand(card?.type ?? '')}`} />
                <div className="flex flex-1 flex-col gap-0.5 p-1.5">
                  {/* Name + cost row */}
                  <div className="flex items-start justify-between gap-1">
                    <span className="line-clamp-2 text-[10px] font-medium leading-tight text-neutral-100">
                      {card?.name ?? '—'}
                    </span>
                    <span className={`shrink-0 rounded px-1 text-[9px] font-bold leading-tight ${
                      eligible ? 'bg-emerald-900 text-emerald-200' : 'bg-neutral-800 text-neutral-400'
                    }`}>
                      {cost}
                    </span>
                  </div>
                  {/* Expanded: ability text */}
                  {isExpanded && (
                    <p className="mt-0.5 text-[9px] leading-snug text-neutral-400">
                      {card?.displayText ?? 'No ability text.'}
                    </p>
                  )}
                  {/* Tap to view full card */}
                  {isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onCardTap(id); }}
                      className="mt-1 text-[9px] text-emerald-400 underline"
                    >
                      Full card
                    </button>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bottom action bar: Undo | Commit (label + behaviour derived from activeFlow). */
function ActionBar({
  game,
  playerId,
  send,
  isMyTurn,
}: {
  game: GameState;
  playerId: string;
  send: (a: Action) => void;
  isMyTurn: boolean;
}) {
  const [confirmPass, setConfirmPass] = useState(false);
  const activeFlow = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  const inActionPhase = game.phase === 'action';

  if (game.phase === 'ended') return null;
  if (!inActionPhase) return <div className="shrink-0 h-[60px] border-t border-neutral-800" />;

  const myPlayer = game.players[playerId];
  const canStartReroll = isMyTurn && !activeFlow &&
    (myPlayer?.hand.length ?? 0) > 0 &&
    (myPlayer?.diceInPool.length ?? 0) > 0;

  const commitLabel = (() => {
    if (!activeFlow) return 'Pass';
    if (activeFlow.kind === 'activate') return 'Roll Dice';
    if (activeFlow.kind === 'claim') return 'Claim';
    if (activeFlow.kind === 'cardAction') return 'Use ability';
    if (activeFlow.kind === 'reroll') {
      if (activeFlow.step === 'pick-card') return 'Cancel';
      const n = activeFlow.selectedDieIds.length;
      return n > 0 ? `Reroll ${n} ${n === 1 ? 'die' : 'dice'}` : 'Skip reroll';
    }
    if (activeFlow.kind === 'resolve') {
      const sym = activeFlow.symbol;
      if (sym === 'melee' || sym === 'ranged') return 'Deal damage';
      if (sym === 'indirect') return 'Deal indirect damage';
      if (sym === 'shield') return 'Gain shields';
      if (sym === 'resource') return 'Gain resources';
      if (sym === 'disrupt') return 'Disrupt';
      if (sym === 'discard') return 'Discard cards';
      if (sym === 'focus') return `Focus dice`;
      return 'Resolve';
    }
    if (activeFlow.kind === 'face-pick') {
      return activeFlow.budget > 0
        ? `End focus (${activeFlow.budget} left)`
        : 'End focus';
    }
    return 'Commit';
  })();

  const handleCommit = () => {
    if (!activeFlow) { setConfirmPass(true); return; }
    if (activeFlow.kind === 'activate') {
      send({ type: 'activate', playerId, cardId: activeFlow.charId });
      setActiveFlow(null);
      return;
    }
    if (activeFlow.kind === 'claim') {
      send({ type: 'claim-battlefield', playerId });
      setActiveFlow(null);
      return;
    }
    if (activeFlow.kind === 'cardAction') {
      send({ type: 'use-card-action', playerId, cardId: activeFlow.cardId, abilityIndex: activeFlow.abilityIndex });
      setActiveFlow(null);
      return;
    }
    if (activeFlow.kind === 'reroll') {
      if (activeFlow.step === 'pick-card') { setActiveFlow(null); return; } // Cancel
      // Dispatch reroll (0 dice = valid "cycle a card" action)
      send({
        type: 'reroll-dice',
        playerId,
        discardCardId: activeFlow.discardCardId!,
        dieInstanceIds: activeFlow.selectedDieIds,
      });
      setActiveFlow(null);
      return;
    }
    if (activeFlow.kind === 'resolve') {
      if (activeFlow.symbol === 'focus') {
        // Transition into the face-pick flow. Each selected die is a focuser.
        // Budget = sum of face values across all selected focus dice.
        const player = game.players[playerId];
        const budget = activeFlow.selectedDieIds.reduce((sum, id) => {
          const d = player?.diceInPool.find((p) => p.instanceId === id);
          return sum + (d?.face.value ?? 0);
        }, 0);
        setActiveFlow({
          kind: 'face-pick',
          focuserDieIds: activeFlow.selectedDieIds,
          budget,
          history: [],
          pickingForDieId: null,
        });
        return;
      }
      const needsTarget = activeFlow.symbol === 'melee' || activeFlow.symbol === 'ranged' || activeFlow.symbol === 'shield';
      if (needsTarget) {
        // Multi-target: all dice must be committed into pendingTargets first.
        if (activeFlow.pendingTargets.length === 0 || activeFlow.selectedDieIds.length > 0) return;
        send({ type: 'resolve-dice', playerId, targets: activeFlow.pendingTargets });
      } else {
        // Resource / disrupt / discard: single group, no target character.
        send({ type: 'resolve-dice', playerId, targets: [{ dieInstanceIds: activeFlow.selectedDieIds }] });
      }
      setActiveFlow(null);
      return;
    }
    if (activeFlow.kind === 'face-pick') {
      const focusFlips = activeFlow.history
        .filter((e): e is Extract<typeof e, { kind: 'flip' }> => e.kind === 'flip')
        .map((e) => ({ targetDieInstanceId: e.targetDieId, faceIndex: e.faceIndex }));
      send({
        type: 'resolve-dice',
        playerId,
        dieInstanceIds: activeFlow.focuserDieIds,
        focusFlips,
      });
      setActiveFlow(null);
      return;
    }
    setActiveFlow(null);
  };

  const handleUndo = () => {
    if (activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice') {
      setActiveFlow({ kind: 'reroll', step: 'pick-card', discardCardId: null, selectedDieIds: [] });
    } else if (activeFlow?.kind === 'face-pick') {
      if (activeFlow.history.length === 0) {
        // Nothing to undo in the face-pick — exit the flow entirely
        setActiveFlow(null);
        return;
      }
      const last = activeFlow.history[activeFlow.history.length - 1]!;
      if (last.kind === 'flip') {
        setActiveFlow({ ...activeFlow, budget: activeFlow.budget + 1, history: activeFlow.history.slice(0, -1), pickingForDieId: null });
      } else {
        // chain event — remove that focuser and give back budget
        setActiveFlow({
          ...activeFlow,
          focuserDieIds: activeFlow.focuserDieIds.filter((id) => id !== last.chainedFocuserId),
          budget: activeFlow.budget - last.budgetAdded,
          history: activeFlow.history.slice(0, -1),
          pickingForDieId: null,
        });
      }
    } else {
      setActiveFlow(null);
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-t border-neutral-800 px-3 py-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        {/* Left slot: Undo when flow active, or "Discard to reroll" when idle */}
        {activeFlow ? (
          <button
            type="button"
            onClick={handleUndo}
            className="min-h-[44px] rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-400 hover:border-neutral-500 active:bg-neutral-800"
          >
            Undo
          </button>
        ) : canStartReroll ? (
          <button
            type="button"
            onClick={() => setActiveFlow({ kind: 'reroll', step: 'pick-card', discardCardId: null, selectedDieIds: [] })}
            className="min-h-[44px] rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-400 hover:border-neutral-500 active:bg-neutral-800"
          >
            Discard to reroll
          </button>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex-1" />

        {/* Commit */}
        {isMyTurn && (
          <button
            type="button"
            onClick={handleCommit}
            disabled={
              (activeFlow?.kind === 'resolve' && (() => {
                const sym = activeFlow.symbol;
                if (sym === 'melee' || sym === 'ranged' || sym === 'shield') {
                  return activeFlow.pendingTargets.length === 0 || activeFlow.selectedDieIds.length > 0;
                }
                return false;
              })()) ||
              (activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice' && !activeFlow.discardCardId)
            }
            className={`min-h-[44px] rounded-xl border px-6 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              activeFlow && activeFlow.kind !== 'reroll'
                ? 'border-emerald-700 bg-emerald-900 text-emerald-50 hover:bg-emerald-800'
                : activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice'
                  ? 'border-amber-700 bg-amber-900 text-amber-50 hover:bg-amber-800'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-100 hover:border-neutral-500'
            } active:opacity-80`}
          >
            {commitLabel}
          </button>
        )}
      </div>

      {confirmPass && (
        <ConfirmOverlay
          title="Pass your turn?"
          body="You haven't taken an action. Pass to your opponent?"
          tone="warning"
          confirmLabel="Pass"
          onConfirm={() => { send({ type: 'pass', playerId }); setConfirmPass(false); }}
          onCancel={() => setConfirmPass(false)}
        />
      )}
    </>
  );
}

/** Square character card tile. Exhausted = slight clockwise tilt. Stats overlay on left side. */
function CharacterCard({
  char,
  game,
  catalogById,
  className = '',
  tipDirection = 'right',
  hp,
  shields,
  eligible = false,
  pendingExhaust = false,
  targetRing,
  pendingCounter,
  abilityBadges,
  onAbilityBadgeTap,
  onTap,
  onUpgradeTap,
}: {
  char: CharacterState;
  game: GameState;
  catalogById: Map<string, Card>;
  className?: string;
  tipDirection?: 'right' | 'left';
  hp?: number;
  shields?: number;
  eligible?: boolean;
  pendingExhaust?: boolean;
  /** 'damage' = red ring (opponent damage target), 'shield' = blue ring (shield target). */
  targetRing?: 'damage' | 'shield';
  /** Pending value from a committed multi-target resolve group (shown as a counter badge). */
  pendingCounter?: { value: number; kind: 'damage' | 'shield' };
  abilityBadges?: Array<{ abilityIndex: number; kind: 'action' | 'powerAction'; eligible: boolean }>;
  onAbilityBadgeTap?: (abilityIndex: number, abilityKind: 'action' | 'powerAction') => void;
  onTap: () => void;
  onUpgradeTap: (upgradeId: string) => void;
}) {
  const catalogId = game.cardCatalogIds[char.id];
  const card = catalogId ? catalogById.get(catalogId) : undefined;
  const exhaustedTransform = tipDirection === 'right' ? 'rotate(6deg)' : 'rotate(-6deg)';
  const resolvedHp = hp ?? (char.health - char.damage);
  const resolvedShields = shields ?? char.shields;
  const showTilt = char.exhausted || pendingExhaust;

  return (
    <div className={`relative overflow-visible ${className}`} style={{ aspectRatio: '1' }}>
      <button
        type="button"
        onClick={onTap}
        className={`absolute inset-0 overflow-hidden rounded-xl border text-left transition-transform ${
          targetRing === 'damage'
            ? 'border-red-500 ring-2 ring-red-500/60'
            : targetRing === 'shield'
              ? 'border-blue-500 ring-2 ring-blue-500/60'
              : eligible
                ? 'border-emerald-500 ring-2 ring-emerald-500/60'
                : char.exhausted
                  ? 'border-neutral-600 opacity-70'
                  : pendingExhaust
                    ? 'border-emerald-600'
                    : 'border-neutral-700'
        }`}
        style={{
          transform: showTilt ? exhaustedTransform : 'none',
          transformOrigin: 'center center',
        }}
        aria-label={`${card?.name ?? 'Character'} — ${resolvedHp} HP${char.exhausted ? ' (exhausted)' : ''}`}
      >
        <CardArtBg artUrl={card?.artUrl} type={card?.type ?? 'character'} frameX={card?.artFrameX} frameY={card?.artFrameY} frameZoom={card?.artFrameZoom} />
        {/* HP + shield overlay — left side, stacked vertically */}
        <div className="absolute left-1 top-1 flex flex-col gap-0.5">
          {resolvedShields > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-blue-900/80 px-1 py-0.5 text-[9px] font-bold leading-none text-blue-200 backdrop-blur-sm">
              <ShieldIcon />{resolvedShields}
            </div>
          )}
          <div className="flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold leading-none text-red-300 backdrop-blur-sm">
            <HeartIcon />{resolvedHp}
          </div>
        </div>
        {/* Pending counter badge — top-right, shows committed multi-target damage/shield value */}
        {pendingCounter && (
          <div className={`absolute right-1 top-1 rounded px-1 py-0.5 text-[9px] font-bold leading-none backdrop-blur-sm ${
            pendingCounter.kind === 'damage' ? 'bg-red-900/90 text-red-200' : 'bg-blue-900/90 text-blue-200'
          }`}>
            {pendingCounter.kind === 'damage' ? '−' : '+'}{pendingCounter.value}
          </div>
        )}
      </button>

      {/* Upgrade badges — centered at bottom */}
      {char.upgradeIds.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center gap-0.5 pb-1">
          {char.upgradeIds.map((uid) => {
            const upCatalogId = game.cardCatalogIds[uid];
            const upCard = upCatalogId ? catalogById.get(upCatalogId) : undefined;
            const fx = upCard?.badgeFrameX ?? 50;
            const fy = upCard?.badgeFrameY ?? 50;
            const fz = upCard?.badgeFrameZoom ?? 1;
            return (
              <button
                key={uid}
                type="button"
                onClick={(e) => { e.stopPropagation(); onUpgradeTap(uid); }}
                style={{ width: 40, height: 40 }}
                className="pointer-events-auto relative flex-shrink-0 overflow-hidden rounded-full border-2 border-neutral-500"
                aria-label={upCard?.name ?? 'Upgrade'}
              >
                {upCard?.artUrl ? (
                  <img
                    src={upCard.artUrl}
                    alt=""
                    aria-hidden
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: `${fx}% ${fy}%`,
                      transform: fz > 1 ? `scale(${fz})` : undefined,
                      transformOrigin: `${fx}% ${fy}%`,
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${cardArtGradient(upCard?.type ?? 'upgrade')}`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Ability action badges — centered at bottom edge, half outside card */}
      {abilityBadges && abilityBadges.length > 0 && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 translate-y-1/2 flex-row gap-1">
          {abilityBadges.map((b) => {
            const bx = card?.badgeFrameX ?? 50;
            const by = card?.badgeFrameY ?? 50;
            const bz = card?.badgeFrameZoom ?? 1;
            return (
              <button
                key={b.abilityIndex}
                type="button"
                disabled={!b.eligible}
                onClick={(e) => { e.stopPropagation(); if (b.eligible) onAbilityBadgeTap?.(b.abilityIndex, b.kind); }}
                style={{ width: 28, height: 28 }}
                className={`pointer-events-auto relative flex-shrink-0 overflow-hidden rounded-full border-2 transition-colors ${
                  b.eligible
                    ? 'border-emerald-500 ring-1 ring-emerald-500/60'
                    : 'border-neutral-600 opacity-50'
                }`}
                aria-label={b.kind === 'powerAction' ? 'Power Action ability' : 'Action ability'}
              >
                {card?.artUrl ? (
                  <img
                    src={card.artUrl}
                    alt=""
                    aria-hidden
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: `${bx}% ${by}%`,
                      transform: bz > 1 ? `scale(${bz})` : undefined,
                      transformOrigin: `${bx}% ${by}%`,
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${cardArtGradient(card?.type ?? 'character')}`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Stack of die tiles for one character's pool dice. */
function DiceStack({
  dice,
  diceInteractive,
  selectionMode,
  horizontal = false,
  eligibleSymbols,
}: {
  dice: DieInPool[];
  diceInteractive: boolean;
  selectionMode: SelectionMode | null;
  horizontal?: boolean;
  eligibleSymbols?: readonly string[];
}) {
  const activeFlow = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  // Reroll path still uses selectionMode
  const toggleSelectedDie = useApp((s) => s.toggleSelectedDie);

  const inRerollPickDice = activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice';
  const inRerollMode = selectionMode?.kind === 'reroll'; // legacy path, kept for compat
  const inResolveFlow = activeFlow?.kind === 'resolve';

  const handleTap = (d: DieInPool) => {
    // ── Reroll pick-dice (activeFlow) ─────────────────────────────────────
    if (inRerollPickDice && activeFlow?.kind === 'reroll') {
      const isSelected = activeFlow.selectedDieIds.includes(d.instanceId);
      const next = isSelected
        ? activeFlow.selectedDieIds.filter((id) => id !== d.instanceId)
        : [...activeFlow.selectedDieIds, d.instanceId];
      setActiveFlow({ ...activeFlow, selectedDieIds: next });
      return;
    }
    // ── Reroll path (legacy selectionMode) ───────────────────────────────
    if (inRerollMode) { toggleSelectedDie(d.instanceId); return; }

    // ── Resolve path ──────────────────────────────────────────────────────
    if (inResolveFlow) {
      const flow = activeFlow!; // narrowed
      if (flow.kind !== 'resolve') return;
      const isSelected = flow.selectedDieIds.includes(d.instanceId);
      if (isSelected) {
        const next = flow.selectedDieIds.filter((id) => id !== d.instanceId);
        if (next.length === 0 && flow.pendingTargets.length === 0) {
          setActiveFlow(null);
        } else {
          setActiveFlow({ ...flow, selectedDieIds: next });
        }
      } else {
        const spentIds = new Set(flow.pendingTargets.flatMap(t => [...t.dieInstanceIds]));
        if (!spentIds.has(d.instanceId) && canSelectDie(d, flow.symbol as DieSymbol)) {
          setActiveFlow({ ...flow, selectedDieIds: [...flow.selectedDieIds, d.instanceId] });
        }
      }
      return;
    }

    // ── Idle: start a resolve flow ─────────────────────────────────────────
    if (diceInteractive && activeFlow === null && !d.face.modifier) {
      if (!eligibleSymbols?.includes(d.face.symbol)) return;
      if (d.face.symbol === 'focus') {
        setActiveFlow({ kind: 'face-pick', focuserDieIds: [d.instanceId], budget: d.face.value, history: [], pickingForDieId: null });
        return;
      }
      setActiveFlow({ kind: 'resolve', symbol: d.face.symbol, selectedDieIds: [d.instanceId], pendingTargets: [] });
    }
  };

  const tileSize = horizontal ? 'h-10 w-10' : 'h-12 w-12';
  const tileText = horizontal ? 'text-[8px]' : 'text-[10px]';
  const valueText = horizontal ? 'text-xs' : 'text-base';

  return (
    <div className={`flex gap-1 ${horizontal ? 'w-full flex-row flex-wrap items-center justify-center min-h-[40px]' : 'flex-col'}`}>
      {dice.map((d) => {
        // ── Appearance ───────────────────────────────────────────────────
        let tileClass = 'border-neutral-700 bg-neutral-900 text-neutral-300';
        let disabled = false;

        if (inRerollPickDice && activeFlow?.kind === 'reroll') {
          const isSelected = activeFlow.selectedDieIds.includes(d.instanceId);
          tileClass = isSelected
            ? 'border-amber-500 bg-amber-950 text-amber-100 ring-2 ring-amber-500'
            : 'border-amber-600/50 bg-neutral-900 text-neutral-300 ring-1 ring-amber-600/30';
        } else if (inResolveFlow && activeFlow?.kind === 'resolve') {
          const flow = activeFlow;
          const spentIds = new Set(flow.pendingTargets.flatMap(t => [...t.dieInstanceIds]));
          const isSelected = flow.selectedDieIds.includes(d.instanceId);
          const isSpent = spentIds.has(d.instanceId);
          const canAdd = !isSelected && !isSpent && canSelectDie(d, flow.symbol as DieSymbol);
          if (isSelected) {
            tileClass = 'border-emerald-500 bg-emerald-950 text-emerald-100 ring-2 ring-emerald-500';
          } else if (isSpent) {
            tileClass = 'border-neutral-800 bg-neutral-950 text-neutral-600 opacity-30';
            disabled = true;
          } else if (canAdd) {
            tileClass = 'border-emerald-500 bg-neutral-900 text-neutral-300 ring-1 ring-emerald-500/50';
          } else {
            tileClass = 'border-neutral-800 bg-neutral-950 text-neutral-600 opacity-50';
            disabled = true;
          }
        } else if (inRerollMode) {
          const isSelected = selectionMode!.selectedDieIds.includes(d.instanceId);
          const canPick = isSelected || canRerollDie(d);
          if (isSelected) tileClass = 'border-emerald-500 bg-emerald-950 text-emerald-100 ring-2 ring-emerald-500';
          else if (!canPick) { tileClass = 'border-neutral-800 bg-neutral-950 text-neutral-600 opacity-50'; disabled = true; }
        } else if (eligibleSymbols?.includes(d.face.symbol)) {
          tileClass = 'border-emerald-500 bg-neutral-900 text-neutral-300 ring-1 ring-emerald-500/50';
        }

        const interactive = diceInteractive || inRerollMode || inResolveFlow || inRerollPickDice;
        const tile = (
          <div
            className={`flex ${tileSize} flex-col items-center justify-center rounded border ${tileText} uppercase ${tileClass}`}
            title={`${d.face.symbol} ${d.face.value}${d.face.modifier ? ' +mod' : ''}`}
          >
            <span className={`font-mono ${valueText} text-neutral-100`}>
              {d.face.modifier ? '+' : ''}{d.face.value || ''}
            </span>
            <span className="text-[7px] leading-tight">{symbolLabel(d.face.symbol)}</span>
          </div>
        );

        if (!interactive) return <div key={d.instanceId}>{tile}</div>;
        return (
          <button
            key={d.instanceId}
            type="button"
            disabled={disabled}
            onClick={() => handleTap(d)}
            className={`${horizontal ? 'min-h-[44px]' : 'min-h-[44px] min-w-[44px]'} rounded disabled:cursor-not-allowed`}
          >
            {tile}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Face picker panel — shown when the player is in a face-pick flow and has
 * selected a target die. Displays all 6 faces of that die as tappable tiles.
 */
function FacePickerPanel({ game, playerId }: { game: GameState; playerId: string }) {
  const activeFlow    = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);

  if (activeFlow?.kind !== 'face-pick' || !activeFlow.pickingForDieId) return null;

  const myPlayer = game.players[playerId];
  const targetDie = myPlayer?.diceInPool.find((d) => d.instanceId === activeFlow.pickingForDieId);
  if (!targetDie) return null;

  // Find the die spec (6 faces) via ownerInstanceId.
  const ownerChar = targetDie.ownerInstanceId
    ? myPlayer?.characters[targetDie.ownerInstanceId]
    : null;
  const dieSpec = ownerChar?.dice.find((d) => d.instanceId === targetDie.instanceId);
  if (!dieSpec) return null;

  // Current effective face (may have been flipped already in this flow).
  const lastFlip = [...activeFlow.history].reverse().find(
    (e) => e.kind === 'flip' && e.targetDieId === activeFlow.pickingForDieId,
  );
  const currentFaceIndex = lastFlip?.kind === 'flip' ? lastFlip.faceIndex : targetDie.faceIndex;

  const handlePickFace = (faceIndex: number) => {
    const prevFace = dieSpec.faces[currentFaceIndex]!;
    const newFace  = dieSpec.faces[faceIndex]!;
    const flipEvent: import('../store.js').FacePickEvent = {
      kind: 'flip',
      targetDieId: activeFlow.pickingForDieId!,
      faceIndex,
      prevFaceIndex: currentFaceIndex,
      prevFace,
    };
    let next: typeof activeFlow = {
      ...activeFlow,
      budget: activeFlow.budget - 1,
      history: [...activeFlow.history, flipEvent],
      pickingForDieId: null,
    };
    setActiveFlow(next);
  };

  return (
    <div className="shrink-0 border-t border-emerald-800 bg-neutral-950 px-3 py-2">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-emerald-500">
        Pick a face — {activeFlow.budget} flip{activeFlow.budget === 1 ? '' : 's'} remaining
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {dieSpec.faces.map((face, i) => {
          const isCurrent = i === currentFaceIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handlePickFace(i)}
              className={`flex min-h-[56px] min-w-[52px] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 transition-colors ${
                isCurrent
                  ? 'border-emerald-500 bg-emerald-900/40 text-emerald-100'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-emerald-600'
              }`}
            >
              <span className="font-mono text-lg font-bold leading-none">
                {face.modifier ? '+' : ''}{face.value > 0 ? face.value : '—'}
              </span>
              <span className="mt-0.5 text-[9px] tracking-wider text-neutral-400">
                {symLabel(face.symbol)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Expanded overlay for a character in play — shows stats, abilities, die faces. */
function CardDetailOverlay({
  char,
  game,
  catalogById,
  onClose,
}: {
  char: CharacterState;
  game: GameState;
  catalogById: Map<string, Card>;
  onClose: () => void;
}) {
  const catalogId = game.cardCatalogIds[char.id];
  const card = catalogId ? catalogById.get(catalogId) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: '90dvh' }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">{card?.name ?? '—'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-md px-3 text-xs uppercase tracking-wider text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
          >
            Close
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          {/* art */}
          <div className="relative shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: '5/7' }}>
            <CardArtBg artUrl={card?.artUrl} type={card?.type ?? 'character'} frameX={card?.cardFrameX} frameY={card?.cardFrameY} frameZoom={card?.cardFrameZoom} />
          </div>

          {/* type / faction row */}
          {card && (
            <div className="flex flex-wrap gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[10px] text-white ${cardTypeBand(card.type)}`}>
                {card.type}{card.subtypes?.length ? ` · ${card.subtypes.join(', ')}` : ''}
              </span>
              <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
                {card.faction}{card.color ? ` · ${card.color}` : ''}
              </span>
            </div>
          )}

          {/* stats */}
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-neutral-500">Health</dt>
              <dd className="font-mono text-neutral-200">{char.health - char.damage} / {char.health}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-neutral-500">Shields</dt>
              <dd className="font-mono text-neutral-200">{char.shields} / 3</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-neutral-500">Status</dt>
              <dd className="font-mono text-neutral-200">{char.exhausted ? 'Exhausted' : 'Ready'}</dd>
            </div>
          </dl>

          {/* ability text */}
          {card?.displayText ? (
            <p className="text-sm leading-relaxed text-neutral-300">{card.displayText}</p>
          ) : (
            <p className="text-sm italic text-neutral-600">No ability text.</p>
          )}

          {/* die faces */}
          {card?.dieFaces && (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">Die faces</div>
              <div className="flex flex-wrap gap-1.5">
                {card.dieFaces.map((face, i) => (
                  <DieFaceChip key={i} face={face} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Overlay for a played upgrade card. */
function UpgradeDetailOverlay({
  card,
  onClose,
}: {
  card: Card;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-neutral-800 bg-neutral-950 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: '90dvh' }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">{card.name}</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-md px-3 text-xs uppercase tracking-wider text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100">Close</button>
        </div>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <div className="relative shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: '5/7' }}>
            <CardArtBg artUrl={card.artUrl} type={card.type} frameX={card.cardFrameX} frameY={card.cardFrameY} frameZoom={card.cardFrameZoom} />
          </div>
          <div className="flex flex-wrap gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[10px] text-white ${cardTypeBand(card.type)}`}>
              {card.type}{card.subtypes?.length ? ` · ${card.subtypes.join(', ')}` : ''}
            </span>
          </div>
          {card.displayText ? (
            <p className="text-sm leading-relaxed text-neutral-300">{card.displayText}</p>
          ) : (
            <p className="text-sm italic text-neutral-600">No ability text.</p>
          )}
          {card.dieFaces && (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">Die faces</div>
              <div className="flex flex-wrap gap-1.5">
                {card.dieFaces.map((face, i) => <DieFaceChip key={i} face={face} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function symbolLabel(symbol: string): string {
  switch (symbol) {
    case 'melee':
      return 'Melee';
    case 'ranged':
      return 'Ranged';
    case 'indirect':
      return 'Indirect';
    case 'shield':
      return 'Shield';
    case 'resource':
      return 'Resource';
    case 'disrupt':
      return 'Disrupt';
    case 'discard':
      return 'Discard';
    case 'draw':
      return 'Draw';
    case 'focus':
      return 'Focus';
    case 'special':
      return 'Special';
    case 'modifier':
      return 'Modifier';
    case 'blank':
      return 'Blank';
    default:
      return symbol;
  }
}
