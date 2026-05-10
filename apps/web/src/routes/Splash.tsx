import { trpc } from '../lib/trpc.js';

// Bootstrap landing page. Replace with the real lobby once routing lands.
// Touch-first by design: every affordance is a tap target ≥ 44×44 with
// no hover-only state.
export function Splash() {
  const health = trpc.health.useQuery();

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Prophecy</h1>
      <p className="max-w-md text-balance text-neutral-400">
        Original dice-and-card dueling game. Bootstrap is up. The lobby, deckbuilder, and live
        match come next.
      </p>
      <div
        role="status"
        aria-live="polite"
        className="rounded-full border border-neutral-800 bg-neutral-900/60 px-4 py-2 text-sm text-neutral-300"
      >
        {health.isLoading && 'Connecting to api…'}
        {health.isError && 'API unreachable.'}
        {health.data && `API: ${health.data.service} ok`}
      </div>
    </main>
  );
}
