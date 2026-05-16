// Shared die face texture generator used by the board dice (DicePool3D).
// Produces a 512×512 CanvasTexture with the die's value and symbol on the card base color.
//
// UV orientation: RoundedBoxGeometry maps canvas_y → die horizontal axis and
// canvas_x → die vertical axis (as seen from the overhead camera). All text is
// therefore drawn at canvas_y = S/2 (die center horizontally) and at varying
// canvas_x positions (die vertical placement), rotated 90° CW so characters
// appear upright when the UV axes are applied.

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

// Measures text at startSize and scales down to fit maxWidth; returns the used size.
// ctx.font is set to the returned size before returning.
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

// Draws text centered at (cx, cy) rotated 90° CW — compensates for the
// RoundedBoxGeometry UV rotation so the text appears upright on the die face.
function drawRotated(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
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

  // Background
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, S, S);
  const grad = ctx.createRadialGradient(S * 0.35, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.7);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  ctx.fillStyle = textColor;

  // UV axis mapping:
  //   canvas_y = S/2  → die center horizontally
  //   canvas_x        → die vertical position (canvas_x/S = fraction from die top)
  // Safe canvas_x zone for the flat face: [~15%, ~75%] of S = [77, 384]
  // Safe canvas_y zone (text width along die horizontal): [~20%, ~80%] of S → maxW = 0.60*S

  const maxW   = Math.round(S * 0.60); // max text extent along die horizontal
  const V_MAX  = Math.round(S * 0.28); // max value font (sets die-vertical height of value)
  const L_MAX  = Math.round(S * 0.18); // max label font
  const GAP    = Math.round(S * 0.04); // gap between value and label on die vertical axis

  if (symbol === 'blank') {
    // intentionally empty

  } else if (symbol === 'special') {
    const size = fittedSize(ctx, 'Special', maxW, Math.round(S * 0.22), 'bold');
    ctx.font = `bold ${size}px ui-sans-serif, sans-serif`;
    drawRotated(ctx, 'Special', S / 2, S / 2);

  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label    = faceWord(symbol);

    if (valueStr && label) {
      const vSize = fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      const lSize = fittedSize(ctx, label,    maxW, L_MAX, '');

      // Center the value+label block on die vertical axis (canvas_x = S/2 = die center).
      // Block visual top  = vCX - vSize/2
      // Block visual bot  = lCX + lSize/2
      // Center            = (top + bot)/2 = S/2  ← verified algebraically
      const vCX = S / 2 - GAP / 2 - lSize / 2;
      const lCX = S / 2 + GAP / 2 + vSize / 2;

      ctx.font = `bold ${vSize}px ui-sans-serif, sans-serif`;
      drawRotated(ctx, valueStr, vCX, S / 2);

      ctx.globalAlpha = 0.85;
      ctx.font = `${lSize}px ui-sans-serif, sans-serif`;
      drawRotated(ctx, label, lCX, S / 2);
      ctx.globalAlpha = 1;

    } else if (valueStr) {
      fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      drawRotated(ctx, valueStr, S / 2, S / 2);

    } else if (label) {
      fittedSize(ctx, label, maxW, L_MAX, '');
      drawRotated(ctx, label, S / 2, S / 2);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}
