import { isError } from '@prophecy/protocol';
import { useState } from 'react';

import { getSocket } from '../lib/socket.js';
import { useApp } from '../store.js';

// Lobby: shows the invite code, the players who've joined, and the
// host-only Start button.
export function Lobby() {
  const playerId = useApp((s) => s.playerId);
  const lobby = useApp((s) => s.lobby);
  const setLobby = useApp((s) => s.setLobby);
  const setError = useApp((s) => s.setError);

  const [busy, setBusy] = useState(false);

  if (!lobby) return null;

  const isHost = lobby.hostId === playerId;
  const canStart = isHost && lobby.members.length === 2 && lobby.phase === 'lobby';

  const start = () => {
    if (!canStart) return;
    setBusy(true);
    getSocket().emit(
      'lobby.start',
      { playerId, roomId: lobby.roomId },
      (resp) => {
        setBusy(false);
        if (isError(resp)) {
          setError(resp.message);
          return;
        }
        setLobby(resp);
      },
    );
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
    } catch {
      // ignore — fallback would be a manual selection prompt
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Lobby</h1>

      <section className="space-y-3">
        <div className="text-sm uppercase tracking-wider text-neutral-500">Invite code</div>
        <button
          type="button"
          onClick={copyCode}
          aria-label="Copy invite code"
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-6 py-4 text-3xl font-mono tracking-[0.5em] text-neutral-100 transition hover:border-neutral-600"
        >
          {lobby.code}
        </button>
        <div className="text-xs text-neutral-500">Tap to copy. Share with your opponent.</div>
      </section>

      <section className="w-full max-w-sm space-y-3">
        <div className="text-sm uppercase tracking-wider text-neutral-500">Players</div>
        <ul className="space-y-2">
          {lobby.members.map((m) => (
            <li
              key={m.playerId}
              className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-label={m.connected ? 'connected' : 'disconnected'}
                  className={`inline-block h-2 w-2 rounded-full ${m.connected ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                />
                <span className="font-medium">{m.displayName}</span>
                {m.playerId === lobby.hostId && (
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neutral-400">
                    host
                  </span>
                )}
                {m.playerId === playerId && (
                  <span className="text-xs text-neutral-500">(you)</span>
                )}
              </span>
            </li>
          ))}
          {lobby.members.length < 2 && (
            <li className="rounded-lg border border-dashed border-neutral-800 px-4 py-3 text-left text-sm text-neutral-500">
              Waiting for opponent…
            </li>
          )}
        </ul>
      </section>

      {isHost && (
        <button
          type="button"
          onClick={start}
          disabled={!canStart || busy}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {busy ? 'Starting…' : 'Start game'}
        </button>
      )}
      {!isHost && lobby.phase === 'lobby' && (
        <div className="text-sm text-neutral-500">Waiting for the host to start…</div>
      )}
    </main>
  );
}
