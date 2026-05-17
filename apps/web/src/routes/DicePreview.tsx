// Dev-only preview page — visit /dice-preview to see all die face textures
// (raw 2D canvas grid) plus a 3D verification panel that renders the production
// RoundedBox die with candidate orientation-correction quaternions side by side.
// No auth or game state required.

import { Canvas, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { makeFaceTexture, CARD_COLORS } from '../lib/dieFaceTexture.js';

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

// ── 3D verification panel ──────────────────────────────────────────────────
// Mirrors DicePool3D's quaternion math so we can sweep candidate _O values.

const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const _q = (axis: THREE.Vector3, angle: number) =>
  new THREE.Quaternion().setFromAxisAngle(axis, angle);
const _c = (a: THREE.Quaternion, b: THREE.Quaternion) => a.clone().multiply(b);

// Per-face base quaternion: brings face k's normal to +Y. No UV correction.
const FACE_BASE_Q: readonly THREE.Quaternion[] = [
  _c(_q(_AY, -Math.PI / 2), _q(_AZ,  Math.PI / 2)), // 0: +X
  _c(_q(_AY,  Math.PI / 2), _q(_AZ, -Math.PI / 2)), // 1: -X
  new THREE.Quaternion(),                            // 2: +Y
  _q(_AX, Math.PI),                                  // 3: -Y
  _q(_AX, -Math.PI / 2),                             // 4: +Z
  _c(_q(_AY,  Math.PI),     _q(_AX,  Math.PI / 2)), // 5: -Z
];

const O_CANDIDATES: { name: string; q: THREE.Quaternion }[] = [
  { name: 'A:  Ry(-π/2)   [current main]', q: _q(_AY, -Math.PI / 2) },
  { name: 'B:  Ry(+π/2)',                  q: _q(_AY,  Math.PI / 2) },
  { name: 'C:  identity (no correction)',  q: new THREE.Quaternion() },
  { name: 'D:  Ry(π)',                     q: _q(_AY,  Math.PI)     },
];

const TEST_FACES: FaceSpec[] = [
  { symbol: 'melee',    value: 1, modifier: false, label: 'face 0 — 1 Melee' },
  { symbol: 'ranged',   value: 2, modifier: false, label: 'face 1 — 2 Ranged' },
  { symbol: 'shield',   value: 3, modifier: false, label: 'face 2 — 3 Shield' },
  { symbol: 'resource', value: 4, modifier: false, label: 'face 3 — 4 Resource' },
  { symbol: 'focus',    value: 5, modifier: false, label: 'face 4 — 5 Focus' },
  { symbol: 'disrupt',  value: 6, modifier: false, label: 'face 5 — 6 Disrupt' },
];

function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}

function TestDieMesh({
  faceIndex,
  O,
  bg,
  text,
  x,
}: {
  faceIndex: number;
  O: THREE.Quaternion;
  bg: string;
  text: string;
  x: number;
}) {
  const spec = TEST_FACES[faceIndex]!;
  const texture = useMemo(
    () => makeFaceTexture(spec.symbol, spec.value, spec.modifier, bg, text),
    [spec, bg, text],
  );
  useEffect(() => () => { texture.dispose(); }, [texture]);

  const q = useMemo(() => _c(O, FACE_BASE_Q[faceIndex]!), [O, faceIndex]);

  return (
    <RoundedBox
      args={[0.8, 0.8, 0.8]}
      radius={0.16}
      smoothness={3}
      position={[x, 0, 0]}
      quaternion={q}
    >
      <meshStandardMaterial map={texture} roughness={0.45} metalness={0.05} />
    </RoundedBox>
  );
}

function VerificationRow({ name, O }: { name: string; O: THREE.Quaternion }) {
  const { bg, text } = CARD_COLORS['blue']!;
  // Camera FOV widened a bit so all six dice fit in one canvas.
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 6, fontSize: 13, color: '#ccc', fontFamily: 'monospace' }}>{name}</div>
      <div style={{ width: '100%', maxWidth: 900, height: 130, background: '#1a1a1a', borderRadius: 8 }}>
        <Canvas
          camera={{ position: [0, 4.2, 1.5], fov: 50, near: 0.1, far: 50 }}
          gl={{ alpha: true, antialias: true }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          <CameraLookAt />
          <ambientLight intensity={0.5} />
          <directionalLight position={[0, 5, 2]} intensity={0.9} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <TestDieMesh
              key={i}
              faceIndex={i}
              O={O}
              bg={bg}
              text={text}
              x={(i - 2.5) * 1.15}
            />
          ))}
        </Canvas>
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 900, marginTop: 4 }}>
        {TEST_FACES.map((f, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#666' }}>
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Verification3D() {
  return (
    <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid #333' }}>
      <h2 style={{ marginBottom: 8, fontSize: 18 }}>3D verification — find the row where every die reads upright</h2>
      <p style={{ marginBottom: 24, fontSize: 12, color: '#888', maxWidth: 800 }}>
        Each row applies a different orientation-correction quaternion (the <code>_O</code> term in
        <code> FACE_CORRECT_Q</code> in <code>DicePool3D.tsx</code>). Columns are face indices 0–5.
        Whichever row shows all six labels (e.g. "1 Melee", "2 Ranged"…) upright and centered on
        the top of the die is the correct <code>_O</code>. Report that letter back.
      </p>
      {O_CANDIDATES.map(({ name, q }) => (
        <VerificationRow key={name} name={name} O={q} />
      ))}
    </div>
  );
}

export function DicePreview() {
  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: 32, fontFamily: 'sans-serif', color: '#eee' }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>Die face texture preview</h1>
      <p style={{ marginBottom: 32, fontSize: 13, color: '#888' }}>
        Raw 512×512 canvas texture scaled to 120px. Text is drawn upright; FACE_CORRECT_Q handles UV rotation in 3D.
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
      <Verification3D />
    </div>
  );
}
