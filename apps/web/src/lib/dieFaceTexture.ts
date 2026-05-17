// 512×512 canvas texture for one die face: text drawn upright at the center.
// No rotation, offset, or mirror knobs — the canvas IS the face image.
// DicePool3D orients each face by rotating its plane mesh, not the texture.

import * as THREE from 'three';

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
  const size = Math.floor(startSize * (maxWidth / w));
  ctx.font = `${weight} ${size}px ui-sans-serif, sans-serif`;
  return size;
}

export function makeFaceTexture(
  symbol: string,
  value: number,
  modifier: boolean,
  baseColor: string,
  textColor: string,
): THREE.CanvasTexture {
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
  ctx.textBaseline = 'middle';

  const CTR   = S / 2;
  const GAP   = Math.round(S * 0.04);
  const V_MAX = Math.round(S * 0.42);
  const L_MAX = Math.round(S * 0.26);
  const maxW  = Math.round(S * 0.78);

  if (symbol === 'blank') {
    // intentionally empty

  } else if (symbol === 'special') {
    fittedSize(ctx, 'Special', maxW, L_MAX, 'bold');
    ctx.fillText('Special', S / 2, CTR);

  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label    = faceWord(symbol);

    if (valueStr && label) {
      const vSize = fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      const lSize = fittedSize(ctx, label,    maxW, L_MAX, '600');

      const yValue = CTR - Math.round((GAP + lSize) / 2);
      const yLabel = CTR + Math.round((GAP + vSize) / 2);

      ctx.font = `bold ${vSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(valueStr, S / 2, yValue);

      ctx.font = `600 ${lSize}px ui-sans-serif, sans-serif`;
      ctx.fillText(label, S / 2, yLabel);

    } else if (valueStr) {
      fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      ctx.fillText(valueStr, S / 2, CTR);

    } else if (label) {
      fittedSize(ctx, label, maxW, L_MAX, '600');
      ctx.fillText(label, S / 2, CTR);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}
