// Admin / Decks tab — list every deck on the left, edit the selected
// deck on the right. Card-picker dropdowns filter by type so the
// "Battlefield" field only offers battlefield cards, etc. Deck-build
// rule enforcement (color / faction / 30-card / 2-copy) is intentionally
// out of scope for v1; the user validates manually.

import { FACTIONS, type Card, type Deck, type DeckCard } from '@prophecy/protocol';
import { useMemo, useState } from 'react';

import { saveDecks } from './api.js';

function newDeck(): Deck {
  return {
    id: `DECK_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: 'New Deck',
    description: '',
    faction: 'neutral',
    characters: [],
    battlefieldCardId: null,
    plotCardId: null,
    cards: [],
  };
}

export function DecksTab({
  decks,
  cards,
  onReload,
}: {
  decks: readonly Deck[];
  cards: readonly Card[];
  onReload: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Deck | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const characterOptions = useMemo(
    () => cards.filter((c) => c.type === 'character'),
    [cards],
  );
  const battlefieldOptions = useMemo(
    () => cards.filter((c) => c.type === 'battlefield'),
    [cards],
  );
  const plotOptions = useMemo(
    () => cards.filter((c) => c.type === 'plot'),
    [cards],
  );
  const deckCardOptions = useMemo(
    () => cards.filter((c) => ['event', 'upgrade', 'support'].includes(c.type)),
    [cards],
  );

  const select = (id: string | null) => {
    setSelectedId(id);
    setDraft(id ? structuredClone(decks.find((d) => d.id === id) ?? null) : null);
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft(newDeck());
  };

  const updateDraft = (patch: Partial<Deck>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  };

  const saveCurrent = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      let next: Deck[];
      if (selectedId === null) {
        if (decks.some((d) => d.id === draft.id)) {
          throw new Error(`deck id "${draft.id}" already exists`);
        }
        next = [...decks, draft];
      } else {
        next = decks.map((d) => (d.id === selectedId ? draft : d));
      }
      await saveDecks(next);
      setSelectedId(draft.id);
      setSavedAt(Date.now());
      onReload();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedId === null) return;
    if (!confirm(`Delete deck ${selectedId}?`)) return;
    setSaving(true);
    try {
      await saveDecks(decks.filter((d) => d.id !== selectedId));
      setSelectedId(null);
      setDraft(null);
      onReload();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const totalCardCount = (draft?.cards ?? []).reduce((s, c) => s + c.count, 0);

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            {decks.length} deck{decks.length === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={startNew}
            className="ml-auto min-h-[36px] rounded-lg border border-emerald-700 bg-emerald-900 px-3 py-1 text-xs text-emerald-50 hover:bg-emerald-800"
          >
            + New
          </button>
        </div>
        <ul className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto">
          {decks.map((d) => {
            const isSelected = d.id === selectedId;
            const cardTotal = d.cards.reduce((s, c) => s + c.count, 0);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => select(d.id)}
                  className={`min-h-[44px] w-full rounded border px-2 py-1 text-left text-xs ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                      : 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.name}</span>
                    <span className="font-mono text-[10px] text-neutral-500">{d.id}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {d.faction} · {d.characters.length} char · {cardTotal} cards
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        {!draft ? (
          <div className="text-sm text-neutral-500">
            Select a deck on the left, or click <span className="text-emerald-300">+ New</span>.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveCurrent();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col text-[11px] text-neutral-400">
                <span>Id</span>
                <input
                  type="text"
                  value={draft.id}
                  onChange={(e) => updateDraft({ id: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                  disabled={selectedId !== null}
                />
              </label>
              <label className="flex flex-col text-[11px] text-neutral-400 sm:col-span-2">
                <span>Name</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                />
              </label>
              <label className="flex flex-col text-[11px] text-neutral-400">
                <span>Faction</span>
                <select
                  value={draft.faction}
                  onChange={(e) => updateDraft({ faction: e.target.value as Deck['faction'] })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  {FACTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] text-neutral-400">
                <span>Battlefield</span>
                <select
                  value={draft.battlefieldCardId ?? ''}
                  onChange={(e) =>
                    updateDraft({ battlefieldCardId: e.target.value || null })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  <option value="">(none)</option>
                  {battlefieldOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-[11px] text-neutral-400">
                <span>Plot</span>
                <select
                  value={draft.plotCardId ?? ''}
                  onChange={(e) =>
                    updateDraft({ plotCardId: e.target.value || null })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  <option value="">(none)</option>
                  {plotOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col text-[11px] text-neutral-400">
              <span>Description</span>
              <textarea
                value={draft.description}
                rows={2}
                onChange={(e) => updateDraft({ description: e.target.value })}
                className="min-h-[60px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Characters ({draft.characters.length})
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft({
                      characters: [
                        ...draft.characters,
                        {
                          cardId: characterOptions[0]?.id ?? '',
                          elite: false,
                        },
                      ],
                    })
                  }
                  className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 text-xs hover:border-neutral-500"
                >
                  + Add character
                </button>
              </div>
              <div className="space-y-2">
                {draft.characters.map((ch, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 p-2"
                  >
                    <select
                      value={ch.cardId}
                      onChange={(e) => {
                        const next = draft.characters.slice();
                        next[idx] = { ...ch, cardId: e.target.value };
                        updateDraft({ characters: next });
                      }}
                      className="min-h-[36px] min-w-[200px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                    >
                      {characterOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                      <input
                        type="checkbox"
                        checked={ch.elite}
                        onChange={(e) => {
                          const next = draft.characters.slice();
                          next[idx] = { ...ch, elite: e.target.checked };
                          updateDraft({ characters: next });
                        }}
                      />
                      <span>Elite</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({
                          characters: draft.characters.filter((_, i) => i !== idx),
                        })
                      }
                      className="min-h-[36px] rounded border border-neutral-800 px-2 text-xs text-neutral-500 hover:border-red-700 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Deck cards ({totalCardCount} total · {draft.cards.length} entries)
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateDraft({
                      cards: [
                        ...draft.cards,
                        { cardId: deckCardOptions[0]?.id ?? '', count: 1 },
                      ],
                    })
                  }
                  className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 text-xs hover:border-neutral-500"
                >
                  + Add card slot
                </button>
              </div>
              <div className="space-y-1">
                {draft.cards.map((entry: DeckCard, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 p-2"
                  >
                    <select
                      value={entry.cardId}
                      onChange={(e) => {
                        const next = draft.cards.slice();
                        next[idx] = { ...entry, cardId: e.target.value };
                        updateDraft({ cards: next });
                      }}
                      className="min-h-[36px] min-w-[200px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                    >
                      {deckCardOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id}) · {c.type} · cost {c.cost ?? '—'}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-neutral-400">
                      <span>count</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={entry.count}
                        onChange={(e) => {
                          const count = Number(e.target.value);
                          const next = draft.cards.slice();
                          next[idx] = { ...entry, count };
                          updateDraft({ cards: next });
                        }}
                        className="min-h-[36px] w-16 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                      />
                    </label>
                    <span className="text-[10px] text-neutral-500">
                      {cardsById.get(entry.cardId)?.color ?? '—'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateDraft({
                          cards: draft.cards.filter((_, i) => i !== idx),
                        })
                      }
                      className="min-h-[36px] rounded border border-neutral-800 px-2 text-xs text-neutral-500 hover:border-red-700 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-2 text-sm text-emerald-50 hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : selectedId === null ? 'Create deck' : 'Save changes'}
              </button>
              {selectedId !== null && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-200 hover:border-red-700"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => select(selectedId)}
                disabled={saving || selectedId === null}
                className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:border-neutral-500 disabled:opacity-50"
              >
                Revert
              </button>
              {savedAt && (
                <span className="self-center text-[11px] text-emerald-400">
                  Saved {new Date(savedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
