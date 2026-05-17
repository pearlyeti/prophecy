// Editor for a card's six die faces. Any card with `dieFaces !== null`
// has dice — the CardsTab decides when to show this component based on
// the "Has dice" checkbox. Faces are positionally meaningful (the
// engine indexes by 0..5 for seeded rolls), so the editor renders them
// as a fixed 6-slot grid and never reorders.

import { DIE_SYMBOLS, type DieFace, type DieSymbol } from '@prophecy/protocol';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    const updatedFace = { ...faces[idx]!, ...patch } as DieFace;
    // 'special' and 'blank' always have value 0 per the rules.
    if (updatedFace.symbol === 'special' || updatedFace.symbol === 'blank') {
      updatedFace.value = 0;
    }
    // 'modifier'-symbol faces must be modifier=true (it's the symbolless
    // wild's defining trait). Snap on symbol change.
    if (updatedFace.symbol === 'modifier') {
      updatedFace.modifier = true;
    }
    next[idx] = updatedFace;
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {faces.map((face, idx) => (
        <div
          key={idx}
          className="rounded border border-neutral-800 bg-neutral-900/60 p-2"
        >
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Face {idx + 1}
          </div>
          <div className="space-y-2">
            <Label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span>Symbol</span>
              <Select
                value={face.symbol}
                onValueChange={(v) => updateFace(idx, { symbol: v as DieSymbol })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIE_SYMBOLS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <div className="flex gap-2">
              <Label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
                <span>Value</span>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={face.value}
                  disabled={face.symbol === 'special' || face.symbol === 'blank'}
                  onChange={(e) => updateFace(idx, { value: Number(e.target.value) })}
                  className="h-9 text-sm"
                />
              </Label>
              <Label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
                <span>Cost</span>
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={face.cost}
                  onChange={(e) => updateFace(idx, { cost: Number(e.target.value) })}
                  className="h-9 text-sm"
                />
              </Label>
            </div>
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={face.modifier}
                disabled={face.symbol === 'modifier'}
                onCheckedChange={(v) => updateFace(idx, { modifier: v === true })}
              />
              <span>Modifier (+N)</span>
            </Label>
          </div>
        </div>
      ))}
    </div>
  );
}
