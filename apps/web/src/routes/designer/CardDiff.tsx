import type { Card } from '@prophecy/protocol';

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

export function CardDiff({ before, after }: { before: Card; after: Card }) {
  type Row = { label: string; before: string; after: string };
  const rows: Row[] = [];

  const scalar: Array<[string, keyof Card]> = [
    ['Name', 'name'],
    ['Type', 'type'],
    ['Faction', 'faction'],
    ['Color', 'color'],
    ['Rarity', 'rarity'],
    ['Cost', 'cost'],
    ['Health', 'health'],
    ['Stability', 'stability'],
    ['Point value', 'pointValue'],
    ['Elite point value', 'elitePointValue'],
    ['Plot point value', 'plotPointValue'],
    ['Unique', 'isUnique'],
    ['Ability text', 'abilityText'],
  ];

  for (const [label, key] of scalar) {
    const bv = fmt(before[key]);
    const av = fmt(after[key]);
    if (bv !== av) rows.push({ label, before: bv, after: av });
  }

  const bSubtypes = (before.subtypes ?? []).join(', ') || '—';
  const aSubtypes = (after.subtypes ?? []).join(', ') || '—';
  if (bSubtypes !== aSubtypes) rows.push({ label: 'Subtypes', before: bSubtypes, after: aSubtypes });

  const bKeywords = (before.keywords ?? []).join(', ') || '—';
  const aKeywords = (after.keywords ?? []).join(', ') || '—';
  if (bKeywords !== aKeywords) rows.push({ label: 'Keywords', before: bKeywords, after: aKeywords });

  const bAbilities = `${(before.abilities ?? []).length} abilities`;
  const aAbilities = `${(after.abilities ?? []).length} abilities`;
  if (bAbilities !== aAbilities) rows.push({ label: 'Abilities', before: bAbilities, after: aAbilities });

  const bDice = before.dieFaces !== null ? 'custom dice' : '(none)';
  const aDice = after.dieFaces !== null ? 'custom dice' : '(none)';
  if (bDice !== aDice) rows.push({ label: 'Die faces', before: bDice, after: aDice });

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Identical to current version.</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="pb-1 pr-3 font-medium">Field</th>
          <th className="pb-1 pr-3 font-medium">Historical</th>
          <th className="pb-1 font-medium">Current</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-neutral-800">
            <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">{row.label}</td>
            <td className="py-1 pr-3 text-red-400 line-through whitespace-pre-wrap break-words max-w-[160px]">
              {row.before}
            </td>
            <td className="py-1 text-emerald-400 whitespace-pre-wrap break-words max-w-[160px]">
              {row.after}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
