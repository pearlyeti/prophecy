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
  type DieFace,
} from '@prophecy/protocol';
import { useRef, useState } from 'react';

import { AbilityBuilder } from './AbilityBuilder.js';
import { DiceEditor, defaultDiceFaces } from './DiceEditor.js';
import { saveCards, uploadCardArt } from './api.js';

type SixFaces = [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];

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
    artUrl: null,
    artFrameX: null,
    artFrameY: null,
    artFrameZoom: null,
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
              {draft.type !== 'battlefield' && (
                <Field label="Color">
                  <select
                    value={draft.color ?? ''}
                    onChange={(e) =>
                      updateDraft({
                        color: (e.target.value || null) as Card['color'],
                      })
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
              )}
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

            <ArtUploader
              cardId={draft.id}
              artUrl={draft.artUrl ?? null}
              onUploaded={(artUrl) => updateDraft({ artUrl })}
            />

            {draft.type === 'upgrade' && draft.artUrl && (
              <BadgeFrameEditor
                artUrl={draft.artUrl}
                frameX={draft.artFrameX ?? null}
                frameY={draft.artFrameY ?? null}
                frameZoom={draft.artFrameZoom ?? null}
                onChange={(x, y, zoom) =>
                  updateDraft({ artFrameX: x, artFrameY: y, artFrameZoom: zoom })
                }
              />
            )}

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

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-300">
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
      <div className="mb-1 text-[11px] text-neutral-400">Card art</div>
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
        className={`relative flex min-h-[120px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition ${
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
              className="h-[120px] w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition">
              <span className="text-xs text-white">Click or drop to replace</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-neutral-500">
            <span className="text-2xl">🖼</span>
            <span className="text-xs">{uploading ? 'Uploading…' : 'Drop art here or click to browse'}</span>
            <span className="text-[10px] text-neutral-600">JPEG · PNG · WebP · 512 × 512 recommended</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-xs text-neutral-300">Uploading…</span>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
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

// ─── Badge frame editor (upgrade circle crop) ─────────────────────────────────

const BADGE_SIZE = 96; // preview circle diameter in px

function BadgeFrameEditor({
  artUrl,
  frameX,
  frameY,
  frameZoom,
  onChange,
}: {
  artUrl: string;
  frameX: number | null;
  frameY: number | null;
  frameZoom: number | null;
  onChange: (x: number, y: number, zoom: number) => void;
}) {
  const x = frameX ?? 50;
  const y = frameY ?? 50;
  const zoom = frameZoom ?? 1;

  const circleRef = useRef<HTMLDivElement>(null);
  // Stable mutable snapshot — the document-level listeners close over this.
  const snap = useRef({ x, y, zoom });
  snap.current = { x, y, zoom };

  const startDrag = (startX: number, startY: number, getPos: (e: MouseEvent | Touch) => { cx: number; cy: number }) => {
    void startX; void startY; // anchors not needed for movementX path
    const onMove = (e: MouseEvent) => {
      if (!circleRef.current) return;
      const { x: sx, y: sy, zoom: sz } = snap.current;
      const sensitivity = 100 / (BADGE_SIZE * sz);
      const nx = Math.max(0, Math.min(100, sx - e.movementX * sensitivity));
      const ny = Math.max(0, Math.min(100, sy - e.movementY * sensitivity));
      onChange(nx, ny, sz);
    };
    void getPos;
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY, (ev) => ({ cx: (ev as MouseEvent).clientX, cy: (ev as MouseEvent).clientY }));
  };

  // Touch: track previous position manually (no movementX on touch events).
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) lastTouch.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    if (!t || !lastTouch.current) return;
    const { x: sx, y: sy, zoom: sz } = snap.current;
    const sensitivity = 100 / (BADGE_SIZE * sz);
    const dx = t.clientX - lastTouch.current.x;
    const dy = t.clientY - lastTouch.current.y;
    lastTouch.current = { x: t.clientX, y: t.clientY };
    const nx = Math.max(0, Math.min(100, sx - dx * sensitivity));
    const ny = Math.max(0, Math.min(100, sy - dy * sensitivity));
    onChange(nx, ny, sz);
  };
  const handleTouchEnd = () => { lastTouch.current = null; };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { x: sx, y: sy, zoom: sz } = snap.current;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nz = Math.max(1, Math.min(4, Math.round((sz + delta) * 10) / 10));
    onChange(sx, sy, nz);
  };

  return (
    <div className="col-span-full">
      <div className="mb-2 text-[11px] text-neutral-400">Badge frame · drag to reposition, scroll or slider to zoom</div>
      <div className="flex flex-wrap items-center gap-6">
        {/* Editable circle */}
        <div
          ref={circleRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          style={{ width: BADGE_SIZE, height: BADGE_SIZE, touchAction: 'none' }}
          className="relative shrink-0 cursor-grab overflow-hidden rounded-full border-2 border-neutral-500 active:cursor-grabbing"
        >
          <img
            src={artUrl}
            alt=""
            aria-hidden
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${x}% ${y}%`,
              transform: zoom > 1 ? `scale(${zoom})` : undefined,
              transformOrigin: `${x}% ${y}%`,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-neutral-400">
            <span>Zoom — {zoom.toFixed(1)}×</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.1}
              value={zoom}
              onChange={(e) => onChange(x, y, Number(e.target.value))}
              className="w-36 accent-emerald-500"
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(50, 50, 1)}
            className="w-fit rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] hover:border-neutral-500"
          >
            Reset frame
          </button>
        </div>

        {/* Actual-size preview */}
        <div className="flex flex-col items-center gap-1">
          <div
            style={{ width: 40, height: 40 }}
            className="relative overflow-hidden rounded-full border-2 border-neutral-500"
          >
            <img
              src={artUrl}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${x}% ${y}%`,
                transform: zoom > 1 ? `scale(${zoom})` : undefined,
                transformOrigin: `${x}% ${y}%`,
                pointerEvents: 'none',
              }}
            />
          </div>
          <span className="text-[10px] text-neutral-600">in-game size</span>
        </div>
      </div>
    </div>
  );
}
