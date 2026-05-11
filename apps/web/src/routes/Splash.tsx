import { isError } from '@prophecy/protocol';
import { useState } from 'react';

import { saveCachedLobby } from '../lib/lobbyCache.js';
import { getSocket } from '../lib/socket.js';
import { useApp } from '../store.js';

// Splash: pick a name, then create or join a lobby.
export function Splash() {
  const playerId = useApp((s) => s.playerId);
  const displayName = useApp((s) => s.displayName);
  const setDisplayName = useApp((s) => s.setDisplayName);
  const setLobby = useApp((s) => s.setLobby);
  const setError = useApp((s) => s.setError);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'join'>(null);

  const ready = displayName.trim().length > 0 && busy === null;

  const create = async () => {
    if (!ready) return;
    setBusy('create');
    getSocket().emit('lobby.create', { playerId, displayName: displayName.trim() }, (resp) => {
      setBusy(null);
      if (isError(resp)) {
        setError(resp.message);
        return;
      }
      saveCachedLobby({ roomId: resp.roomId, code: resp.code });
      setLobby(resp);
    });
  };

  const join = async () => {
    if (!ready || code.trim().length === 0) return;
    setBusy('join');
    getSocket().emit(
      'lobby.join',
      { playerId, displayName: displayName.trim(), code: code.trim().toUpperCase() },
      (resp) => {
        setBusy(null);
        if (isError(resp)) {
          setError(resp.message);
          return;
        }
        saveCachedLobby({ roomId: resp.roomId, code: resp.code });
        setLobby(resp);
      },
    );
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Prophecy</h1>
        <p className="max-w-md text-balance text-neutral-400">
          Two-player dice-and-card duel. Pick a name, then create or join a lobby.
        </p>
      </header>

      <div className="w-full max-w-sm space-y-6">
        <label className="block space-y-2 text-left">
          <span className="text-sm font-medium text-neutral-300">Display name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Sean"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3 text-base text-neutral-100 placeholder-neutral-500 outline-none focus:border-neutral-600"
          />
        </label>

        <button
          type="button"
          onClick={create}
          disabled={!ready}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-medium text-white transition disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {busy === 'create' ? 'Creating…' : 'Create lobby'}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-500">
          <span className="h-px flex-1 bg-neutral-800" />
          or
          <span className="h-px flex-1 bg-neutral-800" />
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="Invite code"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3 text-center text-lg font-mono tracking-[0.4em] text-neutral-100 placeholder-neutral-500 outline-none focus:border-neutral-600"
          />
          <button
            type="button"
            onClick={join}
            disabled={!ready || code.trim().length === 0}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-medium text-neutral-100 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
          >
            {busy === 'join' ? 'Joining…' : 'Join lobby'}
          </button>
        </div>
      </div>
    </main>
  );
}
