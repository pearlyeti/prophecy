// Dev-only preview at /dice-preview:
//   • 3D verification row — production Die3D × 6, each pinned to a different
//     face on top with distinct content per slot. If any slot's label is
//     misoriented, the geometry's wrong; if every slot's text is upright and
//     centered, the architecture works.
//   • 2D canvas grid — every face symbol × card color, for sanity-checking
//     the texture content (fonts, fitting, colors).
//
// No production code paths are touched. This page lives outside the auth /
// trpc / socket providers (per PR #80), so its Canvas is isolated.

import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useRef } from 'react';
import type { DieFace, DieInPool, DieSymbol } from '@prophecy/game-engine';

import { makeFaceTexture } from '../lib/dieFaceTexture.js';
import { CARD_COLOR_HEX } from '../lib/tokens.js';

// Lazy: keeps DicePool3D (+ three.js, r3f, drei) out of the main bundle so
// Game.tsx's own lazy import of DicePool3D actually code-splits.
const Die3D = lazy(() => import('./DicePool3D.js').then((m) => ({ default: m.Die3D })));

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
  { key: 'red',    ...CARD_COLOR_HEX['red'] },
  { key: 'blue',   ...CARD_COLOR_HEX['blue'] },
  { key: 'yellow', ...CARD_COLOR_HEX['yellow'] },
  { key: 'gray',   ...CARD_COLOR_HEX['gray'] },
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

// ── 3D verification ──────────────────────────────────────────────────────────
//
// Six distinct faces so it's obvious at a glance which slot (if any) is
// misoriented. Each die has its overrideFaceIndex pinned to a different slot
// 0..5, so the row reads: slot 0 on top, slot 1 on top, … slot 5 on top.

const VERIFY_FACES: readonly DieFace[] = [
  { symbol: 'melee'    as DieSymbol, value: 1, cost: 0, modifier: false },
  { symbol: 'ranged'   as DieSymbol, value: 2, cost: 0, modifier: false },
  { symbol: 'shield'   as DieSymbol, value: 3, cost: 0, modifier: false },
  { symbol: 'resource' as DieSymbol, value: 4, cost: 0, modifier: false },
  { symbol: 'focus'    as DieSymbol, value: 5, cost: 0, modifier: false },
  { symbol: 'disrupt'  as DieSymbol, value: 6, cost: 0, modifier: false },
];

function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}

function VerificationRow({ bg, text }: { bg: string; text: string }) {
  const dice: readonly DieInPool[] = VERIFY_FACES.map((face, i) => ({
    instanceId: `verify-${i}`,
    cardId: 'verify',
    faceIndex: i,
    face,
  }));
  return (
    <div style={{ width: '100%', maxWidth: 1000, height: 200, background: '#1a1a1a', borderRadius: 8 }}>
      <Canvas
        camera={{ position: [0, 2.5, 0.9], fov: 30, near: 0.1, far: 50 }}
        gl={{ alpha: true, antialias: true }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraLookAt />
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 5, 2]} intensity={0.9} />
        <Suspense fallback={null}>
          {dice.map((d, i) => (
            <Die3D
              key={d.instanceId}
              die={d}
              allFaces={VERIFY_FACES}
              position={[(i - 2.5) * 1.1, 0, 0]}
              baseColor={bg}
              textColor={text}
              state="default"
              isTumbling={false}
              overrideFaceIndex={i}
              overrideFace={null}
              onClick={() => {}}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DicePreview() {
  const { bg, text } = CARD_COLOR_HEX['blue'];
  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: 32, fontFamily: 'sans-serif', color: '#eee' }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>Die face preview</h1>

      <h2 style={{ marginTop: 16, marginBottom: 8, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>
        3D verification
      </h2>
      <p style={{ marginBottom: 16, fontSize: 13, color: '#888', maxWidth: 800 }}>
        Each die is pinned to a different slot (0–5) on top. Expect: slot 0
        shows "1 Melee", slot 1 shows "2 Ranged", slot 2 shows "3 Shield",
        slot 3 shows "4 Resource", slot 4 shows "5 Focus", slot 5 shows "6
        Disrupt" — every label upright and centered. If any slot is rotated
        wrong, the geometry (FACE_LAYOUT / FACE_CORRECT_Q in DicePool3D) is
        off — not the texture.
      </p>
      <VerificationRow bg={bg} text={text} />

      <h2 style={{ marginTop: 48, marginBottom: 8, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>
        2D textures
      </h2>
      <p style={{ marginBottom: 24, fontSize: 13, color: '#888' }}>
        Raw 512×512 canvas texture scaled to 120px.
      </p>
      {COLORS.map(({ key, bg: cbg, text: ctext }) => (
        <div key={key} style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 8, fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
            {key}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {FACES.map((spec) => (
              <div key={spec.label} style={{ textAlign: 'center' }}>
                <FaceCanvas spec={spec} bg={cbg} text={ctext} />
                <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>{spec.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
