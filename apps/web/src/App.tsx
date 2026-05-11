import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isError } from '@prophecy/protocol';
import { useEffect, useState } from 'react';

import { ErrorBoundary } from './lib/ErrorBoundary.js';
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

  if (game) return <Game />;
  if (lobby) return <Lobby />;
  return <Splash />;
}

function SocketBridge() {
  const setLobby = useApp((s) => s.setLobby);
  const setGame = useApp((s) => s.setGame);
  const appendEvents = useApp((s) => s.appendEvents);
  const setStatus = useApp((s) => s.setConnectionStatus);
  const setError = useApp((s) => s.setError);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setStatus('connected');
    const onDisconnect = () => setStatus('disconnected');
    const onLobby = (state: Parameters<Parameters<typeof socket.on<'lobby.state'>>[1]>[0]) => {
      setLobby(state);
      if (state.phase === 'ended') setGame(null);
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
    socket.on('lobby.state', onLobby);
    socket.on('game.state', onGameState);
    socket.on('game.events', onGameEvents);
    socket.on('error', onError);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby.state', onLobby);
      socket.off('game.state', onGameState);
      socket.off('game.events', onGameEvents);
      socket.off('error', onError);
    };
  }, [setLobby, setGame, appendEvents, setStatus, setError]);

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
      : status === 'connecting'
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
