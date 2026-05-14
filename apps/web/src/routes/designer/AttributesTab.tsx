import type { AttributeCatalog } from '@prophecy/protocol';
import { useState } from 'react';

import { saveAttributes } from './api.js';

type AttrKey = keyof AttributeCatalog;

const CATEGORIES: { key: AttrKey; label: string; system: boolean }[] = [
  { key: 'subtypes',  label: 'Subtype',  system: false },
  { key: 'colors',    label: 'Color',    system: true  },
  { key: 'factions',  label: 'Faction',  system: true  },
  { key: 'rarities',  label: 'Rarity',   system: true  },
  { key: 'keywords',  label: 'Keyword',  system: true  },
];

export function AttributesTab({
  attributes,
  onReload,
}: {
  attributes: AttributeCatalog;
  onReload: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<AttrKey>>(new Set(CATEGORIES.map((c) => c.key)));
  const [newValue, setNewValue] = useState<Record<AttrKey, string>>({
    subtypes: '', colors: '', factions: '', rarities: '', keywords: '',
  });
  const [saving, setSaving] = useState(false);

  const toggleGroup = (key: AttrKey) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const addValue = async (key: AttrKey) => {
    const val = newValue[key].trim();
    if (!val || attributes[key].includes(val)) return;
    const updated: AttributeCatalog = { ...attributes, [key]: [...attributes[key], val] };
    setSaving(true);
    try {
      await saveAttributes(updated);
      setNewValue((prev) => ({ ...prev, [key]: '' }));
      onReload();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const removeValue = async (key: AttrKey, val: string) => {
    if (!confirm(`Remove "${val}" from ${key}?`)) return;
    const updated: AttributeCatalog = { ...attributes, [key]: attributes[key].filter((v) => v !== val) };
    setSaving(true);
    try {
      await saveAttributes(updated);
      onReload();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg space-y-1">
      {CATEGORIES.map(({ key, label, system }) => {
        const expanded = !collapsed.has(key);
        const values = attributes[key];
        return (
          <div key={key} className="rounded-xl border border-neutral-800 bg-neutral-950/60">
            <button
              type="button"
              onClick={() => toggleGroup(key)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <span
                className="text-xs text-neutral-500 transition-transform"
                style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none' }}
              >
                ▶
              </span>
              <span className="flex-1 text-base font-semibold text-neutral-200">{label}</span>
              <span className="text-xs text-neutral-600">{values.length}</span>
              {system && (
                <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-neutral-500">
                  system
                </span>
              )}
            </button>

            {expanded && (
              <div className="border-t border-neutral-800 px-4 pb-4 pt-3">
                {values.length === 0 ? (
                  <p className="mb-3 text-sm text-neutral-600">No values yet.</p>
                ) : (
                  <ul className="mb-3 flex flex-wrap gap-1.5">
                    {values.map((v) => (
                      <li key={v} className="flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5">
                        <span className="text-sm text-neutral-200">{v}</span>
                        <button
                          type="button"
                          onClick={() => void removeValue(key, v)}
                          disabled={saving}
                          className="text-xs text-neutral-600 hover:text-red-400 disabled:opacity-40"
                          aria-label={`Remove ${v}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  onSubmit={(e) => { e.preventDefault(); void addValue(key); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder={`New ${label.toLowerCase()}…`}
                    value={newValue[key]}
                    onChange={(e) => setNewValue((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="min-h-[36px] flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={saving || !newValue[key].trim()}
                    className="min-h-[36px] rounded-lg border border-emerald-700 bg-emerald-900 px-3 py-1 text-sm text-emerald-50 hover:bg-emerald-800 disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>
                {system && (
                  <p className="mt-2 text-xs text-neutral-600">
                    System attributes — new values appear in designer dropdowns but require a schema update to be valid in cards.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
