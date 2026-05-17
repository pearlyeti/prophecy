import type { Color } from '@prophecy/protocol';

export const CARD_COLOR_HEX: Record<Color, { bg: string; text: string }> = {
  red:    { bg: '#ef4444', text: '#ffffff' },
  blue:   { bg: '#3b82f6', text: '#ffffff' },
  yellow: { bg: '#facc15', text: '#1c1917' },
  gray:   { bg: '#9ca3af', text: '#1c1917' },
};

export const DIE_SYMBOL_CLS: Record<string, string> = {
  melee:    'bg-red-900 text-red-200',
  ranged:   'bg-orange-900 text-orange-200',
  shield:   'bg-blue-900 text-blue-200',
  resource: 'bg-green-900 text-green-200',
  disrupt:  'bg-purple-900 text-purple-200',
  focus:    'bg-yellow-900 text-yellow-100',
  discard:  'bg-neutral-700 text-neutral-300',
  modifier: 'bg-neutral-700 text-neutral-300',
};

export const RING = {
  valid:            'border-emerald-500 ring-2 ring-emerald-500/60',
  hoverValid:       'border-emerald-400 ring-2 ring-emerald-400/80 scale-105',
  invalid:          'border-neutral-700 opacity-40',
  hoverInvalid:     'border-red-400 ring-2 ring-red-400/80',
  targetDamage:     'border-red-500 ring-2 ring-red-500/60',
  targetShield:     'border-blue-500 ring-2 ring-blue-500/60',
  activateEligible: 'border-emerald-500 ring-1 ring-emerald-500/60',
  reroll:           'border-amber-500 ring-1 ring-amber-500/50',
  opponentPreview:  'border-sky-500/50 ring-1 ring-sky-500/30',
  pendingPreview:   'border-amber-500/50 ring-1 ring-amber-500/30',
} as const satisfies Record<string, string>;

export type RingState = keyof typeof RING;
