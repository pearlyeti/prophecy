// Form-based builder for a card's `abilities` array. Each ability is
// one "kind: immediate" with a list of effects. Each effect has an
// `op` from a dropdown; 'new' is a placeholder for unimplemented ops
// so a card author can describe intent before the engine ships the op.

import type { Ability, Effect } from '@prophecy/protocol';
import { KNOWN_OPS } from '@prophecy/protocol';

type OpKind = (typeof KNOWN_OPS)[number] | 'new';

const OP_OPTIONS: { value: OpKind; label: string }[] = [
  { value: 'gainResources', label: 'gainResources' },
  { value: 'loseResources', label: 'loseResources' },
  { value: 'drawCards', label: 'drawCards' },
  { value: 'dealDamage', label: 'dealDamage' },
  { value: 'addShields', label: 'addShields' },
  { value: 'removeShields', label: 'removeShields' },
  { value: 'healDamage', label: 'healDamage' },
  { value: 'new', label: '(new) — op not yet implemented' },
];

function defaultEffect(op: OpKind): Effect {
  switch (op) {
    case 'gainResources':
      return { op: 'gainResources', amount: 1 };
    case 'loseResources':
      return { op: 'loseResources', amount: 1, target: 'opponent' };
    case 'drawCards':
      return { op: 'drawCards', player: 'self', amount: 1 };
    case 'dealDamage':
      return { op: 'dealDamage', amount: 1, damageType: 'unspecified', target: { kind: 'opponentCharacter' } };
    case 'addShields':
      return { op: 'addShields', amount: 1, target: { kind: 'ownCharacter' } };
    case 'healDamage':
      return { op: 'healDamage', amount: 1, target: { kind: 'ownCharacter' } };
    case 'removeShields':
      return { op: 'removeShields', amount: 1, target: { kind: 'anyCharacter' } };
    case 'new':
      return { op: 'new', workingName: '', notes: '' };
  }
}

