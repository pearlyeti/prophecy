// Dev-only preview page — visit /dice-preview to see all die face textures.
// No auth or game state required.

import { useEffect, useRef } from 'react';
import { makeFaceTexture, CARD_COLORS, FALLBACK_COLOR } from '../lib/dieFaceTexture.js';

type FaceSpec = { symbol: string; value: number; modifier: boolean; label: string };

const FACES: FaceSpec[] = [
  { symbol: 'melee',    value: 3, modifier: false, label: '3 Melee' },
  { symbol: 'melee',    value: 1, modifier: false, label: '1 Melee' },
  { symbol: 'ranged',   value: 2, modifier: false, label: '2 Ranged' },
  { symbol: 'shield',   value: 2, modifier: false, label: '2 Shield' },
  { symbol: 'resource', value: 1, modifier: false, label: '1 Resource' },
  { symbol: 'focus',    value: 1, modifier: false, label: '1 Focus' },
  { symbol: 'indirect', value: 1, modifier: false, label: '1 Indirect' },
  { symbol: 'disrupt',  value: 1, modifier: false, label: '1 Disrupt' },
  { symbol: 'discard',  value: 1, modifier: false, label: '1 Discard' },
  { symbol: 'draw',     value: 1, modifier: false, label: '1 Draw' },
  { symbol: 'modifier', value: 2, modifier: true,  label: '+2 Modifier' },
  { symbol: 'special',  value: 0, modifier: false, label: 'Special' },
  { symbol: 'blank',    value: 0, modifier: false, label: 'Blank' },
];

const COLORS = [
  { key: 'red',    ...CARD_COLORS['red']! },
  { key: 'blue',   ...CARD_COLORS['blue']! },
  { key: 'yellow', ...CARD_COLORS['yellow']! },
  { key: 'gray',   ...CARD_COLORS['gray']! },
];

function FaceCanvas({ spec, bg, text }: { spec: FaceSpec; bg: string; text: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const texture = makeFaceTexture(spec.symbol, spec.value, spec.modifier, bg, text);
    const src = (texture.image as HTMLCanvasElement);
    const dst = ref.current!;
    dst.width  = src.width;
    dst.height = src.height;
    dst.getContext('2d')!.drawImage(src, 0, 0);
    texture.dispose();
  }, [spec, bg, text]);

  return (
    <canvas
      ref={ref}
      style={{ width: 120, height: 120, borderRadius: 16, display: 'block' }}
    />
  );
}

export function DicePreview() {
  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: 32, fontFamily: 'sans-serif', color: '#eee' }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>Die face texture preview</h1>
      <p style={{ marginBottom: 32, fontSize: 13, color: '#888' }}>
        This is the raw 512×512 canvas texture, scaled to 120px — the 3D die sees the same pixels.
      </p>
      {COLORS.map(({ key, bg, text }) => (
        <div key={key} style={{ marginBottom: 40 }}>
          <h2 style={{ marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>
            {key}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {FACES.map((spec) => (
              <div key={spec.label} style={{ textAlign: 'center' }}>
                <FaceCanvas spec={spec} bg={bg} text={text} />
                <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>{spec.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
