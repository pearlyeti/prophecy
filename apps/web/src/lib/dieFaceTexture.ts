// Shared die face texture generator used by the board dice (DicePool3D).
// Produces a 512×512 CanvasTexture with the die's value and symbol on the card's base color.

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

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);

  const grad = ctx.createRadialGradient(S * 0.35, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';

  if (symbol === 'blank') {
    // intentionally empty
  } else if (symbol === 'special') {
    ctx.font = `bold ${Math.round(S * 0.25)}px ui-sans-serif, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Special', S / 2, S / 2);
  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label = faceWord(symbol);
    const valueFont = Math.round(S * 0.33);
    const labelFont = Math.round(S * 0.22);
    const GAP = Math.round(S * 0.03);

    if (valueStr) {
      // Center the value+label block vertically: yValue is the em-midpoint of the number,
      // yLabel is the em-midpoint of the word. Together they're centered on S/2.
      const yValue = (S - GAP - labelFont) / 2;
      const yLabel = S / 2 + GAP / 2 + valueFont / 2;

      ctx.font = `bold ${valueFont}px ui-sans-serif, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(valueStr, S / 2, yValue);

      if (label) {
        ctx.globalAlpha = 0.85;
        ctx.font = `${labelFont}px ui-sans-serif, sans-serif`;
        ctx.fillText(label, S / 2, yLabel);
        ctx.globalAlpha = 1;
      }
    } else if (label) {
      // No value (e.g. value=0, non-modifier) — just show the label centered.
      ctx.font = `${labelFont}px ui-sans-serif, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, S / 2, S / 2);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}
