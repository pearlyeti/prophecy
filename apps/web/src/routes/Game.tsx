import { getLegalActions, type DieSymbol, type DieInPool, type DieFace } from '@prophecy/game-engine';
import type { Action, Card, EngineEvent, GameState } from '@prophecy/protocol';
import { isError } from '@prophecy/protocol';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchCards } from './admin/api.js';

import { getSocket } from '../lib/socket.js';
import { useApp } from '../store.js';

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

  const [catalog, setCatalog] = useState<Card[]>([]);
  const [handMode, setHandMode] = useState<HandMode | null>(null);
  const [handFocusId, setHandFocusId] = useState<string | null>(null);

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
    if (!isMyTurn || !inActionPhase) exitSelectionMode();
  }, [isMyTurn, inActionPhase, exitSelectionMode]);

  // Close hand overlay on turn rotation too.
  useEffect(() => {
    if (!inActionPhase) { setHandMode(null); setHandFocusId(null); }
  }, [inActionPhase]);

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

  const me = lobby.members.find((m) => m.playerId === playerId);
  const opponent = lobby.members.find((m) => m.playerId !== playerId);
  const ended = game.phase === 'ended';
  const myPlayer = game.players[playerId];
  const showHandStrip =
    !ended &&
    (game.phase === 'action' || game.phase === 'upkeep') &&
    selectionMode === null &&
    handMode === null;

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

  return (
    <main className={`min-h-dvh px-4 py-6 sm:px-6 ${showHandStrip ? 'pb-[124px]' : ''}`}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {me?.displayName ?? 'You'}{' '}
          <span className="text-neutral-500">vs</span>{' '}
          {opponent?.displayName ?? '…'}
        </h1>
        <div className="text-xs uppercase tracking-wider text-neutral-500">
          {game.phase === 'setup' && `Setup · ${game.setup?.step}`}
          {game.phase === 'action' && `Round ${game.roundNumber} · ${isMyTurn ? 'your turn' : 'opponent'}`}
          {game.phase === 'upkeep' && `Upkeep · round ${game.roundNumber}`}
          {ended && 'Game ended'}
        </div>
      </header>

      {ended && <EndedBanner game={game} playerId={playerId} />}

      {!ended && game.phase === 'setup' && (
        <SetupPanel game={game} playerId={playerId} send={send} />
      )}

      {!ended && game.phase === 'action' && !selectionMode && (
        <ActionPanel
          game={game}
          playerId={playerId}
          send={send}
          isMyTurn={isMyTurn}
          onOpenHand={openHand}
        />
      )}

      {(game.phase === 'action' || game.phase === 'upkeep' || ended) && (
        <DicePoolStrip game={game} playerId={playerId} />
      )}

      <PlayerSummaries game={game} playerId={playerId} catalogById={catalogById} />

      <EventLog events={events} />

      <details className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/50">
        <summary className="cursor-pointer px-4 py-2 text-xs uppercase tracking-wider text-neutral-500">
          Raw state
        </summary>
        <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-neutral-400">
          {JSON.stringify(game, null, 2)}
        </pre>
      </details>

      {selectionMode && !ended && game.phase === 'action' && (
        <SelectionActionBar game={game} playerId={playerId} send={send} />
      )}

      {showHandStrip && myPlayer && (
        <HandStrip
          hand={myPlayer.hand}
          game={game}
          playerId={playerId}
          catalogById={catalogById}
          isMyTurn={isMyTurn}
          onTap={(id) => openHand(isMyTurn ? 'play' : 'browse', id)}
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
}: {
  game: GameState;
  playerId: string;
  send: (a: Action) => void;
  isMyTurn: boolean;
  onOpenHand: (mode: HandMode) => void;
}) {
  const [overlay, setOverlay] = useState<OpenOverlay | null>(null);
  const enterResolveMode = useApp((s) => s.enterResolveMode);
  const legal = getLegalActions(game, playerId);
  const close = () => setOverlay(null);
  const dispatch = (a: Action) => { send(a); close(); };
  const me = game.players[playerId];

  return (
    <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
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
          onClick={enterResolveMode}
        />
        <ActionButton
          label="Play card"
          subLabel={legal.canPlayCard ? `${me?.hand.length ?? 0} in hand` : 'no card affordable'}
          enabled={legal.canPlayCard}
          onClick={() => onOpenHand('play')}
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
          onClick={() => onOpenHand('reroll')}
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
    </section>
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

function PlayerSummaries({
  game,
  playerId,
  catalogById: _catalogById,
}: {
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
}) {
  const lobby = useApp.getState().lobby!;
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {game.playerOrder.map((id) => {
        const p = game.players[id]!;
        const name = lobby.members.find((m) => m.playerId === id)?.displayName ?? id;
        const isMe = id === playerId;
        const isController = game.battlefieldControllerId === id;
        const isActive = game.activePlayerId === id;
        return (
          <div
            key={id}
            className={`rounded-xl border p-4 text-sm ${isActive ? 'border-emerald-700 bg-emerald-950/20' : 'border-neutral-800 bg-neutral-900/40'}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium">
                {name} {isMe && <span className="text-xs text-neutral-500">(you)</span>}
              </div>
              <div className="flex gap-2 text-[10px] uppercase tracking-wider text-neutral-500">
                {isController && <span className="rounded bg-neutral-800 px-2 py-0.5">controller</span>}
                {isActive && <span className="rounded bg-emerald-800 px-2 py-0.5 text-emerald-200">active</span>}
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Resources" value={p.resources} />
              <Stat label="Hand" value={p.hand.length} />
              <Stat label="Deck" value={p.deck.length} />
              <Stat label="Pool" value={p.diceInPool.length} />
              <Stat label="Discard" value={p.discard.length} />
              <Stat label="Characters" value={p.characterOrder.length} />
            </dl>
            <div className="mt-3 space-y-1">
              {p.characterOrder.map((cid) => {
                const c = p.characters[cid]!;
                return (
                  <div key={cid} className="flex items-center justify-between text-xs text-neutral-400">
                    <span>
                      {cid.replace(/^.*\./, '')}
                      <span className="ml-2 text-[10px] text-neutral-600">
                        {c.dice.length}d{c.elite ? ' · elite' : ''}
                      </span>
                    </span>
                    <span className="font-mono">
                      ♥ {c.damage} / shields {c.shields} {c.exhausted ? '· exhausted' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className="font-mono text-neutral-200">{value}</dd>
    </div>
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

function EventLog({ events }: { events: readonly EngineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Recent events</div>
      <ol className="space-y-1 text-xs text-neutral-400">
        {events.slice(-10).map((e, i) => (
          <li key={`${i}-${e.type}`} className="font-mono">
            <span className="text-neutral-300">{e.type}</span>
            <span className="ml-2 text-neutral-500">{JSON.stringify(e.payload)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DicePoolStrip({ game, playerId }: { game: GameState; playerId: string }) {
  const lobby = useApp.getState().lobby!;
  const selectionMode = useApp((s) => s.selectionMode);
  const toggleSelectedDie = useApp((s) => s.toggleSelectedDie);
  const me = game.players[playerId];
  const selectedIds = selectionMode?.selectedDieIds ?? null;
  // Symbol lock applies in resolve mode only. Reroll mode lets you pick
  // any non-blank dice without grouping by symbol.
  const lockedSymbol: DieSymbol | null = (() => {
    if (selectionMode?.kind !== 'resolve' || !selectedIds?.length || !me) return null;
    const first = me.diceInPool.find((d) => selectedIds.includes(d.instanceId));
    return first?.face.symbol ?? null;
  })();

  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2">
      {game.playerOrder.map((id) => {
        const p = game.players[id]!;
        const name = lobby.members.find((m) => m.playerId === id)?.displayName ?? id;
        const isMe = id === playerId;
        const interactive = selectionMode !== null && isMe;
        return (
          <div key={id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
              <span>{name}'s dice pool</span>
              <span>{p.diceInPool.length}</span>
            </div>
            {p.diceInPool.length === 0 ? (
              <div className="text-xs text-neutral-600">(empty)</div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {p.diceInPool.map((d) => {
                  const selected = !!selectedIds?.includes(d.instanceId);
                  const enabled =
                    interactive &&
                    (selected ||
                      (selectionMode?.kind === 'reroll'
                        ? canRerollDie(d)
                        : canSelectDie(d, lockedSymbol)));
                  const tile = (
                    <div
                      className={`flex h-12 w-12 flex-col items-center justify-center rounded-md border text-[10px] uppercase ${
                        selected
                          ? 'border-emerald-500 bg-emerald-950 text-emerald-100 ring-2 ring-emerald-500'
                          : interactive && !enabled
                            ? 'border-neutral-800 bg-neutral-950 text-neutral-600 opacity-50'
                            : 'border-neutral-700 bg-neutral-900 text-neutral-300'
                      }`}
                      title={`${d.face.symbol} ${d.face.value} (cost ${d.face.cost})${d.face.modifier ? ' +mod' : ''}`}
                    >
                      <span className="text-base font-mono text-neutral-100">
                        {d.face.modifier ? '+' : ''}
                        {d.face.value || ''}
                      </span>
                      <span className="text-[9px] leading-tight">{symbolLabel(d.face.symbol)}</span>
                    </div>
                  );
                  if (interactive) {
                    return (
                      <li key={d.instanceId}>
                        <button
                          type="button"
                          disabled={!enabled}
                          onClick={() => toggleSelectedDie(d.instanceId)}
                          // min size satisfies the 44×44 touch-target rule
                          // even though the visual tile is 48×48.
                          className="min-h-[44px] min-w-[44px] rounded-md disabled:cursor-not-allowed"
                        >
                          {tile}
                        </button>
                      </li>
                    );
                  }
                  return <li key={d.instanceId}>{tile}</li>;
                })}
              </ul>
            )}
            {interactive && p.diceInPool.length > 0 && (
              <div className="mt-2 text-[10px] text-neutral-500">
                {selectionMode?.kind === 'reroll'
                  ? 'Tap any dice to add them. Tap a selected die to remove it. Zero is fine.'
                  : 'Tap dice of the same symbol to add them. Tap a selected die to remove it.'}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * Whether a pool die can be added to the current resolve-mode selection.
 *
 *  - Blank dice and engine-unimplemented symbols (special / focus /
 *    indirect / discard) are never selectable.
 *  - With nothing selected yet, only non-modifier dice are eligible
 *    (a modifier-only resolution is illegal per the rules).
 *  - With a locked symbol, any die of that symbol — modifier or not —
 *    is eligible.
 */
/**
 * Whether a pool die can be added to a reroll-mode selection. The
 * engine accepts any die (it just rerolls them), so the only thing the
 * UI gates is blank — those have no face the player would want to
 * commit a discard to. All other symbols, modifier or not, are fair
 * game.
 */
function canRerollDie(d: DieInPool): boolean {
  return d.face.symbol !== 'blank';
}

function canSelectDie(d: DieInPool, lockedSymbol: DieSymbol | null): boolean {
  if (d.face.symbol === 'blank') return false;
  // Engine doesn't resolve these yet — gate them out of v1 selection.
  if (
    d.face.symbol === 'special' ||
    d.face.symbol === 'focus' ||
    d.face.symbol === 'indirect' ||
    d.face.symbol === 'discard' ||
    d.face.symbol === 'draw'
  ) {
    return false;
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
// Hand strip + expanded overlay (WEB-4)
// ─────────────────────────────────────────────────────────────────────────────

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
}: {
  instanceId: string;
  game: GameState;
  catalogById: Map<string, Card>;
  eligible: boolean;
  onTap: () => void;
}) {
  const catalogId = game.cardCatalogIds[instanceId];
  const card = catalogId ? catalogById.get(catalogId) : undefined;
  const cost = game.cardCosts[instanceId] ?? 0;

  return (
    <button
      type="button"
      onClick={onTap}
      className={`relative flex h-[96px] w-[64px] shrink-0 flex-col overflow-hidden rounded-lg border text-left transition active:scale-95 ${
        eligible
          ? 'border-emerald-500 shadow-[0_0_8px_1px_rgba(16,185,129,0.3)]'
          : 'border-neutral-700'
      }`}
    >
      {/* art placeholder */}
      <div className={`flex-1 bg-gradient-to-b ${cardArtGradient(card?.type ?? '')}`} />
      {/* name + cost row */}
      <div className="flex shrink-0 items-center gap-1 bg-neutral-900 px-1.5 py-1">
        <span className="line-clamp-1 flex-1 text-[9px] leading-tight text-neutral-200">
          {card?.name ?? '—'}
        </span>
        <span className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-700 text-[9px] font-bold text-neutral-200">
          {cost}
        </span>
      </div>
    </button>
  );
}

function HandStrip({
  hand,
  game,
  playerId,
  catalogById,
  isMyTurn,
  onTap,
}: {
  hand: readonly string[];
  game: GameState;
  playerId: string;
  catalogById: Map<string, Card>;
  isMyTurn: boolean;
  onTap: (instanceId: string) => void;
}) {
  const me = game.players[playerId];
  const legal = isMyTurn ? getLegalActions(game, playerId) : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="flex items-center px-3 py-2">
        {hand.length === 0 ? (
          <div className="text-[11px] text-neutral-600">Hand empty</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hand.map((id) => {
              const cost = game.cardCosts[id] ?? 0;
              const affordable = (me?.resources ?? 0) >= cost;
              const eligible = isMyTurn && affordable && (legal?.canPlayCard ?? false);
              return (
                <HandCardTile
                  key={id}
                  instanceId={id}
                  game={game}
                  catalogById={catalogById}
                  eligible={eligible}
                  onTap={() => onTap(id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
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

        {/* art area — gradient placeholder until real art lands */}
        <div className={`mx-4 shrink-0 rounded-xl bg-gradient-to-b ${cardArtGradient(card?.type ?? '')} aspect-[3/2]`} />

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
                    {card.type}{card.subtype ? ` · ${card.subtype}` : ''}
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