export function AbilityBuilder({
  abilities,
  onChange,
}: {
  abilities: readonly Ability[];
  onChange: (next: Ability[]) => void;
}) {
  const replaceAbility = (idx: number, next: Ability) => {
    const out = abilities.slice();
    out[idx] = next;
    onChange(out);
  };
  const removeAbility = (idx: number) => {
    onChange(abilities.filter((_, i) => i !== idx));
  };
  const addAbility = () => {
    onChange([...abilities, { kind: 'immediate', effects: [] }]);
  };

  return (
    <div className="space-y-3">
      {abilities.length === 0 && (
        <div className="text-xs italic text-neutral-500">No abilities yet.</div>
      )}
      {abilities.map((ability, idx) => (
        <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Ability {idx + 1} · {ability.kind}
            </div>
            <button
              type="button"
              onClick={() => removeAbility(idx)}
              className="min-h-[32px] rounded border border-neutral-700 px-2 text-xs text-neutral-400 hover:border-red-700 hover:text-red-300"
            >
              Remove ability
            </button>
          </div>
          {ability.kind === 'immediate' && (
            <EffectsList
              effects={ability.effects}
              onChange={(next) => replaceAbility(idx, { kind: 'immediate', effects: next })}
            />
          )}
          {ability.kind !== 'immediate' && (
            <div className="text-[11px] italic text-neutral-500">
              {ability.kind} abilities — edit via JSON for now.
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addAbility}
        className="min-h-[44px] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:border-neutral-500"
      >
        + Add immediate ability
      </button>
    </div>
  );
}

function EffectsList({
  effects,
  onChange,
}: {
  effects: readonly Effect[];
  onChange: (next: Effect[]) => void;
}) {
  const replace = (idx: number, next: Effect) => {
    const out = effects.slice();
    out[idx] = next;
    onChange(out);
  };
  const remove = (idx: number) => onChange(effects.filter((_, i) => i !== idx));
  const add = () => onChange([...effects, defaultEffect('gainResources')]);

  return (
    <div className="space-y-2">
      {effects.length === 0 && (
        <div className="text-[11px] italic text-neutral-500">No effects yet.</div>
      )}
      {effects.map((effect, idx) => (
        <div key={idx} className="rounded border border-neutral-800 bg-neutral-900/60 p-2">
          <div className="flex items-center gap-2">
            <select
              value={effect.op}
              onChange={(e) => replace(idx, defaultEffect(e.target.value as OpKind))}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
            >
              {OP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="ml-auto min-h-[32px] rounded border border-neutral-800 px-2 text-xs text-neutral-500 hover:border-red-700 hover:text-red-300"
            >
              Remove
            </button>
          </div>
          <div className="mt-2">
            <EffectFields effect={effect} onChange={(e) => replace(idx, e)} />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="min-h-[36px] rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500"
      >
        + Add effect
      </button>
    </div>
  );
}

function EffectFields({ effect, onChange }: { effect: Effect; onChange: (next: Effect) => void }) {
  switch (effect.op) {
    case 'gainResources':
      return (
        <NumberField label="Amount" value={effect.amount} min={1} max={99}
          onChange={(amount) => onChange({ ...effect, amount })} />
      );
    case 'loseResources':
      return (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Target</span>
            <select value={effect.target} onChange={(e) => onChange({ ...effect, target: e.target.value as 'opponent' | 'self' })}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs">
              <option value="opponent">opponent</option>
              <option value="self">self</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={effect.amount === 'all'}
              onChange={(e) => onChange({ ...effect, amount: e.target.checked ? 'all' : 1 })} />
            <span>All resources</span>
          </label>
          {effect.amount !== 'all' && (
            <NumberField label="Amount" value={effect.amount as number} min={1} max={99}
              onChange={(amount) => onChange({ ...effect, amount })} />
          )}
        </div>
      );
    case 'healDamage':
      return (
        <NumberField label="Amount" value={effect.amount} min={1} max={99}
          onChange={(amount) => onChange({ ...effect, amount })} />
      );
    case 'addShields':
      return (
        <NumberField label="Amount" value={effect.amount} min={1} max={3}
          onChange={(amount) => onChange({ ...effect, amount })} />
      );
    case 'drawCards':
      return (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Player</span>
            <select value={effect.player ?? 'self'}
              onChange={(e) => onChange({ ...effect, player: e.target.value as typeof effect.player })}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs">
              <option value="self">self</option>
              <option value="eachPlayer">eachPlayer</option>
              <option value="opponent">opponent</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={effect.toHandSize ?? false}
              onChange={(e) => onChange({ ...effect, toHandSize: e.target.checked, amount: e.target.checked ? null : 1 })} />
            <span>To hand size</span>
          </label>
          {!effect.toHandSize && (
            <NumberField label="Amount" value={effect.amount ?? 1} min={1} max={20}
              onChange={(amount) => onChange({ ...effect, amount })} />
          )}
        </div>
      );
    case 'dealDamage':
      return (
        <div className="flex flex-wrap gap-2">
          <NumberField label="Amount" value={effect.amount} min={1} max={99}
            onChange={(amount) => onChange({ ...effect, amount })} />
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Type</span>
            <select value={effect.damageType ?? 'unspecified'}
              onChange={(e) => onChange({ ...effect, damageType: e.target.value as typeof effect.damageType })}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs">
              <option value="melee">melee</option>
              <option value="ranged">ranged</option>
              <option value="indirect">indirect</option>
              <option value="unspecified">unspecified</option>
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Target</span>
            <select value={effect.target?.kind ?? 'opponentCharacter'}
              onChange={(e) => onChange({ ...effect, target: { kind: e.target.value as 'opponentCharacter' | 'ownCharacter' | 'anyCharacter' | 'eachOpponentCharacter' | 'eachCharacter' } })}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs">
              <option value="opponentCharacter">opponentCharacter</option>
              <option value="ownCharacter">ownCharacter</option>
              <option value="anyCharacter">anyCharacter</option>
              <option value="eachOpponentCharacter">eachOpponentCharacter</option>
              <option value="eachCharacter">eachCharacter</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={effect.unblockable ?? false}
              onChange={(e) => onChange({ ...effect, unblockable: e.target.checked })} />
            <span>Unblockable</span>
          </label>
        </div>
      );
    case 'removeShields':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={effect.amount === 'all'}
              onChange={(e) => onChange({ ...effect, amount: e.target.checked ? 'all' : 1 })} />
            <span>All shields</span>
          </label>
          {effect.amount !== 'all' && (
            <NumberField label="Amount" value={effect.amount as number} min={1} max={3}
              onChange={(amount) => onChange({ ...effect, amount })} />
          )}
        </div>
      );
    case 'new':
      return (
        <div className="space-y-2">
          <TextField label="Working name" value={effect.workingName as string}
            onChange={(workingName) => onChange({ ...effect, workingName })} />
          <TextField label="Notes" value={effect.notes as string} multiline
            onChange={(notes) => onChange({ ...effect, notes })} />
        </div>
      );
    default:
      return <div className="text-[11px] italic text-neutral-500">No fields for this op yet.</div>;
  }
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <label className="flex flex-col text-[11px] text-neutral-400">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-[36px] w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs" />
    </label>
  );
}

function TextField({ label, value, onChange, multiline = false }: {
  label: string; value: string; onChange: (s: string) => void; multiline?: boolean;
}) {
  return (
    <label className="flex flex-col text-[11px] text-neutral-400">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} rows={2} onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs" />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs" />
      )}
    </label>
  );
}
