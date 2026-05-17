// Form-based builder for a card's `abilities` array.
// Covers all six ability kinds and all first-wave effect ops.
// Stub ops (schema-defined, not yet dispatched) get a minimal form so
// card authors can pre-author content without hand-editing JSON.

import type {
  Ability,
  ActionCost,
  CardCriteria,
  CardDisposition,
  DieCriteria,
  Effect,
  EffectStep,
  ImmediateAbility,
  PlayCondition,
  SearchChoice,
  SearchDisposition,
  TargetSpec,
  TriggerEvent,
} from '@prophecy/protocol';
import { CARD_TYPES, COLORS, DIE_SYMBOLS, KNOWN_OPS } from '@prophecy/protocol';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { label } from './labels';

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
  'rerollDice', 'resolveDie', 'resolveWithoutRemoving',
  'rollDie', 'activateCharacter', 'exhaustCard', 'readyCard',
  'moveDamage', 'moveShields', 'discardCards', 'discardFromDeck', 'lookAtCards',
  'revealTopCard', 'playCard', 'returnToHand', 'takeBattlefieldControl',
  'claimBattlefield', 'endActionPhase', 'takeAdditionalActions', 'forceActivate',
  'grantKeyword', 'setAsideDie', 'placeDamageOnCard',
  'placeResourceOnCard', 'returnDefeatedCharacter', 'choice',
] as const;

type KnownOp = (typeof KNOWN_OPS)[number];
type StubOp = (typeof STUB_OPS)[number];
type OpKind = KnownOp | StubOp | 'new';

const TRIGGER_KINDS_WIRED = [
  'afterActivateCharacter', 'afterDealDamage', 'afterTakeDamage',
  'afterCharacterDefeated', 'afterPlayCard', 'afterClaimBattlefield', 'afterResolveDie',
  'beforeActivate', 'beforeTakeDamage',
] as const;

const TRIGGER_KINDS_STUB = [
  'afterActivateSupport', 'afterPlayUpgrade', 'afterDieRolledSymbol', 'afterRemoveDice',
  'beforeCharacterDefeated', 'beforeResolve', 'setup',
] as const;

