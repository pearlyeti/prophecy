import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isError } from '@prophecy/protocol';
import { useEffect, useRef, useState } from 'react';

import { ErrorBoundary } from './lib/ErrorBoundary.js';
import { clearCachedLobby, loadCachedLobby, saveCachedLobby } from './lib/lobbyCache.js';
import { Admin } from './routes/admin/index.js';
import { Game } from './routes/Game.js';
import { Lobby } from './routes/Lobby.js';
import { Splash } from './routes/Splash.js';
import { getSocket } from './lib/socket.js';
import { trpc, trpcClient } from './lib/trpc.js';
import { useApp } from './store.js';

export function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SocketBridge />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
        <ErrorToast />
        <ConnectionPill />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function Router() {
  const lobby = useApp((s) => s.lobby);
  const game = useApp((s) => s.game);

  // /admin/* is its own surface — bypass game state entirely.
  if (window.location.pathname.startsWith('/admin')) return <Admin />;

  if (game) return <Game />;
  if (lobby) return <Lobby />;
  return <Splash />;
}

function SocketBridge() {
  const playerId = useApp((s) => s.playerId);
  const setLobby = useApp((s) => s.setLobby);
  const setGame = useApp((s) => s.setGame);
  const appendEvents = useApp((s) => s.appendEvents);
  const setStatus = useApp((s) => s.setConnectionStatus);
  const setError = useApp((s) => s.setError);

  // Avoid issuing duplicate rejoin attempts when the connect handler
  // fires multiple times for the same logical session (e.g., socket.io
  // upgrades or fast disconnect/reconnect cycles).
  const rejoinInFlightFor = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const attemptRejoin = () => {
      const cached = loadCachedLobby();
      if (!cached) return;
      // If we already have this lobby in the store, no need to rejoin.
      if (useApp.getState().lobby?.roomId === cached.roomId) return;
      if (rejoinInFlightFor.current === cached.roomId) return;

      rejoinInFlightFor.current = cached.roomId;
      socket.emit('lobby.rejoin', { playerId, roomId: cached.roomId }, (resp) => {
        rejoinInFlightFor.current = null;
        if (isError(resp)) {
          // Lobby is gone (server restart, idle-swept, or never existed
          // under this id). Clear the cache and bounce to splash.
          clearCachedLobby();
          useApp.getState().reset();
          if (resp.code !== 'lobby-not-found') {
            setError(resp.message);
          }
          return;
        }
        saveCachedLobby({ roomId: resp.lobby.roomId, code: resp.lobby.code });
        setLobby(resp.lobby);
        if (resp.game) setGame(resp.game);
      });
    };

    const onConnect = () => {
      setStatus('connected');
      attemptRejoin();
    };
    const onDisconnect = () => setStatus('disconnected');
    const onReconnectAttempt = () => setStatus('reconnecting');

    const onLobby: Parameters<typeof socket.on<'lobby.state'>>[1] = (state) => {
      setLobby(state);
      // Don't null `game` when phase === 'ended'. The server broadcasts
      // lobby.state on every rejoin and immediately after the final
      // action; nulling here would kick both clients back to the
      // lobby route mid-victory screen and cause a toggle bug on
      // refresh. The end banner stays mounted until the player clicks
      // "Leave game" explicitly.
    };
    const onGameState: Parameters<typeof socket.on<'game.state'>>[1] = ({ state }) => {
      setGame(state);
    };
    const onGameEvents: Parameters<typeof socket.on<'game.events'>>[1] = ({ events }) => {
      appendEvents(events);
    };
    const onError: Parameters<typeof socket.on<'error'>>[1] = (e) => {
      if (isError(e)) setError(e.message);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.on('lobby.state', onLobby);
    socket.on('game.state', onGameState);
    socket.on('game.events', onGameEvents);
    socket.on('error', onError);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.off('lobby.state', onLobby);
      socket.off('game.state', onGameState);
      socket.off('game.events', onGameEvents);
      socket.off('error', onError);
    };
  }, [playerId, setLobby, setGame, appendEvents, setStatus, setError]);

  return null;
}

function ErrorToast() {
  const error = useApp((s) => s.lastError);
  const setError = useApp((s) => s.setError);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, setError]);
  if (!error) return null;
  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="rounded-lg border border-red-700 bg-red-950/80 px-4 py-2 text-sm text-red-100">
        {error}
      </div>
    </div>
  );
}

function ConnectionPill() {
  const status = useApp((s) => s.connectionStatus);
  const color =
    status === 'connected'
      ? 'border-green-700 text-green-300'
      : status === 'connecting' || status === 'reconnecting'
        ? 'border-amber-700 text-amber-300'
        : 'border-red-700 text-red-300';
  return (
    <div
      className={`fixed bottom-3 right-3 rounded-full border bg-neutral-950/80 px-3 py-1 text-[11px] uppercase tracking-wider ${color}`}
    >
      {status}
    </div>
  );
}
