// Form-based builder for a card's `abilities` array.
// Covers all six ability kinds and all first-wave effect ops.
// Stub ops (schema-defined, not yet dispatched) get a minimal form so
// card authors can pre-author content without hand-editing JSON.

import type {
  Ability,
  ActionCost,
  CardDisposition,
  Effect,
  ImmediateAbility,
  PlayCondition,
  TargetSpec,
  TriggerEvent,
} from '@prophecy/protocol';
import { CARD_TYPES, COLORS, DIE_SYMBOLS, KNOWN_OPS } from '@prophecy/protocol';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const ABILITY_KINDS = [
  'immediate',
  'triggered',
  'action',
  'powerAction',
  'special',
  'passive',
  'claim',
] as const;

type AbilityKind = (typeof ABILITY_KINDS)[number];

const STUB_OPS = [
  'removeDie', 'rerollDice', 'turnDie', 'resolveDie', 'resolveWithoutRemoving',
  'rollDie', 'rollCardDie', 'activateCharacter', 'exhaustCard', 'readyCard',
  'moveDamage', 'moveShields', 'discardCards', 'discardFromDeck', 'lookAtCards',
  'revealTopCard', 'searchDeck', 'playCard', 'returnToHand', 'takeBattlefieldControl',
  'claimBattlefield', 'endActionPhase', 'takeAdditionalActions', 'forceActivate',
  'grantKeyword', 'modifyDieValue', 'setAsideDie', 'placeDamageOnCard',
  'placeResourceOnCard', 'returnDefeatedCharacter', 'choice',
] as const;

type KnownOp = (typeof KNOWN_OPS)[number];
type StubOp = (typeof STUB_OPS)[number];
type OpKind = KnownOp | StubOp | 'new';

const TRIGGER_KINDS = [
  'afterActivateCharacter', 'afterActivateSupport', 'afterPlayCard', 'afterPlayUpgrade',
  'afterCharacterDefeated', 'afterDieRolledSymbol', 'afterResolveDie',
  'afterClaimBattlefield', 'afterRemoveDice', 'afterDealDamage', 'afterTakeDamage',
  'beforeCharacterDefeated', 'beforeTakeDamage', 'beforeActivate', 'beforeResolve', 'setup',
] as const;

const CONDITION_KINDS = [
  'controlsBattlefield', 'spotCharacter', 'spotCard', 'moreReadyCharacters',
  'firstActionOfRound', 'opponentHasNoCards', 'haveNCharactersInPlay', 'opponentHasNCharacters',
] as const;

const COST_KINDS = [
  'exhaust', 'removeDie', 'spendResources', 'discardCard', 'dealDamageToSelf',
] as const;

// ────────────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────────────

function defaultAbility(kind: AbilityKind): Ability {
  switch (kind) {
    case 'immediate': return { kind: 'immediate', effects: [] };
    case 'triggered': return { kind: 'triggered', triggerEvent: { kind: 'afterActivateCharacter' }, effects: [] };
    case 'action': return { kind: 'action', costs: [{ kind: 'exhaust' }], effects: [] };
    case 'powerAction': return { kind: 'powerAction', costs: [], effects: [] };
    case 'special': return { kind: 'special', effects: [] };
    case 'passive': return { kind: 'passive', description: '' };
    case 'claim': return { kind: 'claim', effects: [] };
  }
}

function defaultEffect(op: OpKind): Effect {
  switch (op) {
    case 'gainResources': return { op: 'gainResources', amount: 1 };
    case 'loseResources': return { op: 'loseResources', amount: 1, target: 'opponent' };
    case 'drawCards': return { op: 'drawCards', player: 'self', amount: 1 };
    case 'dealDamage': return { op: 'dealDamage', amount: 1, damageType: 'unspecified', target: { kind: 'opponentCharacter' } };
    case 'addShields': return { op: 'addShields', amount: 1, target: { kind: 'ownCharacter' } };
    case 'removeShields': return { op: 'removeShields', amount: 1, target: { kind: 'anyCharacter' } };
    case 'healDamage': return { op: 'healDamage', amount: 1, target: { kind: 'ownCharacter' } };
    case 'new': return { op: 'new', workingName: '', notes: '' };
    default: return { op, optional: false } as Effect;
  }
}

