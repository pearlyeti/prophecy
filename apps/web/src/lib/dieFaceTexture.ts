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
  //
  // Safe canvas_x zone (flat face): [~15%, ~75%] = [77, 384].
  // Perspective asymmetry: the near edge of the die appears larger, so 25% at bottom
  // vs 15% at top. The flat-face center is therefore at 45% of S, not 50%.
  // Centering content at CTR=S*0.45 makes the block symmetric within [77, 384].
  //
  // Safe canvas_y zone (text width along die horizontal): [~20%, ~80%] → maxW = 0.60*S

  const CTR    = Math.round(S * 0.45); // actual flat-face center in canvas_x
  const maxW   = Math.round(S * 0.60); // max text extent along die horizontal
  const V_MAX  = Math.round(S * 0.35); // max value font
  const L_MAX  = Math.round(S * 0.22); // max label font (bold; ~63% of V_MAX → ~50% larger value)
  const GAP    = Math.round(S * 0.03); // gap between value and label

  if (symbol === 'blank') {
    // intentionally empty

  } else if (symbol === 'special') {
    const size = fittedSize(ctx, 'Special', maxW, Math.round(S * 0.26), 'bold');
    ctx.font = `bold ${size}px ui-sans-serif, sans-serif`;
    drawRotated(ctx, 'Special', CTR, S / 2);

  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label    = faceWord(symbol);

    if (valueStr && label) {
      const vSize = fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      const lSize = fittedSize(ctx, label,    maxW, L_MAX, 'bold');

      // Center the block at CTR (45% of S = flat-face center).
      // Block top  = vCX - vSize/2, bot = lCX + lSize/2, center = CTR.
      const half = Math.round(GAP / 2);
      const vCX = CTR - half - Math.round(lSize / 2);
      const lCX = CTR + half + Math.round(vSize / 2);

      ctx.font = `bold ${vSize}px ui-sans-serif, sans-serif`;
      drawRotated(ctx, valueStr, vCX, S / 2);

      ctx.font = `bold ${lSize}px ui-sans-serif, sans-serif`;
      drawRotated(ctx, label, lCX, S / 2);

    } else if (valueStr) {
      fittedSize(ctx, valueStr, maxW, V_MAX, 'bold');
      drawRotated(ctx, valueStr, CTR, S / 2);

    } else if (label) {
      fittedSize(ctx, label, maxW, L_MAX, 'bold');
      drawRotated(ctx, label, CTR, S / 2);
    }
  }

  const texture = new THREE.CanvasTexture(c);
  texture.anisotropy = 4;
  return texture;
}
