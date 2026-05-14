// Admin / Cards tab — list every card in the catalog on the left,
// edit the selected card on the right. Save writes the entire cards.json
// via PUT (small dataset; full-replace is fine).

import {
  CARD_TYPES,
  type AttributeCatalog,
  type Card,
  type Ability,
  type DieFace,
} from '@prophecy/protocol';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { AbilityBuilder } from './AbilityBuilder.js';
import { DiceEditor, defaultDiceFaces } from './DiceEditor.js';
import { saveCards, uploadCardArt } from './api.js';

type SixFaces = [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];

const TYPE_BADGE: Record<Card['type'], string> = {
  character:  'bg-amber-700',
  upgrade:    'bg-blue-700',
  support:    'bg-teal-700',
  event:      'bg-purple-700',
  plot:       'bg-orange-700',
  battlefield:'bg-neutral-600',
};

const TYPE_DEFAULTS: Record<Card['type'], Partial<Card>> = {
  character: { cost: null, health: 8, pointValue: 10, elitePointValue: 14, plotPointValue: null },
  upgrade: { cost: 2, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  support: { cost: 2, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  event: { cost: 1, health: null, pointValue: null, elitePointValue: null, plotPointValue: null },
  plot: { cost: null, health: null, pointValue: null, elitePointValue: null, plotPointValue: 0 },
  // Battlefields don't have a color — null it on type-switch so we
  // don't carry a stale value forward through the form.
  battlefield: {
    cost: null,
    health: null,
    pointValue: null,
    elitePointValue: null,
    plotPointValue: null,
    color: null,
  },
};

function newCard(): Card {
  return {
    id: `CARD_${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    name: 'New Card',
    type: 'event',
    subtypes: [],
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
    artUrl: null,
    artFrameX: null,
    artFrameY: null,
    artFrameZoom: null,
    cardFrameX: null,
    cardFrameY: null,
    cardFrameZoom: null,
    badgeFrameX: null,
    badgeFrameY: null,
    badgeFrameZoom: null,
  };
}

interface CardTab {
  key: string;
  selectedId: string | null; // null = unsaved new card
  draft: Card;
  savedAt: number | null;
}

export function CardsTab({
  cards,
  attributes,
  onReload,
}: {
  cards: readonly Card[];
  attributes: AttributeCatalog;
  onReload: () => void;
}) {
  const [tabs, setTabs] = useState<CardTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(CARD_TYPES));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOriginalTabs, setDragOriginalTabs] = useState<CardTab[] | null>(null);
  const lastDragOverKey = useRef<string | null>(null);

  const activeTab = tabs.find((t) => t.key === activeTabKey) ?? null;
  const draft = activeTab?.draft ?? null;
  const selectedId = activeTab?.selectedId ?? null;

  // IDs open in any tab (for accordion highlights).
  const openIds = new Set(tabs.map((t) => t.selectedId).filter(Boolean) as string[]);

  useEffect(() => {
    if (!newMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [newMenuOpen]);

  const toggleGroup = (type: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });

  const filtered = cards.filter((c) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q);
  });

  const grouped = CARD_TYPES.map((type) => ({
    type,
    cards: filtered.filter((c) => c.type === type),
  })).filter((g) => g.cards.length > 0);

  const isExpanded = (type: string) => !!filter || !collapsed.has(type);

  const openTab = (id: string) => {
    const existing = tabs.find((t) => t.selectedId === id);
    if (existing) { setActiveTabKey(existing.key); return; }
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const tab: CardTab = { key: id, selectedId: id, draft: structuredClone(card), savedAt: null };
    setTabs((prev) => [...prev, tab]);
    setActiveTabKey(id);
  };

  const startNew = (type: Card['type']) => {
    const fresh = { ...newCard(), type, ...TYPE_DEFAULTS[type] };
    const key = `new-${Math.random().toString(36).slice(2, 7)}`;
    const tab: CardTab = { key, selectedId: null, draft: fresh, savedAt: null };
    setTabs((prev) => [...prev, tab]);
    setActiveTabKey(key);
    setNewMenuOpen(false);
  };

  const closeTab = (key: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.key !== key);
      if (key === activeTabKey) {
        const idx = prev.findIndex((t) => t.key === key);
        setActiveTabKey(next[Math.max(0, idx - 1)]?.key ?? null);
      }
      return next;
    });
  };

  const updateDraft = (patch: Partial<Card>) => {
    if (!activeTabKey) return;
    setTabs((prev) => prev.map((t) => t.key === activeTabKey ? { ...t, draft: { ...t.draft, ...patch } } : t));
  };

  const saveCurrent = async () => {
    if (!draft || !activeTabKey) return;
    setSaving(true);
    try {
      let next: Card[];
      if (selectedId === null) {
        if (cards.some((c) => c.id === draft.id)) throw new Error(`card id "${draft.id}" already exists`);
        next = [...cards, draft];
      } else {
        next = cards.map((c) => (c.id === selectedId ? draft : c));
      }
      await saveCards(next);
      // Promote tab key to the saved card id.
      setTabs((prev) => prev.map((t) =>
        t.key === activeTabKey ? { ...t, key: draft.id, selectedId: draft.id, savedAt: Date.now() } : t,
      ));
      setActiveTabKey(draft.id);
      onReload();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedId || !activeTabKey) return;
    if (!confirm(`Delete ${selectedId}? This removes it from any deck that references it.`)) return;
    setSaving(true);
    try {
      await saveCards(cards.filter((c) => c.id !== selectedId));
      closeTab(activeTabKey);
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
            className="min-h-[36px] flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm"
          />
          <div ref={newMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setNewMenuOpen((o) => !o)}
              className="min-h-[36px] rounded-lg border border-emerald-700 bg-emerald-900 px-3 py-1 text-sm text-emerald-50 hover:bg-emerald-800"
            >
              + New
            </button>
            {newMenuOpen && (
              <ul className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                {CARD_TYPES.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      onClick={() => startNew(t)}
                      className="w-full px-3 py-2 text-left text-sm capitalize text-neutral-200 hover:bg-neutral-800"
                    >
                      {t}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="text-xs uppercase tracking-wider text-neutral-500">
          {filtered.length} / {cards.length}
        </div>
        <div className="mt-2 max-h-[70vh] overflow-y-auto space-y-1">
          {grouped.map(({ type, cards: group }) => {
            const expanded = isExpanded(type);
            return (
              <div key={type}>
                <button
                  type="button"
                  onClick={() => toggleGroup(type)}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left hover:bg-neutral-800/60"
                >
                  <span className="text-xs text-neutral-500 transition-transform" style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                  <span className="flex-1 text-sm font-semibold capitalize text-neutral-300">{type}</span>
                  <span className="text-xs text-neutral-600">{group.length}</span>
                </button>
                {expanded && (
                  <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-neutral-800 pl-2">
                    {group.map((c) => {
                      const isActive = c.id === selectedId;
                      const isOpen = openIds.has(c.id) && !isActive;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => openTab(c.id)}
                            className={`flex min-h-[44px] w-full items-center gap-2 rounded border px-2 py-1 text-left text-sm ${
                              isActive
                                ? 'border-emerald-600 bg-emerald-950/40 text-emerald-100'
                                : isOpen
                                  ? 'border-neutral-600 bg-neutral-800/60 text-neutral-300'
                                  : 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-neutral-600'
                            }`}
                          >
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
                              {c.artUrl ? (
                                <img
                                  src={c.artUrl}
                                  alt=""
                                  aria-hidden
                                  style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    objectPosition: `${c.artFrameX ?? 50}% ${c.artFrameY ?? 50}%`,
                                    transform: (c.artFrameZoom ?? 1) > 1 ? `scale(${c.artFrameZoom})` : undefined,
                                    transformOrigin: `${c.artFrameX ?? 50}% ${c.artFrameY ?? 50}%`,
                                  }}
                                />
                              ) : (
                                <div className="h-full w-full bg-neutral-800" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium leading-tight">{c.name}</div>
                              <div className="font-mono text-xs text-neutral-500">{c.id}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-xl border border-neutral-800 bg-neutral-950/40">
        {/* ── Tab bar ─────────────────────────────────────────── */}
        {tabs.length > 0 && (
          <div
            className="flex items-end gap-0.5 overflow-x-auto border-b border-neutral-800 px-2 pt-2 shrink-0"
            onDragOver={(e) => {
              e.preventDefault();
              const els = e.currentTarget.querySelectorAll<HTMLElement>('[data-tabkey]');
              let nearestKey: string | null = null;
              let nearestDist = Infinity;
              els.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const dist = Math.abs(e.clientX - (rect.left + rect.width / 2));
                if (dist < nearestDist) { nearestDist = dist; nearestKey = el.dataset.tabkey ?? null; }
              });
              // Only reorder when the nearest tab actually changes.
              if (nearestKey && nearestKey !== lastDragOverKey.current) {
                lastDragOverKey.current = nearestKey;
                if (dragKey && nearestKey !== dragKey) {
                  setTabs((prev) => {
                    const next = [...prev];
                    const from = next.findIndex((t) => t.key === dragKey);
                    const to = next.findIndex((t) => t.key === nearestKey);
                    if (from !== -1 && to !== -1) next.splice(to, 0, next.splice(from, 1)[0]!);
                    return next;
                  });
                }
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              // Order is already correct from live reordering — just clear state.
              setDragKey(null);
              setDragOriginalTabs(null);
              lastDragOverKey.current = null;
            }}
          >
            {tabs.map((tab) => {
              const isActive = tab.key === activeTabKey;
              const isDragging = tab.key === dragKey;
              return (
                <motion.div
                  key={tab.key}
                  layout
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  data-tabkey={tab.key}
                  draggable
                  onDragStart={(e) => {
                    setDragKey(tab.key);
                    setActiveTabKey(tab.key);
                    setDragOriginalTabs([...tabs]);
                    lastDragOverKey.current = null;
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    // Restore original order if dropped outside (cancelled).
                    if (dragOriginalTabs) setTabs(dragOriginalTabs);
                    setDragKey(null);
                    setDragOriginalTabs(null);
                    lastDragOverKey.current = null;
                  }}
                  className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-1.5 text-sm transition select-none ${
                    isActive
                      ? 'border-neutral-700 bg-neutral-950/80 text-neutral-100'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  } ${isDragging ? 'opacity-40' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveTabKey(tab.key)}
                    className="flex cursor-grab flex-col items-start text-left active:cursor-grabbing"
                  >
                    <span className="max-w-[140px] truncate leading-tight">{tab.draft.name || 'New Card'}</span>
                    <span className={`mt-1.5 rounded px-1.5 py-0 text-[11px] font-medium capitalize text-white ${TYPE_BADGE[tab.draft.type]}`}>
                      {tab.draft.type}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(tab.key)}
                    className="ml-0.5 text-neutral-600 hover:text-red-400"
                    aria-label="Close tab"
                  >
                    ×
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Form area ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4">
        {!draft ? (
          <div className="text-base text-neutral-500">
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
            {/* ── Identity ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Name" wide>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                />
              </Field>
              <Field label="Id">
                <input
                  type="text"
                  value={draft.id}
                  onChange={(e) => updateDraft({ id: e.target.value })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                  disabled={selectedId !== null}
                />
              </Field>
            </div>

            {/* ── Art + compact frames ──────────────────────────── */}
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <ArtUploader
                  cardId={draft.id}
                  artUrl={draft.artUrl ?? null}
                  onUploaded={(artUrl) => updateDraft({ artUrl })}
                />
                {draft.artUrl && (
                  <button
                    type="button"
                    onClick={() => updateDraft({ artUrl: null })}
                    className="text-center text-sm text-neutral-600 hover:text-red-400"
                  >
                    Remove image
                  </button>
                )}
              </div>

              {draft.artUrl && (
                <div className="flex flex-wrap gap-4">
                  <FrameEditor compact shape="square" artUrl={draft.artUrl}
                    frameX={draft.artFrameX ?? null} frameY={draft.artFrameY ?? null} frameZoom={draft.artFrameZoom ?? null}
                    onChange={(x, y, zoom) => updateDraft({ artFrameX: x, artFrameY: y, artFrameZoom: zoom })}
                  />
                  <FrameEditor compact shape="portrait" artUrl={draft.artUrl}
                    frameX={draft.cardFrameX ?? null} frameY={draft.cardFrameY ?? null} frameZoom={draft.cardFrameZoom ?? null}
                    onChange={(x, y, zoom) => updateDraft({ cardFrameX: x, cardFrameY: y, cardFrameZoom: zoom })}
                  />
                  <FrameEditor compact shape="circle" artUrl={draft.artUrl}
                    frameX={draft.badgeFrameX ?? null} frameY={draft.badgeFrameY ?? null} frameZoom={draft.badgeFrameZoom ?? null}
                    onChange={(x, y, zoom) => updateDraft({ badgeFrameX: x, badgeFrameY: y, badgeFrameZoom: zoom })}
                  />
                </div>
              )}
            </div>

            {/* ── Classification ────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Faction">
                <select
                  value={draft.faction}
                  onChange={(e) => updateDraft({ faction: e.target.value as Card['faction'] })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                >
                  {attributes.factions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Field>
              {draft.type !== 'battlefield' && (
                <Field label="Color">
                  <select
                    value={draft.color ?? ''}
                    onChange={(e) => updateDraft({ color: (e.target.value || null) as Card['color'] })}
                    className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    {attributes.colors.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Rarity">
                <select
                  value={draft.rarity}
                  onChange={(e) => updateDraft({ rarity: e.target.value as Card['rarity'] })}
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                >
                  {attributes.rarities.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <SubtypePicker
                selected={draft.subtypes ?? []}
                options={attributes.subtypes}
                onChange={(subtypes) => updateDraft({ subtypes })}
              />
            </div>

            {/* ── Stats ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Cost">
                <NullableNumber value={draft.cost} min={0} max={20} onChange={(cost) => updateDraft({ cost })} />
              </Field>
              <Field label="Health">
                <NullableNumber value={draft.health} min={1} max={99} onChange={(health) => updateDraft({ health })} />
              </Field>
              <Field label="Point value">
                <NullableNumber value={draft.pointValue} min={1} max={99} onChange={(pointValue) => updateDraft({ pointValue })} />
              </Field>
              <Field label="Elite point value">
                <NullableNumber value={draft.elitePointValue} min={1} max={99} onChange={(elitePointValue) => updateDraft({ elitePointValue })} />
              </Field>
              <Field label="Plot point value">
                <NullableNumber value={draft.plotPointValue} min={-5} max={5} onChange={(plotPointValue) => updateDraft({ plotPointValue })} />
              </Field>
              <label className="flex min-h-[60px] items-center gap-2 self-end text-sm text-neutral-300">
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
                className="min-h-[80px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
              />
            </Field>

            <div>
              <div className="mb-2 text-sm uppercase tracking-wider text-neutral-500">
                Abilities
              </div>
              <AbilityBuilder
                abilities={draft.abilities}
                onChange={(abilities: Ability[]) => updateDraft({ abilities })}
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm uppercase tracking-wider text-neutral-300">
                <input
                  type="checkbox"
                  checked={draft.dieFaces !== null}
                  onChange={(e) =>
                    updateDraft({
                      dieFaces: e.target.checked ? defaultDiceFaces() : null,
                    })
                  }
                />
                <span>Has dice</span>
              </label>
              {draft.dieFaces && (
                <DiceEditor
                  faces={draft.dieFaces}
                  onChange={(dieFaces: SixFaces) => updateDraft({ dieFaces })}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg border border-emerald-700 bg-emerald-900 px-4 py-2 text-base text-emerald-50 hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : selectedId === null ? 'Create card' : 'Save changes'}
              </button>
              {selectedId !== null && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-base text-red-200 hover:border-red-700"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!selectedId || !activeTabKey) return;
                  const original = cards.find((c) => c.id === selectedId);
                  if (original) setTabs((prev) => prev.map((t) => t.key === activeTabKey ? { ...t, draft: structuredClone(original), savedAt: null } : t));
                }}
                disabled={saving || selectedId === null}
                className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-base hover:border-neutral-500 disabled:opacity-50"
              >
                Revert
              </button>
              {activeTab?.savedAt && (
                <span className="self-center text-sm text-emerald-400">
                  Saved {new Date(activeTab.savedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </form>
        )}
        </div>
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
    <label className={`flex flex-col text-sm text-neutral-400 ${wide ? 'col-span-2' : ''}`}>
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
        className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
      />
    </div>
  );
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

function ArtUploader({
  cardId,
  artUrl,
  onUploaded,
}: {
  cardId: string;
  artUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setError('Only JPEG, PNG, or WebP files are accepted.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadCardArt(cardId, file);
      onUploaded(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="col-span-full">
      <div className="mb-1 text-sm text-neutral-400">Card art</div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={`relative aspect-square w-[160px] cursor-pointer overflow-hidden rounded-lg border-2 border-dashed transition ${
          dragOver
            ? 'border-emerald-500 bg-emerald-950/20'
            : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'
        }`}
      >
        {artUrl ? (
          <>
            <img
              src={artUrl}
              alt="Card art preview"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition">
              <span className="text-sm text-white">Click or drop to replace</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-neutral-500">
            <span className="text-2xl">🖼</span>
            <span className="text-sm">{uploading ? 'Uploading…' : 'Drop art here or click to browse'}</span>
            <span className="text-xs text-neutral-600">JPEG · PNG · WebP · up to 20 MB · converted to WebP 1024 × 1024</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-sm text-neutral-300">Uploading…</span>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ─── Frame editor (square / portrait / circle) ────────────────────────────────

type FrameShape = 'square' | 'portrait' | 'circle';

const FRAME_CONFIGS: Record<FrameShape, { label: string; w: number; h: number; cw: number; ch: number; radius: string; hint: string }> = {
  square:   { label: 'Square',   w: 220, h: 220, cw: 160, ch: 160, radius: 'rounded-lg',   hint: 'Battle zone character cards' },
  portrait: { label: 'Portrait', w: 157, h: 220, cw: 114, ch: 160, radius: 'rounded-lg',   hint: 'Hand overlay & detail views' },
  circle:   { label: 'Circle',   w: 120, h: 120, cw: 160, ch: 160, radius: 'rounded-full', hint: 'Upgrade badges' },
};

function FrameEditor({
  shape,
  artUrl,
  frameX,
  frameY,
  frameZoom,
  onChange,
  compact = false,
}: {
  shape: FrameShape;
  artUrl: string;
  frameX: number | null;
  frameY: number | null;
  frameZoom: number | null;
  onChange: (x: number, y: number, zoom: number) => void;
  compact?: boolean;
}) {
  const x = frameX ?? 50;
  const y = frameY ?? 50;
  const zoom = frameZoom ?? 1;
  const snap = useRef({ x, y, zoom });
  snap.current = { x, y, zoom };
  const cfg = FRAME_CONFIGS[shape];

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (me: MouseEvent) => {
      const { x: cx, y: cy, zoom: cz } = snap.current;
      const s = 100 / (cfg.w * cz);
      onChange(Math.max(0, Math.min(100, cx - me.movementX * s)), Math.max(0, Math.min(100, cy - me.movementY * s)), cz);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; if (t) lastTouch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    if (!t || !lastTouch.current) return;
    const { x: cx, y: cy, zoom: cz } = snap.current;
    const s = 100 / (cfg.w * cz);
    onChange(Math.max(0, Math.min(100, cx - (t.clientX - lastTouch.current.x) * s)), Math.max(0, Math.min(100, cy - (t.clientY - lastTouch.current.y) * s)), cz);
    lastTouch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = () => { lastTouch.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { x: cx, y: cy, zoom: cz } = snap.current;
    onChange(cx, cy, Math.max(1, Math.min(4, Math.round((cz + (e.deltaY < 0 ? 0.1 : -0.1)) * 10) / 10)));
  };

  const pw = compact ? cfg.cw : cfg.w;
  const ph = compact ? cfg.ch : cfg.h;

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-neutral-500">{cfg.label}</span>
        <div
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          style={{ width: pw, height: ph, touchAction: 'none' }}
          className={`relative shrink-0 cursor-grab overflow-hidden border border-neutral-600 active:cursor-grabbing ${cfg.radius}`}
        >
          <img src={artUrl} alt="" aria-hidden draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x}% ${y}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: `${x}% ${y}%`, pointerEvents: 'none', userSelect: 'none' }} />
        </div>
        <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => onChange(x, y, Number(e.target.value))} className="w-20 accent-emerald-500" title={`Zoom ${zoom.toFixed(1)}×`} />
        <button type="button" onClick={() => onChange(50, 50, 1)} className="text-xs text-neutral-600 hover:text-neutral-300">Reset</button>
      </div>
    );
  }

  return (
    <div className="col-span-full">
      <div className="mb-1 text-sm text-neutral-400">{cfg.label}</div>
      <div className="mb-2 text-xs text-neutral-600">{cfg.hint} · drag to reposition, scroll or slider to zoom</div>
      <div className="flex flex-wrap items-center gap-6">
        <div
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onWheel={onWheel}
          style={{ width: pw, height: ph, touchAction: 'none' }}
          className={`relative shrink-0 cursor-grab overflow-hidden border border-neutral-500 active:cursor-grabbing ${cfg.radius}`}
        >
          <img src={artUrl} alt="" aria-hidden draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x}% ${y}%`, transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: `${x}% ${y}%`, pointerEvents: 'none', userSelect: 'none' }} />
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-neutral-400">
            <span>Zoom — {zoom.toFixed(1)}×</span>
            <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => onChange(x, y, Number(e.target.value))} className="w-36 accent-emerald-500" />
          </label>
          <button type="button" onClick={() => onChange(50, 50, 1)} className="w-fit rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm hover:border-neutral-500">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subtype multi-select picker ──────────────────────────────────────────────

function SubtypePicker({
  selected,
  options,
  onChange,
}: {
  selected: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const available = options.filter(
    (o) => !selected.includes(o) && (!search || o.toLowerCase().includes(search.toLowerCase())),
  );

  const add = (val: string) => {
    onChange([...selected, val]);
    setSearch('');
  };

  const remove = (val: string) => onChange(selected.filter((s) => s !== val));

  return (
    <div className="col-span-full flex flex-col gap-1 text-sm text-neutral-400">
      <span>Subtypes</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((s) => (
          <span key={s} className="flex items-center gap-1 rounded border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-sm text-emerald-100">
            {s}
            <button type="button" onClick={() => remove(s)} className="text-emerald-500 hover:text-red-400" aria-label={`Remove ${s}`}>×</button>
          </span>
        ))}

        <div ref={containerRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            disabled={options.length === 0}
            className="min-h-[28px] rounded border border-dashed border-neutral-600 px-2 py-0.5 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-200 disabled:opacity-40"
          >
            + Subtype
          </button>

          {open && (
            <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
              <div className="p-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none"
                />
              </div>
              <ul className="max-h-48 overflow-y-auto pb-1">
                {available.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-neutral-600">
                    {search ? 'No matches' : 'All subtypes selected'}
                  </li>
                ) : (
                  available.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => add(s)}
                        className="w-full px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                      >
                        {s}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {options.length === 0 && (
          <span className="text-xs text-neutral-600">Add subtypes in the Attributes tab first.</span>
        )}
      </div>
    </div>
  );
}
