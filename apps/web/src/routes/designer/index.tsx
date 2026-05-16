// Designer shell — three tabs (Cards / Decks / Attributes). Loads all
// catalogs once on mount; each tab calls `reload()` after a save.

import type { AttributeCatalog, Card, Deck } from '@prophecy/protocol';
import { useEffect, useState } from 'react';

import { AttributesTab } from './AttributesTab.js';
import { CardsTab } from './CardsTab.js';
import { DecksTab } from './DecksTab.js';
import { PendingPanel } from './PendingPanel.js';
import { fetchAttributes, fetchCards, fetchCommitted, fetchDecks } from './api.js';

type Tab = 'cards' | 'decks' | 'attributes';

export function Designer() {
  const [tab, setTab] = useState<Tab>(() => {
    const p = window.location.pathname;
    if (p.endsWith('/decks')) return 'decks';
    if (p.endsWith('/attributes')) return 'attributes';
    return 'cards';
  });
  const [cards, setCards] = useState<readonly Card[] | null>(null);
  const [decks, setDecks] = useState<readonly Deck[] | null>(null);
  const [attributes, setAttributes] = useState<AttributeCatalog | null>(null);
  const [committedCards, setCommittedCards] = useState<readonly Card[] | null>(null);
  const [committedDecks, setCommittedDecks] = useState<readonly Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [c, d, a, committed] = await Promise.all([
        fetchCards(),
        fetchDecks(),
        fetchAttributes(),
        fetchCommitted().catch(() => null),
      ]);
      setCards(c);
      setDecks(d);
      setAttributes(a);
      if (committed?.enabled) {
        setCommittedCards(committed.cards);
        setCommittedDecks(committed.decks);
      }
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
    const path = next === 'cards' ? '/designer/cards' : next === 'decks' ? '/designer/decks' : '/designer/attributes';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  };

  return (
    <>
    <main className="min-h-dvh bg-neutral-950 px-4 py-6 pb-16 sm:px-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-100">Prophecy Designer</h1>
        <a
          href="/"
          className="min-h-[36px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-300 hover:border-neutral-500"
        >
          ← back to game
        </a>
      </header>

      <nav className="mb-4 flex gap-2 border-b border-neutral-800 pb-2">
        <TabButton active={tab === 'cards'} onClick={() => setTabAndUrl('cards')}>Cards</TabButton>
        <TabButton active={tab === 'decks'} onClick={() => setTabAndUrl('decks')}>Decks</TabButton>
        <TabButton active={tab === 'attributes'} onClick={() => setTabAndUrl('attributes')}>Attributes</TabButton>
      </nav>

      {error && (
        <div className="mb-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-base text-red-200">
          {error}
        </div>
      )}

      {cards === null || decks === null || attributes === null ? (
        <div className="text-base text-neutral-500">Loading catalog…</div>
      ) : tab === 'cards' ? (
        <CardsTab cards={cards} attributes={attributes} committedCards={committedCards ?? undefined} onReload={reload} />
      ) : tab === 'decks' ? (
        <DecksTab cards={cards} decks={decks} committedDecks={committedDecks ?? undefined} onReload={reload} />
      ) : (
        <AttributesTab attributes={attributes} onReload={reload} />
      )}
    </main>
    <PendingPanel onCommitSuccess={reload} />
    </>
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
      className={`min-h-[44px] rounded-t-lg border-b-2 px-4 py-2 text-base ${
        active
          ? 'border-emerald-500 text-emerald-100'
          : 'border-transparent text-neutral-400 hover:text-neutral-200'
      }`}
    >
      {children}
    </button>
  );
}
