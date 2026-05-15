// Shared die face texture generator used by the board dice (DicePool3D).
// Produces a 128×128 CanvasTexture with the
// die's value and symbol abbreviation on the card's base color.

import * as THREE from 'three';

export const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#ef4444', text: '#ffffff' },
  blue:   { bg: '#3b82f6', text: '#ffffff' },
  yellow: { bg: '#facc15', text: '#1c1917' },
  gray:   { bg: '#9ca3af', text: '#1c1917' },
};
export const FALLBACK_COLOR = { bg: '#a8a29e', text: '#1c1917' };

export function symLabel(s: string): string {
  switch (s) {
    case 'melee':    return 'MEL';
    case 'ranged':   return 'RNG';
    case 'indirect': return 'IND';
    case 'shield':   return 'SHD';
    case 'resource': return 'RES';
    case 'disrupt':  return 'DSR';
    case 'discard':  return 'DSC';
    case 'draw':     return 'DRW';
    case 'focus':    return 'FOC';
    case 'special':  return 'S';
    case 'modifier': return 'MOD';
    case 'blank':    return '';
    default:         return s.slice(0, 3).toUpperCase();
  }
}

export function makeFaceTexture(
  symbol: string,
  value: number,
  modifier: boolean,
  baseColor: string,
  textColor: string,
): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  const grad = ctx.createRadialGradient(S * 0.35, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  const valueStr = symbol === 'blank' ? '—' : `${modifier ? '+' : ''}${value > 0 ? value : ''}`;
  ctx.fillStyle = textColor;
  ctx.font = `bold ${Math.round(S * 0.38)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(valueStr, S / 2, S * 0.58);

  const sym = symLabel(symbol);
  if (sym) {
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = textColor;
    ctx.font = `${Math.round(S * 0.22)}px ui-sans-serif, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(sym, S / 2, S * 0.86);
    ctx.globalAlpha = 1;
  }

  return new THREE.CanvasTexture(c);
}
