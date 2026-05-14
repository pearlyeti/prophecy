// Designer shell — two tabs (Cards / Decks) on a single page. Loads the
// catalog once on mount; each tab can call `reload()` after a save so
// the list reflects the latest server state. No URL routing inside
// /designer in v1; tab state is local.

import type { Card, Deck } from '@prophecy/protocol';
import { useEffect, useState } from 'react';

import { CardsTab } from './CardsTab.js';
import { DecksTab } from './DecksTab.js';
import { fetchCards, fetchDecks } from './api.js';

type Tab = 'cards' | 'decks';

export function Designer() {
  const [tab, setTab] = useState<Tab>(() =>
    window.location.pathname.endsWith('/decks') ? 'decks' : 'cards',
  );
  const [cards, setCards] = useState<readonly Card[] | null>(null);
  const [decks, setDecks] = useState<readonly Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [c, d] = await Promise.all([fetchCards(), fetchDecks()]);
      setCards(c);
      setDecks(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    document.title = 'Prophecy Designer';
    return () => { document.title = 'Prophecy'; };
  }, []);

  useEffect(() => {
    void reload();
  }, []);

  const setTabAndUrl = (next: Tab) => {
    setTab(next);
    const path = next === 'cards' ? '/designer/cards' : '/designer/decks';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  };

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-100">Prophecy Designer</h1>
        <a
          href="/"
          className="min-h-[36px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-500"
        >
          ← back to game
        </a>
      </header>

      <nav className="mb-4 flex gap-2 border-b border-neutral-800 pb-2">
        <TabButton active={tab === 'cards'} onClick={() => setTabAndUrl('cards')}>
          Cards
        </TabButton>
        <TabButton active={tab === 'decks'} onClick={() => setTabAndUrl('decks')}>
          Decks
        </TabButton>
      </nav>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {cards === null || decks === null ? (
        <div className="text-sm text-neutral-500">Loading catalog…</div>
      ) : tab === 'cards' ? (
        <CardsTab cards={cards} onReload={reload} />
      ) : (
        <DecksTab cards={cards} decks={decks} onReload={reload} />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-t-lg border-b-2 px-4 py-2 text-sm ${
        active
          ? 'border-emerald-500 text-emerald-100'
          : 'border-transparent text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}