function defaultCost(kind: (typeof COST_KINDS)[number]): ActionCost {
  switch (kind) {
    case 'exhaust': return { kind: 'exhaust' };
    case 'removeDie': return { kind: 'removeDie' };
    case 'spendResources': return { kind: 'spendResources', amount: 1 };
    case 'discardCard': return { kind: 'discardCard' };
    case 'dealDamageToSelf': return { kind: 'dealDamageToSelf', amount: 1 };
  }
}

// ────────────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────────────

export function AbilityBuilder({
  abilities,
  onChange,
}: {
  abilities: readonly Ability[];
  onChange: (next: Ability[]) => void;
}) {
  const replace = (idx: number, next: Ability) => {
    const out = abilities.slice();
    out[idx] = next;
    onChange(out);
  };
  const remove = (idx: number) => onChange(abilities.filter((_, i) => i !== idx));
  const add = (kind: AbilityKind) => onChange([...abilities, defaultAbility(kind)]);

  return (
    <div className="space-y-3">
      {abilities.length === 0 && (
        <p className="text-xs italic text-neutral-500">No abilities yet.</p>
      )}
      {abilities.map((ab, idx) => (
        <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Ability {idx + 1} · {ab.kind}
            </span>
            <button type="button" onClick={() => remove(idx)}
              className="min-h-[32px] rounded border border-neutral-700 px-2 text-xs text-neutral-400 hover:border-red-700 hover:text-red-300">
              Remove
            </button>
          </div>
          <AbilityEditor ability={ab} onChange={(next) => replace(idx, next)} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-500">Add ability:</span>
        {ABILITY_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => add(k)}
            className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500">
            + {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Per-kind editors
// ────────────────────────────────────────────────────────────────────

function AbilityEditor({ ability, onChange }: { ability: Ability; onChange: (next: Ability) => void }) {
  switch (ability.kind) {
    case 'immediate': return <ImmediateEditor ability={ability} onChange={onChange} />;
    case 'triggered': return <TriggeredEditor ability={ability} onChange={onChange} />;
    case 'action': return <ActionEditor ability={ability} onChange={onChange} />;
    case 'powerAction': return <ActionEditor ability={ability} onChange={onChange} />;
    case 'special': return <SpecialEditor ability={ability} onChange={onChange} />;
    case 'passive': return <PassiveEditor ability={ability} onChange={onChange} />;
    case 'claim': return <ClaimEditor ability={ability} onChange={onChange} />;
  }
}

function ImmediateEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'immediate' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <div className="space-y-3">
      <PlayConditionSection
        value={ability.playCondition}
        onChange={(c) => onChange({ ...ability, playCondition: c })}
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-neutral-400">After resolving:</span>
        <SelectField
          value={ability.cardDisposition ?? 'discard'}
          options={[
            { value: 'discard', label: 'Discard card' },
            { value: 'setAside', label: 'Set aside' },
            { value: 'returnToDeckBottom', label: 'Return to deck bottom' },
          ]}
          onChange={(v) => onChange({ ...ability, cardDisposition: v as CardDisposition })}
        />
      </div>
      <EffectsList
        effects={ability.effects}
        onChange={(next) => onChange({ ...ability, effects: next })}
      />
    </div>
  );
}

function TriggeredEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'triggered' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <div className="space-y-3">
      <Section label="Trigger event">
        <TriggerEventEditor
          value={ability.triggerEvent}
          onChange={(t) => onChange({ ...ability, triggerEvent: t })}
        />
      </Section>
      <PlayConditionSection
        value={ability.playCondition}
        onChange={(c) => onChange({ ...ability, playCondition: c })}
      />
      <label className="flex items-center gap-1 text-[11px] text-neutral-400">
        <input type="checkbox" checked={ability.optional ?? false}
          onChange={(e) => onChange({ ...ability, optional: e.target.checked })} />
        <span>Optional (player may skip)</span>
      </label>
      <EffectsList
        effects={ability.effects}
        onChange={(next) => onChange({ ...ability, effects: next })}
      />
    </div>
  );
}

function ActionEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'action' | 'powerAction' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <div className="space-y-3">
      <Section label="Costs">
        <ActionCostList
          costs={ability.costs ?? []}
          onChange={(c) => onChange({ ...ability, costs: c })}
        />
      </Section>
      <PlayConditionSection
        value={ability.playCondition}
        onChange={(c) => onChange({ ...ability, playCondition: c })}
      />
      <label className="flex items-center gap-1 text-[11px] text-neutral-400">
        <input type="checkbox" checked={ability.optional ?? false}
          onChange={(e) => onChange({ ...ability, optional: e.target.checked })} />
        <span>Optional (player may skip)</span>
      </label>
      <EffectsList
        effects={ability.effects}
        onChange={(next) => onChange({ ...ability, effects: next })}
      />
    </div>
  );
}

function SpecialEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'special' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1 text-[11px] text-neutral-400">
        <input type="checkbox" checked={ability.optional ?? false}
          onChange={(e) => onChange({ ...ability, optional: e.target.checked })} />
        <span>Optional (player may skip)</span>
      </label>
      <EffectsList
        effects={ability.effects}
        onChange={(next) => onChange({ ...ability, effects: next })}
      />
    </div>
  );
}

function PassiveEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'passive' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <TextField
      label="Description tag (engine key, e.g. 'guardian.all-characters')"
      value={ability.description}
      onChange={(d) => onChange({ ...ability, description: d })}
    />
  );
}

function ClaimEditor({ ability, onChange }: {
  ability: Extract<Ability, { kind: 'claim' }>;
  onChange: (next: Ability) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1 text-[11px] text-neutral-400">
        <input type="checkbox" checked={ability.optional ?? false}
          onChange={(e) => onChange({ ...ability, optional: e.target.checked })} />
        <span>Optional (player may skip)</span>
      </label>
      <EffectsList
        effects={ability.effects}
        onChange={(next) => onChange({ ...ability, effects: next })}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Play condition
// ────────────────────────────────────────────────────────────────────

function PlayConditionSection({ value, onChange }: {
  value: PlayCondition | undefined;
  onChange: (c: PlayCondition | undefined) => void;
}) {
  if (!value) {
    return (
      <button type="button" onClick={() => onChange({ kind: 'controlsBattlefield' })}
        className="text-[11px] text-neutral-500 hover:text-neutral-300 underline">
        + Add play condition
      </button>
    );
  }
  return (
    <Section label="Play condition">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <SelectField
            value={value.kind}
            options={CONDITION_KINDS.map((k) => ({ value: k, label: k }))}
            onChange={(k) => onChange(defaultCondition(k as PlayCondition['kind']))}
          />
          <button type="button" onClick={() => onChange(undefined)}
            className="text-[11px] text-neutral-500 hover:text-red-400">
            Remove
          </button>
        </div>
        <PlayConditionFields value={value} onChange={onChange} />
      </div>
    </Section>
  );
}

function defaultCondition(kind: PlayCondition['kind']): PlayCondition {
  switch (kind) {
    case 'spotCharacter': return { kind, color: undefined, unique: undefined, count: undefined };
    case 'spotCard': return { kind, cardId: '' };
    case 'haveNCharactersInPlay': return { kind, count: 2 };
    case 'opponentHasNCharacters': return { kind, count: 1 };
    default: return { kind } as PlayCondition;
  }
}

function PlayConditionFields({ value, onChange }: {
  value: PlayCondition;
  onChange: (c: PlayCondition) => void;
}) {
  switch (value.kind) {
    case 'spotCharacter':
      return (
        <div className="flex flex-wrap gap-2">
          <SelectField label="Color" value={value.color ?? ''}
            options={[{ value: '', label: 'Any color' }, ...COLORS.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => onChange({ ...value, color: v || undefined })} />
          <SelectField label="Unique" value={value.unique == null ? '' : String(value.unique)}
            options={[{ value: '', label: 'Any' }, { value: 'true', label: 'Unique only' }, { value: 'false', label: 'Non-unique only' }]}
            onChange={(v) => onChange({ ...value, unique: v === '' ? undefined : v === 'true' })} />
          <NumberField label="Min count" value={value.count ?? 1} min={1} max={4}
            onChange={(n) => onChange({ ...value, count: n })} />
        </div>
      );
    case 'spotCard':
      return (
        <TextField label="Card ID" value={value.cardId}
          onChange={(v) => onChange({ ...value, cardId: v })} />
      );
    case 'haveNCharactersInPlay':
    case 'opponentHasNCharacters':
      return (
        <NumberField label="Count" value={value.count} min={1} max={4}
          onChange={(n) => onChange({ ...value, count: n })} />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Trigger event
// ────────────────────────────────────────────────────────────────────

function TriggerEventEditor({ value, onChange }: {
  value: TriggerEvent;
  onChange: (t: TriggerEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        value={value.kind}
        options={TRIGGER_KINDS.map((k) => ({ value: k, label: k }))}
        onChange={(k) => onChange(defaultTrigger(k as TriggerEvent['kind']))}
      />
      <TriggerEventFields value={value} onChange={onChange} />
    </div>
  );
}

function defaultTrigger(kind: TriggerEvent['kind']): TriggerEvent {
  switch (kind) {
    case 'afterPlayCard': return { kind };
    case 'afterCharacterDefeated': return { kind, whose: 'any' };
    case 'beforeCharacterDefeated': return { kind, whose: 'any' };
    case 'afterDieRolledSymbol': return { kind, symbol: 'melee' };
    case 'afterActivateCharacter': return { kind, ownOnly: true };
    case 'afterActivateSupport': return { kind, ownOnly: true };
    default: return { kind } as TriggerEvent;
  }
}

function TriggerEventFields({ value, onChange }: {
  value: TriggerEvent;
  onChange: (t: TriggerEvent) => void;
}) {
  switch (value.kind) {
    case 'afterActivateCharacter':
    case 'afterActivateSupport':
      return (
        <label className="flex items-center gap-1 text-[11px] text-neutral-400">
          <input type="checkbox" checked={value.ownOnly ?? true}
            onChange={(e) => onChange({ ...value, ownOnly: e.target.checked })} />
          <span>Own cards only</span>
        </label>
      );
    case 'afterPlayCard':
      return (
        <div className="flex flex-wrap gap-2">
          <SelectField label="Card type" value={value.cardType ?? ''}
            options={[{ value: '', label: 'Any type' }, ...CARD_TYPES.map((t) => ({ value: t, label: t }))]}
            onChange={(v) => onChange({ ...value, cardType: v || undefined })} />
          <SelectField label="Color" value={value.color ?? ''}
            options={[{ value: '', label: 'Any color' }, ...COLORS.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => onChange({ ...value, color: v || undefined })} />
        </div>
      );
    case 'afterCharacterDefeated':
    case 'beforeCharacterDefeated':
      return (
        <SelectField label="Whose character" value={value.whose ?? 'any'}
          options={[{ value: 'own', label: 'Own' }, { value: 'opponent', label: "Opponent's" }, { value: 'any', label: 'Any' }]}
          onChange={(v) => onChange({ ...value, whose: v as 'own' | 'opponent' | 'any' })} />
      );
    case 'afterDieRolledSymbol':
      return (
        <SelectField label="Symbol" value={value.symbol}
          options={DIE_SYMBOLS.map((s) => ({ value: s, label: s }))}
          onChange={(v) => onChange({ ...value, symbol: v })} />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Action costs
// ────────────────────────────────────────────────────────────────────

function ActionCostList({ costs, onChange }: {
  costs: readonly ActionCost[];
  onChange: (c: ActionCost[]) => void;
}) {
  const replaceCost = (idx: number, next: ActionCost) => {
    const out = costs.slice();
    out[idx] = next;
    onChange(out);
  };
  const removeCost = (idx: number) => onChange(costs.filter((_, i) => i !== idx));
  const addCost = () => onChange([...costs, { kind: 'exhaust' }]);

  return (
    <div className="space-y-2">
      {costs.length === 0 && (
        <p className="text-[11px] italic text-neutral-500">No costs (free action).</p>
      )}
      {costs.map((cost, idx) => (
        <div key={idx} className="flex flex-wrap items-start gap-2">
          <SelectField
            value={cost.kind}
            options={COST_KINDS.map((k) => ({ value: k, label: k }))}
            onChange={(k) => replaceCost(idx, defaultCost(k as ActionCost['kind']))}
          />
          <ActionCostFields cost={cost} onChange={(next) => replaceCost(idx, next)} />
          <button type="button" onClick={() => removeCost(idx)}
            className="text-[11px] text-neutral-500 hover:text-red-400 mt-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={addCost}
        className="min-h-[32px] rounded border border-neutral-800 px-2 text-[11px] text-neutral-400 hover:border-neutral-600">
        + Add cost
      </button>
    </div>
  );
}

function ActionCostFields({ cost, onChange }: {
  cost: ActionCost;
  onChange: (next: ActionCost) => void;
}) {
  switch (cost.kind) {
    case 'spendResources':
      return (
        <NumberField label="Amount" value={cost.amount} min={1} max={20}
          onChange={(amount) => onChange({ ...cost, amount })} />
      );
    case 'dealDamageToSelf':
      return (
        <NumberField label="Damage" value={cost.amount} min={1} max={10}
          onChange={(amount) => onChange({ ...cost, amount })} />
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Effects list
// ────────────────────────────────────────────────────────────────────

function EffectsList({ effects, onChange }: {
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
        <p className="text-[11px] italic text-neutral-500">No effects yet.</p>
      )}
      {effects.map((fx, idx) => (
        <div key={idx} className="rounded border border-neutral-800 bg-neutral-900/60 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={fx.op}
              onChange={(e) => replace(idx, defaultEffect(e.target.value as OpKind))}
              className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
            >
              <optgroup label="Implemented">
                {KNOWN_OPS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </optgroup>
              <optgroup label="Stub — schema defined, not yet dispatched">
                {STUB_OPS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </optgroup>
              <optgroup label="Placeholder">
                <option value="new">(new) — op not yet in schema</option>
              </optgroup>
            </select>
            <label className="flex items-center gap-1 text-[11px] text-neutral-400 ml-auto">
              <input type="checkbox"
                checked={'optional' in fx ? (fx.optional ?? false) : false}
                onChange={(e) => replace(idx, { ...fx, optional: e.target.checked } as Effect)}
              />
              <span>Optional</span>
            </label>
            <button type="button" onClick={() => remove(idx)}
              className="min-h-[28px] rounded border border-neutral-800 px-2 text-xs text-neutral-500 hover:border-red-700 hover:text-red-300">
              ✕
            </button>
          </div>
          <EffectFields effect={fx} onChange={(next) => replace(idx, next)} />
        </div>
      ))}
      <button type="button" onClick={add}
        className="min-h-[36px] rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500">
        + Add effect
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Effect fields (per-op)
// ────────────────────────────────────────────────────────────────────

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
          <SelectField label="Target" value={effect.target}
            options={[{ value: 'opponent', label: 'Opponent' }, { value: 'self', label: 'Self' }]}
            onChange={(v) => onChange({ ...effect, target: v as 'opponent' | 'self' })} />
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
    case 'drawCards':
      return (
        <div className="flex flex-wrap gap-2">
          <SelectField label="Player" value={effect.player ?? 'self'}
            options={[{ value: 'self', label: 'Self' }, { value: 'eachPlayer', label: 'Each player' }, { value: 'opponent', label: 'Opponent' }]}
            onChange={(v) => onChange({ ...effect, player: v as typeof effect.player })} />
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
          <SelectField label="Type" value={effect.damageType ?? 'unspecified'}
            options={[
              { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' },
              { value: 'indirect', label: 'Indirect' }, { value: 'unspecified', label: 'Unspecified' },
            ]}
            onChange={(v) => onChange({ ...effect, damageType: v as typeof effect.damageType })} />
          <TargetPicker
            value={effect.target}
            options={['opponentCharacter', 'ownCharacter', 'anyCharacter', 'eachOpponentCharacter', 'eachCharacter']}
            onChange={(t) => onChange({ ...effect, target: t })}
          />
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">
            <input type="checkbox" checked={effect.unblockable ?? false}
              onChange={(e) => onChange({ ...effect, unblockable: e.target.checked })} />
            <span>Unblockable</span>
          </label>
        </div>
      );
    case 'addShields':
      return (
        <div className="flex flex-wrap gap-2">
          <NumberField label="Amount" value={effect.amount} min={1} max={3}
            onChange={(amount) => onChange({ ...effect, amount })} />
          <TargetPicker
            value={effect.target}
            options={['ownCharacter', 'opponentCharacter', 'anyCharacter', 'eachOpponentCharacter', 'eachCharacter']}
            onChange={(t) => onChange({ ...effect, target: t })}
          />
        </div>
      );
    case 'removeShields':
      return (
        <div className="flex flex-wrap gap-2">
          <TargetPicker
            value={effect.target}
            options={['anyCharacter', 'opponentCharacter', 'ownCharacter', 'eachOpponentCharacter', 'eachCharacter']}
            onChange={(t) => onChange({ ...effect, target: t })}
          />
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
    case 'healDamage':
      return (
        <div className="flex flex-wrap gap-2">
          <NumberField label="Amount" value={effect.amount} min={1} max={99}
            onChange={(amount) => onChange({ ...effect, amount })} />
          <TargetPicker
            value={effect.target}
            options={['ownCharacter', 'anyCharacter', 'opponentCharacter']}
            onChange={(t) => onChange({ ...effect, target: t })}
          />
        </div>
      );
    case 'new':
      return (
        <div className="space-y-2">
          <TextField label="Working name" value={effect.workingName as string}
            onChange={(v) => onChange({ ...effect, workingName: v })} />
          <TextField label="Notes (expected params, behavior)" value={effect.notes as string} multiline
            onChange={(v) => onChange({ ...effect, notes: v })} />
        </div>
      );
    default:
      // Stub op — schema defined, engine not yet dispatched
      return (
        <p className="text-[11px] italic text-neutral-500">
          Stub op — schema defined, not yet dispatched. Card will parse cleanly but this effect
          throws <code className="text-neutral-400">NotImplementedError</code> at runtime until the
          engine implements it.
        </p>
      );
  }
}

// ────────────────────────────────────────────────────────────────────
// Shared sub-components
// ────────────────────────────────────────────────────────────────────

function TargetPicker({ value, options, onChange }: {
  value: TargetSpec;
  options: TargetSpec['kind'][];
  onChange: (t: TargetSpec) => void;
}) {
  return (
    <SelectField
      label="Target"
      value={value.kind}
      options={options.map((k) => ({ value: k, label: k }))}
      onChange={(k) => onChange({ kind: k as TargetSpec['kind'] })}
    />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-800/60 p-2 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      {children}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col text-[11px] text-neutral-400">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
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
