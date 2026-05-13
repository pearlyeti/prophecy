// Form-based builder for a card's `abilities` array. Each ability is
// one "kind: immediate" with a list of effects. Each effect has an
// `op` from a dropdown; (new) is a placeholder for unimplemented ops
// so a card author can describe what they want before the engine has
// the dispatch path. When the engine ships an op the (new) entries
// get re-edited to the real op name.

import type { Ability, Effect } from '@prophecy/protocol';
import { KNOWN_OPS } from '@prophecy/protocol';

type OpKind = (typeof KNOWN_OPS)[number] | 'new';

const OP_OPTIONS: { value: OpKind; label: string; implemented: boolean }[] = [
  { value: 'gain_resources', label: 'gain_resources', implemented: true },
  { value: 'draw_cards', label: 'draw_cards', implemented: true },
  { value: 'deal_damage', label: 'deal_damage', implemented: true },
  { value: 'give_shields', label: 'give_shields', implemented: true },
  { value: 'heal_damage', label: 'heal_damage', implemented: true },
  { value: 'remove_shields', label: 'remove_shields', implemented: true },
  { value: 'new', label: '(new) — op not yet implemented', implemented: false },
];

function defaultEffect(op: OpKind): Effect {
  switch (op) {
    case 'gain_resources':
      return { op: 'gain_resources', amount: 1 };
    case 'draw_cards':
      return { op: 'draw_cards', scope: 'self', amount: 1 };
    case 'deal_damage':
      return { op: 'deal_damage', amount: 1, kind: 'unspecified' };
    case 'give_shields':
      return { op: 'give_shields', amount: 1 };
    case 'heal_damage':
      return { op: 'heal_damage', amount: 1 };
    case 'remove_shields':
      return { op: 'remove_shields', amount: 1 };
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
          <EffectsList
            effects={ability.effects}
            onChange={(next) => replaceAbility(idx, { kind: 'immediate', effects: next })}
          />
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
  const add = () => onChange([...effects, defaultEffect('gain_resources')]);

  return (
    <div className="space-y-2">
      {effects.length === 0 && (
        <div className="text-[11px] italic text-neutral-500">No effects yet.</div>
      )}
      {effects.map((effect, idx) => (
        <div
          key={idx}
          className="rounded border border-neutral-800 bg-neutral-900/60 p-2"
        >
          <div className="flex items-center gap-2">
            <select
              value={effect.op}
              onChange={(e) => {
                const next = defaultEffect(e.target.value as OpKind);
                replace(idx, next);
              }}
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

function EffectFields({
  effect,
  onChange,
}: {
  effect: Effect;
  onChange: (next: Effect) => void;
}) {
  switch (effect.op) {
    case 'gain_resources':
      return (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={1}
          max={99}
          onChange={(amount) => onChange({ ...effect, amount })}
        />
      );
    case 'heal_damage':
      return (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={1}
          max={99}
          onChange={(amount) => onChange({ ...effect, amount })}
        />
      );
    case 'give_shields':
      return (
        <NumberField
          label="Amount"
          value={effect.amount}
          min={1}
          max={3}
          onChange={(amount) => onChange({ ...effect, amount })}
        />
      );
    case 'draw_cards':
      return (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Scope</span>
            <select
              value={effect.scope}
              onChange={(e) =>
                onChange({
                  ...effect,
                  scope: e.target.value as typeof effect.scope,
                })
              }
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
            >
              <option value="self">self</option>
              <option value="each_player">each_player</option>
              <option value="self_to_hand_size">self_to_hand_size</option>
            </select>
          </label>
          {effect.scope !== 'self_to_hand_size' && (
            <NumberField
              label="Amount"
              value={effect.amount ?? 1}
              min={1}
              max={20}
              onChange={(amount) => onChange({ ...effect, amount })}
            />
          )}
        </div>
      );
    case 'deal_damage':
      return (
        <div className="flex flex-wrap gap-2">
          <NumberField
            label="Amount"
            value={effect.amount}
            min={1}
            max={99}
            onChange={(amount) => onChange({ ...effect, amount })}
          />
          <label className="flex flex-col text-[11px] text-neutral-400">
            <span>Kind</span>
            <select
              value={effect.kind}
              onChange={(e) =>
                onChange({
                  ...effect,
                  kind: e.target.value as typeof effect.kind,
                })
              }
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
            >
              <option value="melee">melee</option>
              <option value="ranged">ranged</option>
              <option value="indirect">indirect</option>
              <option value="unspecified">unspecified</option>
            </select>
          </label>
        </div>
      );
    case 'remove_shields':
      return (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input
              type="checkbox"
              checked={effect.amount === 'all'}
              onChange={(e) =>
                onChange({ ...effect, amount: e.target.checked ? 'all' : 1 })
              }
            />
            <span>All shields</span>
          </label>
          {effect.amount !== 'all' && (
            <NumberField
              label="Amount"
              value={effect.amount}
              min={1}
              max={3}
              onChange={(amount) => onChange({ ...effect, amount })}
            />
          )}
        </div>
      );
    case 'new':
      return (
        <div className="space-y-2">
          <TextField
            label="Working name for the new op"
            value={effect.workingName}
            onChange={(workingName) => onChange({ ...effect, workingName })}
          />
          <TextField
            label="Notes (params, expected behavior)"
            value={effect.notes}
            multiline
            onChange={(notes) => onChange({ ...effect, notes })}
          />
        </div>
      );
  }
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col text-[11px] text-neutral-400">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-[36px] w-24 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="flex flex-col text-[11px] text-neutral-400">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[60px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
        />
      )}
    </label>
  );
}
