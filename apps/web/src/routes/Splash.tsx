import { isError } from '@prophecy/protocol';
import { useState } from 'react';

import { authClient } from '../lib/auth-client.js';
import { saveCachedLobby } from '../lib/lobbyCache.js';
import { getSocket } from '../lib/socket.js';
import { trpc } from '../lib/trpc.js';
import { useApp } from '../store.js';

// Splash: pick a name, then create / join a lobby or find a match.
export function Splash() {
  const playerId = useApp((s) => s.playerId);
  const displayName = useApp((s) => s.displayName);
  const setDisplayName = useApp((s) => s.setDisplayName);
  const setLobby = useApp((s) => s.setLobby);
  const setError = useApp((s) => s.setError);

  const { data: session } = trpc.auth.session.useQuery();
  const utils = trpc.useUtils();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'join' | 'matchmaking'>(null);

  const signOut = async () => {
    await authClient.signOut();
    await utils.auth.session.invalidate();
  };

  const ready = displayName.trim().length > 0 && busy === null;

  const create = async () => {
    if (!ready) return;
    setBusy('create');
    getSocket().emit('lobby.create', { playerId, displayName: displayName.trim() }, (resp) => {
      setBusy(null);
      if (isError(resp)) { setError(resp.message); return; }
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
        if (isError(resp)) { setError(resp.message); return; }
        saveCachedLobby({ roomId: resp.roomId, code: resp.code });
        setLobby(resp);
      },
    );
  };

  const findMatch = () => {
    if (!ready) return;
    setBusy('matchmaking');
    // deckId is ignored server-side for now — server assigns corpus decks randomly.
    getSocket().emit('lobby.findMatch', { playerId, displayName: displayName.trim(), deckId: 'DECK_A' }, (resp) => {
      if (isError(resp)) {
        setBusy(null);
        setError(resp.message);
      }
      // On success (queued: true) we stay in matchmaking state until
      // lobby.matchFound arrives via SocketBridge in App.tsx.
    });
  };

  const cancelSearch = () => {
    getSocket().emit('lobby.leaveQueue', { playerId });
    setBusy(null);
  };

  // ── Searching state ─────────────────────────────────────────────
  if (busy === 'matchmaking') {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-8 px-6 py-12 text-center">
        <div className="space-y-4">
          <div className="text-2xl font-semibold text-neutral-100">Finding a match…</div>
          <p className="text-neutral-400">Waiting for another player to join.</p>
          <div className="flex justify-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-neutral-700 border-t-emerald-500" />
          </div>
        </div>
        <button
          type="button"
          onClick={cancelSearch}
          className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-6 py-3 text-base font-medium text-neutral-300 transition hover:border-neutral-500"
        >
          Cancel
        </button>
      </main>
    );
  }

  // ── Normal splash ────────────────────────────────────────────────
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Prophecy</h1>
        <p className="max-w-md text-balance text-neutral-400">
          Two-player dice-and-card duel. Pick a name, then find a match or use an invite code.
        </p>
        {session && (
          <p className="text-xs text-neutral-500">
            Signed in
            <button
              type="button"
              onClick={signOut}
              className="ml-2 underline underline-offset-2 hover:text-neutral-300"
            >
              Sign out
            </button>
          </p>
        )}
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

        {/* Primary CTA: Find Match */}
        <button
          type="button"
          onClick={findMatch}
          disabled={!ready}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {busy === 'create' ? 'Creating…' : 'Find Match'}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-neutral-500">
          <span className="h-px flex-1 bg-neutral-800" />
          or use invite code
          <span className="h-px flex-1 bg-neutral-800" />
        </div>

        {/* Secondary: invite-code flow */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={create}
            disabled={!ready}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-medium text-neutral-100 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
          >
            {busy === 'create' ? 'Creating…' : 'Create lobby'}
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="Invite code"
              className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-3 text-center text-lg font-mono tracking-[0.4em] text-neutral-100 placeholder-neutral-500 outline-none focus:border-neutral-600"
            />
            <button
              type="button"
              onClick={join}
              disabled={!ready || code.trim().length === 0}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-medium text-neutral-100 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
