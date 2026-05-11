import type { Action, EngineEvent, GameState } from '@prophecy/protocol';
import { isError } from '@prophecy/protocol';
import { useState } from 'react';

import { getSocket } from '../lib/socket.js';
import { useApp } from '../store.js';

// Bare-bones in-game UI. Renders the public game state and exposes the
// implemented actions as buttons. Pretty UI comes later — first goal is
// proving end-to-end multiplayer with two real clients.
export function Game() {
  const playerId = useApp((s) => s.playerId);
  const lobby = useApp((s) => s.lobby);
  const game = useApp((s) => s.game);
  const events = useApp((s) => s.recentEvents);
  const setError = useApp((s) => s.setError);

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
  const isMyTurn = game.activePlayerId === playerId;
  const ended = game.phase === 'ended';

  return (
    <main className="min-h-dvh px-4 py-6 sm:px-6">
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

      {!ended && game.phase === 'action' && (
        <ActionPanel game={game} playerId={playerId} send={send} isMyTurn={isMyTurn} />
      )}

      <PlayerSummaries game={game} playerId={playerId} />

      <EventLog events={events} />

      <details className="mt-6 rounded-lg border border-neutral-800 bg-neutral-950/50">
        <summary className="cursor-pointer px-4 py-2 text-xs uppercase tracking-wider text-neutral-500">
          Raw state
        </summary>
        <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-neutral-400">
          {JSON.stringify(game, null, 2)}
        </pre>
      </details>
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

      {game.setup.step === 'choose-battlefield' && isWinner && (
        <div className="space-y-2">
          <div className="text-sm text-neutral-300">Choose which battlefield to use:</div>
          <div className="flex flex-wrap gap-2">
            {lobby.members.map((m) => (
              <button
                key={m.playerId}
                type="button"
                onClick={() =>
                  send({
                    type: 'setup.choose-battlefield',
                    playerId,
                    battlefieldOwnerId: m.playerId,
                  })
                }
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm hover:border-neutral-500"
              >
                Use {m.displayName}'s battlefield
                {m.playerId !== playerId && (
                  <span className="ml-2 text-xs text-neutral-500">(you take 2 shields)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {game.setup.step === 'choose-battlefield' && !isWinner && (
        <div className="text-sm text-neutral-400">Waiting for {winnerName} to choose a battlefield…</div>
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

function ActionPanel({
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
  const claimedThisRound = game.playerWhoClaimedThisRound !== null;
  return (
    <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-3 text-sm text-neutral-300">
        {isMyTurn ? 'Your turn — pick an action:' : 'Waiting for opponent…'}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!isMyTurn}
          onClick={() => send({ type: 'pass', playerId })}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pass
        </button>
        <button
          type="button"
          disabled={!isMyTurn || claimedThisRound}
          onClick={() => send({ type: 'claim-battlefield', playerId })}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Claim battlefield
          {claimedThisRound && <span className="ml-2 text-xs text-neutral-500">(taken)</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm('Concede the game?')) send({ type: 'concede', playerId });
          }}
          className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200 hover:border-red-700"
        >
          Concede
        </button>
      </div>
    </section>
  );
}

function PlayerSummaries({ game, playerId }: { game: GameState; playerId: string }) {
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
              <Stat label="Hand" value={p.handCount} />
              <Stat label="Deck" value={p.deckCount} />
              <Stat label="Pool" value={p.diceInPool.length} />
              <Stat label="Discard" value={p.discardIds.length} />
              <Stat label="Characters" value={p.characterOrder.length} />
            </dl>
            <div className="mt-3 space-y-1">
              {p.characterOrder.map((cid) => {
                const c = p.characters[cid]!;
                return (
                  <div key={cid} className="flex items-center justify-between text-xs text-neutral-400">
                    <span>{cid.replace(/^.*\./, '')}</span>
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
        className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500"
      >
        Back to splash
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