const TRIGGER_KINDS = [...TRIGGER_KINDS_WIRED, ...TRIGGER_KINDS_STUB] as const;

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
    case 'immediate': return { kind: 'immediate', steps: [] };
    case 'triggered': return { kind: 'triggered', triggerEvent: { kind: 'afterActivateCharacter' }, steps: [] };
    case 'action': return { kind: 'action', costs: [{ kind: 'exhaust' }], steps: [] };
    case 'powerAction': return { kind: 'powerAction', costs: [], steps: [] };
    case 'special': return { kind: 'special', steps: [] };
    case 'passive': return { kind: 'passive', description: '' };
    case 'claim': return { kind: 'claim', steps: [] };
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
    case 'rollEventDie': return { op: 'rollEventDie' };
    case 'rollCardDie': return { op: 'rollCardDie', cardId: '' };
    case 'removeDie': return { op: 'removeDie', from: 'opponentPool', count: 1 };
    case 'turnDie': return { op: 'turnDie', from: 'opponentPool', toSymbol: 'blank', count: 1 };
    case 'modifyDieValue': return { op: 'modifyDieValue', from: 'ownPool', delta: 1, count: 1 };
    case 'searchDeck': return {
      op: 'searchDeck',
      source: 'ownDeck',
      revealCount: 5,
      choices: [],
      defaultDisposition: 'shuffleIntoDeck',
      optional: false,
    };
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
        <p className="text-xs italic text-muted-foreground">No abilities yet.</p>
      )}
      {abilities.map((ab, idx) => (
        <div key={idx} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Ability {idx + 1} · {label(ab.kind)}
            </span>
            <button type="button" onClick={() => remove(idx)}
              className="min-h-[32px] rounded border border-neutral-700 px-2 text-xs text-muted-foreground hover:border-red-700 hover:text-red-300">
              Remove
            </button>
          </div>
          <AbilityEditor ability={ab} onChange={(next) => replace(idx, next)} />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Add ability:</span>
        {ABILITY_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => add(k)}
            className="min-h-[36px] rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-foreground hover:border-neutral-500">
            + {label(k)}
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
        onChange={(c) => onChange({ ...ability, playCondition: c } as any)}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">After resolving:</span>
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
      <StepsList
        steps={ability.steps}
        onChange={(next) => onChange({ ...ability, steps: next })}
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
        onChange={(c) => onChange({ ...ability, playCondition: c } as any)}
      />
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch
          checked={ability.optional ?? false}
          onCheckedChange={(v) => onChange({ ...ability, optional: v === true })}
        />
        <span>Optional (player may skip)</span>
      </Label>
      <StepsList
        steps={ability.steps}
        onChange={(next) => onChange({ ...ability, steps: next })}
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
        onChange={(c) => onChange({ ...ability, playCondition: c } as any)}
      />
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch
          checked={ability.optional ?? false}
          onCheckedChange={(v) => onChange({ ...ability, optional: v === true })}
        />
        <span>Optional (player may skip)</span>
      </Label>
      <StepsList
        steps={ability.steps}
        onChange={(next) => onChange({ ...ability, steps: next })}
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
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch
          checked={ability.optional ?? false}
          onCheckedChange={(v) => onChange({ ...ability, optional: v === true })}
        />
        <span>Optional (player may skip)</span>
      </Label>
      <StepsList
        steps={ability.steps}
        onChange={(next) => onChange({ ...ability, steps: next })}
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
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch
          checked={ability.optional ?? false}
          onCheckedChange={(v) => onChange({ ...ability, optional: v === true })}
        />
        <span>Optional (player may skip)</span>
      </Label>
      <StepsList
        steps={ability.steps}
        onChange={(next) => onChange({ ...ability, steps: next })}
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
        className="text-xs text-muted-foreground hover:text-foreground underline">
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
            options={CONDITION_KINDS.map((k) => ({ value: k, label: label(k) }))}
            onChange={(k) => onChange(defaultCondition(k as PlayCondition['kind']))}
          />
          <button type="button" onClick={() => onChange(undefined)}
            className="text-xs text-muted-foreground hover:text-red-400">
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
    case 'spotCharacter': return { kind } as PlayCondition;
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
            onChange={(v) => onChange({ ...value, color: v || undefined } as any)} />
          <SelectField label="Unique" value={value.unique == null ? '' : String(value.unique)}
            options={[{ value: '', label: 'Any' }, { value: 'true', label: 'Unique only' }, { value: 'false', label: 'Non-unique only' }]}
            onChange={(v) => onChange({ ...value, unique: v === '' ? undefined : v === 'true' } as any)} />
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
      <Select
        value={value.kind}
        onValueChange={(v) => onChange(defaultTrigger(v as TriggerEvent['kind']))}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Wired — engine fires these</SelectLabel>
            {TRIGGER_KINDS_WIRED.map((k) => (
              <SelectItem key={k} value={k}>{label(k)}</SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Schema-only — not yet wired, won&apos;t fire</SelectLabel>
            {TRIGGER_KINDS_STUB.map((k) => (
              <SelectItem key={k} value={k}>{label(k)}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
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
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={value.ownOnly ?? true}
            onCheckedChange={(v) => onChange({ ...value, ownOnly: v === true })}
          />
          <span>Own cards only</span>
        </Label>
      );
    case 'afterPlayCard':
      return (
        <div className="flex flex-wrap gap-2">
          <SelectField label="Card type" value={value.cardType ?? ''}
            options={[{ value: '', label: 'Any type' }, ...CARD_TYPES.map((t) => ({ value: t, label: t }))]}
            onChange={(v) => onChange({ ...value, cardType: v || undefined } as any)} />
          <SelectField label="Color" value={value.color ?? ''}
            options={[{ value: '', label: 'Any color' }, ...COLORS.map((c) => ({ value: c, label: c }))]}
            onChange={(v) => onChange({ ...value, color: v || undefined } as any)} />
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
        <p className="text-xs italic text-muted-foreground">No costs (free action).</p>
      )}
      {costs.map((cost, idx) => (
        <div key={idx} className="flex flex-wrap items-start gap-2">
          <SelectField
            value={cost.kind}
            options={COST_KINDS.map((k) => ({ value: k, label: label(k) }))}
            onChange={(k) => replaceCost(idx, defaultCost(k as ActionCost['kind']))}
          />
          <ActionCostFields cost={cost} onChange={(next) => replaceCost(idx, next)} />
          <button type="button" onClick={() => removeCost(idx)}
            className="text-xs text-muted-foreground hover:text-red-400 mt-1">✕</button>
        </div>
      ))}
      <button type="button" onClick={addCost}
        className="min-h-[32px] rounded border border-neutral-800 px-2 text-xs text-muted-foreground hover:border-neutral-600">
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
// Steps list (replaces flat EffectsList — each step is an AND group)
// ────────────────────────────────────────────────────────────────────

function StepsList({ steps, onChange }: {
  steps: readonly EffectStep[];
  onChange: (next: EffectStep[]) => void;
}) {
  const addStep = () =>
    onChange([...steps, { effects: [defaultEffect('gainResources')] }]);

  const removeStep = (si: number) => onChange(steps.filter((_, i) => i !== si));

  const updateStep = (si: number, next: EffectStep) => {
    const out = steps.slice();
    out[si] = next;
    onChange(out);
  };

  const addEffectToStep = (si: number) => {
    const step = steps[si]!;
    updateStep(si, { ...step, effects: [...step.effects, defaultEffect('gainResources')] });
  };

  const removeEffectFromStep = (si: number, ei: number) => {
    const step = steps[si]!;
    const newEffects = step.effects.filter((_, i) => i !== ei);
    if (newEffects.length === 0) removeStep(si);
    else updateStep(si, { ...step, effects: newEffects });
  };

  const replaceEffect = (si: number, ei: number, next: Effect) => {
    const step = steps[si]!;
    const out = step.effects.slice();
    out[ei] = next;
    updateStep(si, { ...step, effects: out });
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-xs italic text-muted-foreground">No steps yet.</p>
      )}
      {steps.map((step, si) => (
        <div key={si} className="space-y-1">
          {si > 0 && (
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={step.then ?? false}
                onCheckedChange={(v) => updateStep(si, v === true ? { ...step, then: true } : { effects: step.effects })}
              />
              <span className="font-mono">Then ↳</span>
              {step.then && (
                <span className="ml-1 rounded bg-blue-900/50 px-1 py-0.5 text-xs text-blue-300">
                  gates on previous step
                </span>
              )}
            </Label>
          )}
          <div className={`rounded border p-2 space-y-2 ${step.then ? 'border-blue-800 bg-blue-950/20 ml-4' : 'border-neutral-800 bg-neutral-900/60'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {steps.length > 1
                  ? `Step ${si + 1}${step.effects.length > 1 ? ' (AND)' : ''}`
                  : step.effects.length > 1 ? 'Effects (AND)' : 'Effect'}
              </span>
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(si)}
                  className="text-xs text-muted-foreground hover:text-red-300">
                  Remove step
                </button>
              )}
            </div>
            {step.effects.map((fx, ei) => (
              <div key={ei} className="rounded border border-neutral-800 bg-neutral-900/60 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Select
                    value={fx.op}
                    onValueChange={(v) => replaceEffect(si, ei, defaultEffect(v as OpKind))}
                  >
                    <SelectTrigger className="h-9 flex-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Implemented</SelectLabel>
                        {KNOWN_OPS.map((o) => (
                          <SelectItem key={o} value={o}>{label(o)}</SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Stub — schema defined, not yet dispatched</SelectLabel>
                        {STUB_OPS.map((o) => (
                          <SelectItem key={o} value={o}>{label(o)}</SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel>Placeholder</SelectLabel>
                        <SelectItem value="new">(new) — op not yet in schema</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
                    <Switch
                      checked={'optional' in fx ? (fx.optional ?? false) : false}
                      onCheckedChange={(v) => replaceEffect(si, ei, { ...fx, optional: v === true } as Effect)}
                    />
                    <span>Optional</span>
                  </Label>
                  <button type="button" onClick={() => removeEffectFromStep(si, ei)}
                    className="min-h-[28px] rounded border border-neutral-800 px-2 text-xs text-muted-foreground hover:border-red-700 hover:text-red-300">
                    ✕
                  </button>
                </div>
                <EffectFields effect={fx} onChange={(next) => replaceEffect(si, ei, next)} />
              </div>
            ))}
            <button type="button" onClick={() => addEffectToStep(si)}
              className="min-h-[28px] rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-muted-foreground hover:border-neutral-500">
              + Add effect to step
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addStep}
        className="min-h-[36px] rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-foreground hover:border-neutral-500">
        + Add step
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
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={effect.amount === 'all'}
              onCheckedChange={(v) => onChange({ ...effect, amount: v === true ? 'all' : 1 })}
            />
            <span>All resources</span>
          </Label>
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
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={effect.toHandSize ?? false}
              onCheckedChange={(v) => onChange({ ...effect, toHandSize: v === true, amount: v === true ? null : 1 })}
            />
            <span>To hand size</span>
          </Label>
          {!effect.toHandSize && (
            <NumberField label="Amount" value={effect.amount ?? 1} min={1} max={20}
              onChange={(amount) => onChange({ ...effect, amount })} />
          )}
        </div>
      );
    case 'dealDamage':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <NumberField label="Amount" value={effect.amount} min={1} max={99}
              onChange={(amount) => onChange({ ...effect, amount })} />
            <SelectField label="Type" value={effect.damageType ?? 'unspecified'}
              options={[
                { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' },
                { value: 'indirect', label: 'Indirect' }, { value: 'unspecified', label: 'Unspecified' },
              ]}
              onChange={(v) => onChange({ ...effect, damageType: v } as any)} />
            <TargetPicker
              value={effect.target}
              options={['opponentCharacter', 'ownCharacter', 'anyCharacter', 'eachOpponentCharacter', 'eachCharacter']}
              onChange={(t) => onChange({ ...effect, target: t })}
            />
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={effect.unblockable ?? false}
                onCheckedChange={(v) => onChange({ ...effect, unblockable: v === true })}
              />
              <span>Unblockable</span>
            </Label>
          </div>
          <CardCriteriaEditor value={effect.criteria} onChange={(c) => onChange(patchEffect(effect, { criteria: c }))} />
        </div>
      );
    case 'addShields':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <NumberField label="Amount" value={effect.amount} min={1} max={3}
              onChange={(amount) => onChange({ ...effect, amount })} />
            <TargetPicker
              value={effect.target}
              options={['ownCharacter', 'opponentCharacter', 'anyCharacter', 'eachOpponentCharacter', 'eachCharacter']}
              onChange={(t) => onChange({ ...effect, target: t })}
            />
          </div>
          <CardCriteriaEditor value={effect.criteria} onChange={(c) => onChange(patchEffect(effect, { criteria: c }))} />
        </div>
      );
    case 'removeShields':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <TargetPicker
              value={effect.target}
              options={['anyCharacter', 'opponentCharacter', 'ownCharacter', 'eachOpponentCharacter', 'eachCharacter']}
              onChange={(t) => onChange({ ...effect, target: t })}
            />
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={effect.amount === 'all'}
                onCheckedChange={(v) => onChange({ ...effect, amount: v === true ? 'all' : 1 })}
              />
              <span>All shields</span>
            </Label>
            {effect.amount !== 'all' && (
              <NumberField label="Amount" value={effect.amount as number} min={1} max={3}
                onChange={(amount) => onChange({ ...effect, amount })} />
            )}
          </div>
          <CardCriteriaEditor value={effect.criteria} onChange={(c) => onChange(patchEffect(effect, { criteria: c }))} />
        </div>
      );
    case 'healDamage':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <NumberField label="Amount" value={effect.amount} min={1} max={99}
              onChange={(amount) => onChange({ ...effect, amount })} />
            <TargetPicker
              value={effect.target}
              options={['ownCharacter', 'anyCharacter', 'opponentCharacter']}
              onChange={(t) => onChange({ ...effect, target: t })}
            />
          </div>
          <CardCriteriaEditor value={effect.criteria} onChange={(c) => onChange(patchEffect(effect, { criteria: c }))} />
        </div>
      );
    case 'rollEventDie':
      return (
        <p className="text-xs text-muted-foreground">
          Rolls this event card's own die (from its <code>dieFaces</code>) and adds it to the active player's pool as a transient die.
        </p>
      );
    case 'rollCardDie':
      return (
        <TextField
          label="Card ID (catalog ID whose die to roll, e.g. CHAR_003)"
          value={(effect as { op: 'rollCardDie'; cardId: string }).cardId}
          onChange={(v) => onChange({ ...effect, cardId: v } as Effect)}
        />
      );
    case 'removeDie': {
      const e = effect as { op: 'removeDie'; from: string; criteria?: DieCriteria; count?: number };
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SelectField label="From" value={e.from}
              options={[{ value: 'opponentPool', label: "Opponent's pool" }, { value: 'ownPool', label: 'Own pool' }]}
              onChange={(v) => onChange({ ...e, from: v } as Effect)} />
            <NumberField label="Count" value={e.count ?? 1} min={1} max={20}
              onChange={(count) => onChange({ ...e, count } as Effect)} />
          </div>
          <DieCriteriaEditor value={e.criteria} onChange={(c) => onChange(patchEffect(e, { criteria: c }))} />
        </div>
      );
    }
    case 'turnDie': {
      const e = effect as { op: 'turnDie'; from: string; toSymbol: string; criteria?: DieCriteria; count?: number };
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SelectField label="From" value={e.from}
              options={[{ value: 'opponentPool', label: "Opponent's pool" }, { value: 'ownPool', label: 'Own pool' }]}
              onChange={(v) => onChange({ ...e, from: v } as Effect)} />
            <SelectField label="Turn to symbol" value={e.toSymbol}
              options={DIE_SYMBOLS.map((s) => ({ value: s, label: s }))}
              onChange={(v) => onChange({ ...e, toSymbol: v } as Effect)} />
            <NumberField label="Count" value={e.count ?? 1} min={1} max={20}
              onChange={(count) => onChange({ ...e, count } as Effect)} />
          </div>
          <DieCriteriaEditor value={e.criteria} onChange={(c) => onChange(patchEffect(e, { criteria: c }))} />
        </div>
      );
    }
    case 'modifyDieValue': {
      const e = effect as { op: 'modifyDieValue'; from: string; delta: number; criteria?: DieCriteria; count?: number };
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SelectField label="From" value={e.from}
              options={[{ value: 'ownPool', label: 'Own pool' }, { value: 'opponentPool', label: "Opponent's pool" }]}
              onChange={(v) => onChange({ ...e, from: v } as Effect)} />
            <NumberField label="Delta (±)" value={e.delta} min={-20} max={20}
              onChange={(delta) => onChange({ ...e, delta } as Effect)} />
            <NumberField label="Count" value={e.count ?? 1} min={1} max={20}
              onChange={(count) => onChange({ ...e, count } as Effect)} />
          </div>
          <DieCriteriaEditor value={e.criteria} onChange={(c) => onChange(patchEffect(e, { criteria: c }))} />
        </div>
      );
    }
    case 'searchDeck': {
      type SearchDeckRaw = {
        op: 'searchDeck';
        source: 'ownDeck' | 'opponentDeck';
        revealCount: number | 'all';
        choices: SearchChoice[];
        defaultDisposition: SearchDisposition;
        optional: boolean;
      };
      const e = effect as unknown as SearchDeckRaw;
      const dispositionOptions: { value: SearchDisposition; label: string }[] = [
        { value: 'toHand', label: 'To hand' },
        { value: 'toTopOfDeck', label: 'Top of deck' },
        { value: 'toBottomOfDeck', label: 'Bottom of deck' },
        { value: 'shuffleIntoDeck', label: 'Shuffle in' },
        { value: 'discard', label: 'Discard' },
      ];
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <SelectField label="Source" value={e.source}
              options={[{ value: 'ownDeck', label: 'Own deck' }, { value: 'opponentDeck', label: "Opponent's deck" }]}
              onChange={(v) => onChange({ ...e, source: v } as Effect)} />
            <SelectField label="Reveal count" value={e.revealCount === 'all' ? 'all' : String(e.revealCount)}
              options={[
                { value: 'all', label: 'All' },
                ...([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) }))),
              ]}
              onChange={(v) => onChange({ ...e, revealCount: v === 'all' ? 'all' : Number(v) } as Effect)} />
            <SelectField label="Default disposition" value={e.defaultDisposition}
              options={dispositionOptions}
              onChange={(v) => onChange({ ...e, defaultDisposition: v as SearchDisposition } as Effect)} />
            <BoolField label="Optional" value={e.optional ?? false}
              onChange={(v) => onChange({ ...e, optional: v } as Effect)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Choices</p>
            {e.choices.map((ch, i) => (
              <div key={i} className="flex flex-wrap gap-2 rounded border border-neutral-700 p-2">
                <NumberField label="Count" value={ch.count} min={1} max={20}
                  onChange={(count) => {
                    const choices = e.choices.map((c, j) => j === i ? { ...c, count } : c);
                    onChange({ ...e, choices } as Effect);
                  }} />
                <SelectField label="Disposition" value={ch.disposition}
                  options={dispositionOptions}
                  onChange={(v) => {
                    const choices = e.choices.map((c, j) => j === i ? { ...c, disposition: v as SearchDisposition } : c);
                    onChange({ ...e, choices } as Effect);
                  }} />
                <button type="button" onClick={() => {
                  const choices = e.choices.filter((_, j) => j !== i);
                  onChange({ ...e, choices } as Effect);
                }} className="self-end rounded bg-red-900/40 px-2 py-1 text-xs text-destructive hover:bg-red-800/60">
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={() => {
              const choices = [...e.choices, { count: 1, disposition: 'toHand' as SearchDisposition }];
              onChange({ ...e, choices } as Effect);
            }} className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600">
              + Add choice
            </button>
          </div>
        </div>
      );
    }
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
        <p className="text-xs italic text-muted-foreground">
          Stub op — schema defined, not yet dispatched. Card will parse cleanly but this effect
          throws <code className="text-muted-foreground">NotImplementedError</code> at runtime until the
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
      options={options.map((k) => ({ value: k, label: label(k) }))}
      onChange={(k) => onChange({ kind: k as TargetSpec['kind'] })}
    />
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-neutral-800/60 p-2 space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function SelectField({ label: fieldLabel, value, options, onChange }: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {fieldLabel && <span>{fieldLabel}</span>}
      <Select
        value={value === '' ? '__none__' : value}
        onValueChange={(v) => onChange(v === '__none__' ? '' : v)}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || '__none__'} value={o.value || '__none__'}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}

function NumberField({ label: fieldLabel, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  return (
    <Label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span>{fieldLabel}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 w-24 text-sm"
      />
    </Label>
  );
}

function TextField({ label: fieldLabel, value, onChange, multiline = false }: {
  label: string; value: string; onChange: (s: string) => void; multiline?: boolean;
}) {
  return (
    <Label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span>{fieldLabel}</span>
      {multiline ? (
        <Textarea
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      ) : (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}
    </Label>
  );
}

// Tristate select: "—" (undefined), "Yes" (true), "No" (false)
function BoolField({ label, value, onChange }: {
  label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void;
}) {
  const strVal = value === undefined ? '__none__' : value ? 'true' : 'false';
  return (
    <SelectField label={label} value={strVal}
      options={[{ value: '__none__', label: '—' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
      onChange={(v) => onChange(v === '__none__' ? undefined : v === 'true')} />
  );
}

// Optional numeric field: shows "—" when undefined, or the number value.
function OptNumberField({ label: fieldLabel, value, min, max, onChange }: {
  label: string; value: number | undefined; min: number; max: number;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <Label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span>{fieldLabel}</span>
      <Input
        type="number"
        min={min}
        max={max}
        placeholder="—"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="h-9 w-20 text-sm"
      />
    </Label>
  );
}

// Merge a patch (which may contain undefined values) onto an effect,
// deleting keys set to undefined rather than assigning undefined.
// Needed because exactOptionalPropertyTypes disallows { key: undefined }.
function patchEffect(base: unknown, patch: Record<string, unknown>): Effect {
  const result = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete result[k];
    else result[k] = v;
  }
  return result as Effect;
}

function DieCriteriaEditor({ value, onChange }: {
  value: DieCriteria | undefined;
  onChange: (c: DieCriteria | undefined) => void;
}) {
  const c = value ?? {};
  const set = (patch: Record<string, unknown>) => {
    const next = { ...c } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange(Object.keys(next).length > 0 ? next as DieCriteria : undefined);
  };
  const symVal = Array.isArray(c.symbol) ? c.symbol[0] ?? '' : c.symbol ?? '';
  return (
    <Section label="Die criteria (optional — all fields AND together)">
      <div className="flex flex-wrap gap-2">
        <SelectField label="Symbol" value={symVal}
          options={[{ value: '', label: 'Any' }, ...DIE_SYMBOLS.map((s) => ({ value: s, label: s }))]}
          onChange={(v) => set({ symbol: v || undefined })} />
        <OptNumberField label="Min value" value={c.minValue} min={0} max={20}
          onChange={(v) => set({ minValue: v })} />
        <OptNumberField label="Max value" value={c.maxValue} min={0} max={20}
          onChange={(v) => set({ maxValue: v })} />
        <BoolField label="Modifier face" value={c.modifier} onChange={(v) => set({ modifier: v })} />
        <SelectField label="Owner type" value={Array.isArray(c.ownerCardType) ? '' : c.ownerCardType ?? ''}
          options={[{ value: '', label: 'Any' }, ...CARD_TYPES.map((t) => ({ value: t, label: t }))]}
          onChange={(v) => set({ ownerCardType: v || undefined })} />
        <SelectField label="Owner color" value={Array.isArray(c.ownerColor) ? '' : c.ownerColor ?? ''}
          options={[{ value: '', label: 'Any' }, ...COLORS.map((col) => ({ value: col, label: col }))]}
          onChange={(v) => set({ ownerColor: v || undefined })} />
        <TextField label="Owner subtype" value={c.ownerSubtype ?? ''}
          onChange={(v) => set({ ownerSubtype: v || undefined })} />
      </div>
    </Section>
  );
}

function CardCriteriaEditor({ value, onChange }: {
  value: CardCriteria | undefined;
  onChange: (c: CardCriteria | undefined) => void;
}) {
  const c = value ?? {};
  const set = (patch: Record<string, unknown>) => {
    const next = { ...c } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    onChange(Object.keys(next).length > 0 ? next as CardCriteria : undefined);
  };
  const colVal = Array.isArray(c.color) ? '' : c.color ?? '';
  const subVal = Array.isArray(c.subtype) ? c.subtype[0] ?? '' : c.subtype ?? '';
  return (
    <Section label="Card criteria (optional — all fields AND together)">
      <div className="flex flex-wrap gap-2">
        <TextField label="Subtype" value={subVal} onChange={(v) => set({ subtype: v || undefined })} />
        <SelectField label="Color" value={colVal}
          options={[{ value: '', label: 'Any' }, ...COLORS.map((col) => ({ value: col, label: col }))]}
          onChange={(v) => set({ color: v || undefined })} />
        <BoolField label="Unique" value={c.unique} onChange={(v) => set({ unique: v })} />
        <BoolField label="Exhausted" value={c.exhausted} onChange={(v) => set({ exhausted: v })} />
        <BoolField label="Has upgrade" value={c.hasUpgrade} onChange={(v) => set({ hasUpgrade: v })} />
        <OptNumberField label="Min health" value={c.minHealth} min={0} max={99}
          onChange={(v) => set({ minHealth: v })} />
        <OptNumberField label="Max damage" value={c.maxDamage} min={0} max={99}
          onChange={(v) => set({ maxDamage: v })} />
      </div>
    </Section>
  );
}
