// Editor for a card's six die faces. Any card with `dieFaces !== null`
// has dice — the CardsTab decides when to show this component based on
// the "Has dice" checkbox. Faces are positionally meaningful (the
// engine indexes by 0..5 for seeded rolls), so the editor renders them
// as a fixed 6-slot grid and never reorders.

import { DIE_SYMBOLS, type DieFace, type DieSymbol } from '@prophecy/protocol';

type SixFaces = [DieFace, DieFace, DieFace, DieFace, DieFace, DieFace];

/** Sensible-ish default face when toggling "Has dice" on, or when adding a fresh face. */
export const BLANK_FACE: DieFace = {
  symbol: 'blank',
  value: 0,
  cost: 0,
  modifier: false,
};

export function defaultDiceFaces(): SixFaces {
  return [
    { symbol: 'melee', value: 1, cost: 0, modifier: false },
    { symbol: 'melee', value: 2, cost: 0, modifier: false },
    { symbol: 'ranged', value: 1, cost: 0, modifier: false },
    { symbol: 'shield', value: 1, cost: 0, modifier: false },
    { symbol: 'resource', value: 1, cost: 0, modifier: false },
    { ...BLANK_FACE },
  ];
}

export function DiceEditor({
  faces,
  onChange,
}: {
  faces: SixFaces;
  onChange: (next: SixFaces) => void;
}) {
  const updateFace = (idx: number, patch: Partial<DieFace>) => {
    const next = [...faces] as SixFaces;
    next[idx] = { ...faces[idx], ...patch };
    // 'special' and 'blank' always have value 0 per the rules.
    if (next[idx].symbol === 'special' || next[idx].symbol === 'blank') {
      next[idx].value = 0;
    }
    // 'modifier'-symbol faces must be modifier=true (it's the symbolless
    // wild's defining trait). Snap on symbol change.
    if (next[idx].symbol === 'modifier') {
      next[idx].modifier = true;
    }
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {faces.map((face, idx) => (
        <div
          key={idx}
          className="rounded border border-neutral-800 bg-neutral-900/60 p-2"
        >
          <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Face {idx + 1}
          </div>
          <div className="space-y-2">
            <label className="flex flex-col text-[11px] text-neutral-400">
              <span>Symbol</span>
              <select
                value={face.symbol}
                onChange={(e) =>
                  updateFace(idx, { symbol: e.target.value as DieSymbol })
                }
                className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
              >
                {DIE_SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col text-[11px] text-neutral-400">
                <span>Value</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={face.value}
                  disabled={face.symbol === 'special' || face.symbol === 'blank'}
                  onChange={(e) =>
                    updateFace(idx, { value: Number(e.target.value) })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs disabled:opacity-40"
                />
              </label>
              <label className="flex flex-1 flex-col text-[11px] text-neutral-400">
                <span>Cost</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={face.cost}
                  onChange={(e) =>
                    updateFace(idx, { cost: Number(e.target.value) })
                  }
                  className="min-h-[36px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
                />
              </label>
            </div>
            <label className="flex items-center gap-1 text-[11px] text-neutral-400">
              <input
                type="checkbox"
                checked={face.modifier}
                disabled={face.symbol === 'modifier'}
                onChange={(e) => updateFace(idx, { modifier: e.target.checked })}
              />
              <span>Modifier (+N)</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
