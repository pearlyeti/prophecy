// Admin / Cards tab — list every card in the catalog on the left,
// edit the selected card on the right. Save writes the entire cards.json
// via PUT (small dataset; full-replace is fine).

import {
  CARD_TYPES,
  COLORS,
  FACTIONS,
  RARITIES,
  type Card,
  type Ability,
} from '@prophecy/protocol';
import { useState } from 'react';

import { AbilityBuilder } from './AbilityBuilder.js';
import { saveCards } from './api.js';

const TYPE_DEFAULTS: Record<Card['type'], Partial<Card>> = {
  character: { cost: null, health: 8, pointValue: 10, elitePointValue: 14, plotPointValue: null },
  upgrade: { cost: 2, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  support: { cost: 2, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  event: { cost: 1, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  plot: { cost: null, health: null, pointValue: null, elitePointValue: null, plotPointValue: 0 },
  battlefield: { cost: null, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
};

function newCard(): Card {
  return {
    id: `CARD_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: 'New Card',
    type: 'event',
    subtype: null,
    faction: 'neutral',
    color: 'gray',
    rarity: 'common',
    cost: 1,
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    isUnique: false,
    keywords: [],
    displayText: '',
    dieFaces: null,
    abilities: [],
  };
}

export function CardsTab({
  cards,
  onReload,
}: {
  cards: readonly Card[];
  onReload: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const filtered = cards.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q)
    );
  });

  const select = (id: string | null) => {
    setSelectedId(id);
    setDraft(id ? structuredClone(cards.find((c) => c.id === id) ?? null) : null);
  };

  const startNew = () => {
    const fresh = newCard();
    setSelectedId(null);
    setDraft(fresh);
  };

  const updateDraft = (patch: Partial<Card>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  };

  const saveCurrent = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      let next: Card[];
      if (selectedId === null) {
        // New card — append. Reject duplicate id.
        if (cards.some((c) => c.id === draft.id)) {
          throw new Error(`card id "${draft.id}" already exists`);
        }
        next = [...cards, draft];
      } else {
        next = cards.map((c) => (c.id === selectedId ? draft : c));
      }
      await saveCards(next);
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
    if (!confirm(`Delete ${selectedId}? This removes it from any deck that references it.`)) {
      return;
    }
    setSaving(true);
    try {
      await saveCards(cards.filter((c) => c.id !== selectedId));
      setSelectedId(null);
      setDraft(null);
      onReload();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
        <div className="mb-2 flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-h-[36px] flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={startNew}
            className="min-h-[36px] rounded-lg border border-emerald-700 bg-emerald-900 px-3 py-1 text-xs text-emerald-50 hover:bg-emerald-800"
          >
            + New
          </button>
        </div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          {filtered.length} / {cards.length}
        </div>
        <ul className="mt-2 max-h-[70vh] space-y-1 overflow-y-auto">
          {filtered.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => select(c.id)}
                  className={`min-h-[44px] w-full rounded border px-2 py-1 text-left text-xs ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                      : 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono text-[10px] text-neutral-500">{c.id}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {c.type} · {c.color} · cost {c.cost ?? '—'}
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
            Select a card on the left, or click <span className="text-emerald-300">+ New</span>.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveCurrent();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Id">
                <input
                  type="text"
                  value={draft.id}
                  onChange={(e) => updateDraft({ id: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                  disabled={selectedId !== null}
                />
              </Field>
              <Field label="Name" wide>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                />
              </Field>
              <Field label="Type">
                <select
                  value={draft.type}
                  onChange={(e) => {
                    const newType = e.target.value as Card['type'];
                    updateDraft({ type: newType, ...TYPE_DEFAULTS[newType] });
                  }}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  {CARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subtype">
                <input
                  type="text"
                  value={draft.subtype ?? ''}
                  onChange={(e) =>
                    updateDraft({ subtype: e.target.value || null })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                />
              </Field>
              <Field label="Faction">
                <select
                  value={draft.faction}
                  onChange={(e) =>
                    updateDraft({ faction: e.target.value as Card['faction'] })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  {FACTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <select
                  value={draft.color}
                  onChange={(e) =>
                    updateDraft({ color: e.target.value as Card['color'] })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  {COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rarity">
                <select
                  value={draft.rarity}
                  onChange={(e) =>
                    updateDraft({ rarity: e.target.value as Card['rarity'] })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                >
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cost">
                <NullableNumber
                  value={draft.cost}
                  min={0}
                  max={20}
                  onChange={(cost) => updateDraft({ cost })}
                />
              </Field>
              <Field label="Health">
                <NullableNumber
                  value={draft.health}
                  min={1}
                  max={99}
                  onChange={(health) => updateDraft({ health })}
                />
              </Field>
              <Field label="Point value">
                <NullableNumber
                  value={draft.pointValue}
                  min={1}
                  max={99}
                  onChange={(pointValue) => updateDraft({ pointValue })}
                />
              </Field>
              <Field label="Elite point value">
                <NullableNumber
                  value={draft.elitePointValue}
                  min={1}
                  max={99}
                  onChange={(elitePointValue) => updateDraft({ elitePointValue })}
                />
              </Field>
              <Field label="Plot point value">
                <NullableNumber
                  value={draft.plotPointValue}
                  min={-5}
                  max={5}
                  onChange={(plotPointValue) => updateDraft({ plotPointValue })}
                />
              </Field>
              <label className="flex min-h-[60px] items-center gap-2 self-end text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={draft.isUnique}
                  onChange={(e) => updateDraft({ isUnique: e.target.checked })}
                />
                <span>Unique</span>
              </label>
            </div>

            <Field label="Display text">
              <textarea
                value={draft.displayText}
                rows={3}
                onChange={(e) => updateDraft({ displayText: e.target.value })}
                className="min-h-[80px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
              />
            </Field>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                Abilities
              </div>
              <AbilityBuilder
                abilities={draft.abilities}
                onChange={(abilities: Ability[]) => updateDraft({ abilities })}
              />
            </div>

            {draft.dieFaces && (
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-neutral-500">
                  Die faces (read-only for now)
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {draft.dieFaces.map((f, i) => (
                    <div
                      key={i}
                      className="rounded border border-neutral-800 bg-neutral-900/60 p-2 text-center"
                    >
                      <div className="font-mono text-base text-neutral-100">
                        {f.modifier ? '+' : ''}
                        {f.value || ''}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                        {f.symbol}
                      </div>
                      {f.cost > 0 && (
                        <div className="text-[10px] text-amber-400">cost {f.cost}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-2 text-sm text-emerald-50 hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : selectedId === null ? 'Create card' : 'Save changes'}
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

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col text-[11px] text-neutral-400 ${wide ? 'col-span-2' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function NullableNumber({
  value,
  min,
  max,
  onChange,
}: {
  value: number | null;
  min: number;
  max: number;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder="—"
        onChange={(e) =>
          onChange(e.target.value === '' ? null : Number(e.target.value))
        }
        className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
      />
    </div>
  );
}
