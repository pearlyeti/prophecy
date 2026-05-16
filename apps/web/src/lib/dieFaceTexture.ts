// Shared die face texture generator used by the board dice (DicePool3D).
// Produces a 512×512 CanvasTexture with the die's value and symbol on the card's base color.
//
// UV layout notes: with DIE_RADIUS=0.16 on a 0.8-unit die, the chamfered edges
// consume ~20% of UV space on each side. Keep all text within canvas y=[15%, 75%]
// to stay on the flat face and avoid the curved edges.

import * as THREE from 'three';

export const CARD_COLORS: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#ef4444', text: '#ffffff' },
  blue:   { bg: '#3b82f6', text: '#ffffff' },
  yellow: { bg: '#facc15', text: '#1c1917' },
  gray:   { bg: '#9ca3af', text: '#1c1917' },
};
export const FALLBACK_COLOR = { bg: '#a8a29e', text: '#1c1917' };

// Short abbreviations — used in the face-picker UI buttons (very small text).
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

// Full words for the 3D die face texture.
function faceWord(s: string): string {
  switch (s) {
    case 'melee':    return 'Melee';
    case 'ranged':   return 'Ranged';
    case 'indirect': return 'Indirect';
    case 'shield':   return 'Shield';
    case 'resource': return 'Resource';
    case 'disrupt':  return 'Disrupt';
    case 'discard':  return 'Discard';
    case 'draw':     return 'Draw';
    case 'focus':    return 'Focus';
    case 'modifier': return 'Modifier';
    default:         return '';
  }
}

// Sets ctx.font and returns the size that fits text within maxWidth.
function fittedSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  weight: string,
): number {
  ctx.font = `${weight} ${startSize}px ui-sans-serif, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w <= maxWidth) return startSize;
  return Math.floor(startSize * (maxWidth / w));
}

export function makeFaceTexture(
  symbol: string,
  value: number,
  modifier: boolean,
  baseColor: string,
  textColor: string,
): THREE.CanvasTexture {
  // 512×512 gives enough mipmap headroom to stay legible at small on-screen sizes.
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;

  // Background
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);
  const grad = ctx.createRadialGradient(S * 0.35, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Safe content zone: canvas y = [15%, 75%] avoids the chamfered edge UV regions.
  // The pair is centered on CENTER_Y; GAP separates the two baselines.
  const CENTER_Y = Math.round(S * 0.44);
  const maxW     = Math.round(S * 0.80);
  const GAP      = Math.round(S * 0.04);
  // Value is 1.5× the label: 0.30 / 0.20 = 1.5
  const V_MAX    = Math.round(S * 0.30); // ~154 px
  const L_MAX    = Math.round(S * 0.20); // ~102 px

  if (symbol === 'blank') {
    // intentionally empty

  } else if (symbol === 'special') {
    const size = fittedSize(ctx, 'Special', maxW, Math.round(S * 0.22), 'bold');
    ctx.font = `bold ${size}px ui-sans-serif, sans-serif`;
    ctx.fillText('Special', S / 2, CENTER_Y);

  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label    = faceWord(symbol);

    if (valueStr && label) {
      const vSize = fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      const lSize = fittedSize(ctx, label,    maxW, L_MAX, '');

      // yValue / yLabel derived so the pair is centered on CENTER_Y:
      //   block top    = yValue − vSize/2
      //   block bottom = yLabel + lSize/2
      //   center       = CENTER_Y  (proof: cancels identically)
      const yValue = CENTER_Y - GAP / 2 - lSize / 2;
      const yLabel = CENTER_Y + GAP / 2 + vSize / 2;

      ctx.font = `bold ${vSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(valueStr, S / 2, yValue);

      ctx.globalAlpha = 0.85;
      ctx.font = `${lSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(label, S / 2, yLabel);
      ctx.globalAlpha = 1;

    } else if (valueStr) {
      const vSize = fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      ctx.font = `bold ${vSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(valueStr, S / 2, CENTER_Y);

    } else if (label) {
      const lSize = fittedSize(ctx, label, maxW, L_MAX, '');
      ctx.font = `${lSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(label, S / 2, CENTER_Y);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}
