// Dev-only preview page — visit /dice-preview to see all die face textures
// (raw 2D canvas grid) plus an interactive 3D tuner. The tuner renders the
// production RoundedBox die with live-adjustable canvas/quaternion/camera
// parameters and emits a JSON blob that can be pasted back into the agent
// chat to bake the values into dieFaceTexture.ts / DicePool3D.tsx.
//
// No production code paths are touched. The page lives outside the auth /
// trpc / socket providers (per PR #80), so the extra Canvases are isolated.

import { Canvas, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
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

// ── Quaternion helpers (mirror DicePool3D.tsx) ───────────────────────────────

const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const _q = (axis: THREE.Vector3, angle: number) =>
  new THREE.Quaternion().setFromAxisAngle(axis, angle);
const _c = (a: THREE.Quaternion, b: THREE.Quaternion) => a.clone().multiply(b);

// Per-face quaternion that brings face k's normal to +Y. No UV correction.
// Material order: +X=0  -X=1  +Y=2  -Y=3  +Z=4  -Z=5
const FACE_BASE_Q: readonly THREE.Quaternion[] = [
  _c(_q(_AY, -Math.PI / 2), _q(_AZ,  Math.PI / 2)), // 0: +X
  _c(_q(_AY,  Math.PI / 2), _q(_AZ, -Math.PI / 2)), // 1: -X
  new THREE.Quaternion(),                            // 2: +Y
  _q(_AX, Math.PI),                                  // 3: -Y
  _q(_AX, -Math.PI / 2),                             // 4: +Z
  _c(_q(_AY,  Math.PI),     _q(_AX,  Math.PI / 2)), // 5: -Z
];

function axisVec(name: 'X' | 'Y' | 'Z'): THREE.Vector3 {
  return name === 'X' ? _AX : name === 'Y' ? _AY : _AZ;
}

const TEST_FACES: FaceSpec[] = [
  { symbol: 'melee',    value: 1, modifier: false, label: 'face 0' },
  { symbol: 'ranged',   value: 2, modifier: false, label: 'face 1' },
  { symbol: 'shield',   value: 3, modifier: false, label: 'face 2' },
  { symbol: 'resource', value: 4, modifier: false, label: 'face 3' },
  { symbol: 'focus',    value: 5, modifier: false, label: 'face 4' },
  { symbol: 'disrupt',  value: 6, modifier: false, label: 'face 5' },
];

// ── Parameterized texture (mirrors makeFaceTexture but knobs are externalized) ─

type TextureParams = {
  ctrFrac: number;
  vMaxFrac: number;
  lMaxFrac: number;
  gapFrac: number;
  maxWFrac: number;
};

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
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight: string,
): number {
  ctx.font = `${weight} ${startSize}px ui-sans-serif, sans-serif`;
  const w = ctx.measureText(text).width;
  if (w <= maxWidth) return startSize;
  const size = Math.floor(startSize * (maxWidth / w));
  ctx.font = `${weight} ${size}px ui-sans-serif, sans-serif`;
  return size;
}

function makeFaceTextureTuned(
  symbol: string, value: number, modifier: boolean, baseColor: string, textColor: string, p: TextureParams,
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

  const CTR   = Math.round(S * p.ctrFrac);
  const GAP   = Math.round(S * p.gapFrac);
  const V_MAX = Math.round(S * p.vMaxFrac);
  const L_MAX = Math.round(S * p.lMaxFrac);
  const maxW  = Math.round(S * p.maxWFrac);

  if (symbol === 'blank') {
    // intentionally empty
  } else if (symbol === 'special') {
    fittedSize(ctx, 'Special', maxW, L_MAX, 'bold');
    ctx.fillText('Special', S / 2, CTR);
  } else {
    const valueStr = modifier ? `+${value}` : (value > 0 ? `${value}` : '');
    const label = faceWord(symbol);
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

// ── Live tuner ───────────────────────────────────────────────────────────────

type Settings = {
  // Canvas / texture
  ctrFrac: number;
  vMaxFrac: number;
  lMaxFrac: number;
  gapFrac: number;
  maxWFrac: number;
  // Orientation correction _O (composes into every FACE_CORRECT_Q[k])
  oAxis: 'X' | 'Y' | 'Z';
  oAngleDeg: number;
  // Per-face fine-tune
  faceSpinDeg:  [number, number, number, number, number, number]; // top-axis in-plane rotation
  faceOffsetX:  [number, number, number, number, number, number]; // texture U offset (-0.5..0.5)
  faceOffsetY:  [number, number, number, number, number, number]; // texture V offset
  faceMirrorX:  [boolean, boolean, boolean, boolean, boolean, boolean];
  faceMirrorY:  [boolean, boolean, boolean, boolean, boolean, boolean];
  // Camera
  camY: number;
  camZ: number;
  camFov: number;
  // Die geometry
  dieSize: number;
  dieRadius: number;
};

const DEFAULTS: Settings = {
  // Mirrors current main: dieFaceTexture.ts post-#88
  ctrFrac: 0.45,
  vMaxFrac: 0.35,
  lMaxFrac: 0.22,
  gapFrac: 0.04,
  maxWFrac: 0.70,
  // Mirrors current main: DicePool3D _O = Ry(-π/2)
  oAxis: 'Y',
  oAngleDeg: -90,
  faceSpinDeg: [0, 0, 0, 0, 0, 0],
  faceOffsetX: [0, 0, 0, 0, 0, 0],
  faceOffsetY: [0, 0, 0, 0, 0, 0],
  faceMirrorX: [false, false, false, false, false, false],
  faceMirrorY: [false, false, false, false, false, false],
  // Mirrors current main: DicePool3D camera + geometry
  camY: 2.5,
  camZ: 0.9,
  camFov: 40,
  dieSize: 0.8,
  dieRadius: 0.16,
};

function CameraLookAt({ camY, camZ, camFov }: { camY: number; camZ: number; camFov: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, camY, camZ);
    (camera as THREE.PerspectiveCamera).fov = camFov;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [camera, camY, camZ, camFov]);
  return null;
}

function TunerDie({
  index, texture, quaternion, size, radius, position, spinDeg, offX, offY, mirrorX, mirrorY,
}: {
  index: number;
  texture: THREE.CanvasTexture;
  quaternion: THREE.Quaternion;
  size: number;
  radius: number;
  position: [number, number, number];
  spinDeg: number;
  offX: number;
  offY: number;
  mirrorX: boolean;
  mirrorY: boolean;
}) {
  // Apply per-face UV transform. Each die owns its own texture, so mutating
  // these properties is isolated. Three.js auto-rebuilds the texture matrix.
  useEffect(() => {
    texture.center.set(0.5, 0.5);
    texture.offset.set(offX, offY);
    texture.repeat.set(mirrorX ? -1 : 1, mirrorY ? -1 : 1);
    texture.rotation = (spinDeg * Math.PI) / 180;
  }, [texture, spinDeg, offX, offY, mirrorX, mirrorY]);

  return (
    <RoundedBox
      key={index}
      args={[size, size, size]}
      radius={radius}
      smoothness={3}
      position={position}
      quaternion={quaternion}
    >
      <meshStandardMaterial map={texture} roughness={0.45} metalness={0.05} />
    </RoundedBox>
  );
}

function TunerScene({ settings, textures }: { settings: Settings; textures: THREE.CanvasTexture[] }) {
  const oQuat = useMemo(
    () => _q(axisVec(settings.oAxis), (settings.oAngleDeg * Math.PI) / 180),
    [settings.oAxis, settings.oAngleDeg],
  );

  // Per-face spin is now applied via texture.rotation (UV rotation around the
  // face center), not a geometry rotation — so adjacent faces don't swing into
  // view when you spin one face's content. The geometry quaternion only does
  // face-to-top placement + _O correction.
  const faceQuats = useMemo(
    () => [0, 1, 2, 3, 4, 5].map((k) => _c(oQuat, FACE_BASE_Q[k]!)),
    [oQuat],
  );

  return (
    <>
      <CameraLookAt camY={settings.camY} camZ={settings.camZ} camFov={settings.camFov} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[0, 5, 2]} intensity={0.9} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <TunerDie
          key={i}
          index={i}
          texture={textures[i]!}
          quaternion={faceQuats[i]!}
          size={settings.dieSize}
          radius={settings.dieRadius}
          position={[(i - 2.5) * (settings.dieSize * 1.4), 0, 0]}
          spinDeg={settings.faceSpinDeg[i]!}
          offX={settings.faceOffsetX[i]!}
          offY={settings.faceOffsetY[i]!}
          mirrorX={settings.faceMirrorX[i]!}
          mirrorY={settings.faceMirrorY[i]!}
        />
      ))}
    </>
  );
}

function Slider({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: 'monospace' }}>
      <span style={{ width: 130, color: '#aaa' }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, maxWidth: 280 }}
      />
      <span style={{ width: 64, textAlign: 'right', color: '#ddd' }}>
        {fmt ? fmt(value) : value.toFixed(3)}
      </span>
    </label>
  );
}

function LiveTuner({ bg, text }: { bg: string; text: string }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  function setFaceNum(key: 'faceSpinDeg' | 'faceOffsetX' | 'faceOffsetY', i: number, v: number) {
    setS((p) => {
      const next = [...p[key]] as Settings['faceSpinDeg'];
      next[i] = v;
      return { ...p, [key]: next };
    });
  }
  function setFaceBool(key: 'faceMirrorX' | 'faceMirrorY', i: number, v: boolean) {
    setS((p) => {
      const next = [...p[key]] as Settings['faceMirrorX'];
      next[i] = v;
      return { ...p, [key]: next };
    });
  }

  // Textures only depend on the canvas params.
  const textures = useMemo(() => {
    const p: TextureParams = {
      ctrFrac: s.ctrFrac, vMaxFrac: s.vMaxFrac, lMaxFrac: s.lMaxFrac,
      gapFrac: s.gapFrac, maxWFrac: s.maxWFrac,
    };
    return TEST_FACES.map((f) =>
      makeFaceTextureTuned(f.symbol, f.value, f.modifier, bg, text, p),
    );
  }, [s.ctrFrac, s.vMaxFrac, s.lMaxFrac, s.gapFrac, s.maxWFrac, bg, text]);

  useEffect(() => () => { textures.forEach((t) => t.dispose()); }, [textures]);

  const json = JSON.stringify(s, null, 2);
  const copy = () => { navigator.clipboard.writeText(json).catch(() => {}); };
  const reset = () => setS(DEFAULTS);

  return (
    <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid #333' }}>
      <h2 style={{ marginBottom: 8, fontSize: 18 }}>3D live tuner</h2>
      <p style={{ marginBottom: 16, fontSize: 12, color: '#888', maxWidth: 800 }}>
        Move sliders until every face shows its label (e.g. "1 Melee") upright and centered on the top
        of the die. Then click <strong>Copy JSON</strong> and paste it back to me — I'll bake the values
        into <code>dieFaceTexture.ts</code> and <code>DicePool3D.tsx</code>.
      </p>

      {/* 3D row */}
      <div style={{ width: '100%', maxWidth: 1000, height: 180, background: '#1a1a1a', borderRadius: 8, marginBottom: 12 }}>
        <Canvas
          camera={{ position: [0, s.camY, s.camZ], fov: s.camFov, near: 0.1, far: 50 }}
          gl={{ alpha: true, antialias: true }}
          dpr={Math.min(window.devicePixelRatio, 2)}
        >
          <TunerScene settings={s} textures={textures} />
        </Canvas>
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 1000, marginBottom: 24 }}>
        {TEST_FACES.map((f, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#666' }}>
            {f.label} — {f.value} {faceWord(f.symbol)}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, maxWidth: 1000 }}>
        <div>
          <h3 style={{ fontSize: 13, color: '#ccc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Canvas / texture</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Slider label="CTR (vert center)" value={s.ctrFrac}  min={0.20} max={0.80} step={0.005} onChange={(v) => set('ctrFrac', v)} />
            <Slider label="V_MAX (value font)" value={s.vMaxFrac} min={0.10} max={0.55} step={0.005} onChange={(v) => set('vMaxFrac', v)} />
            <Slider label="L_MAX (label font)" value={s.lMaxFrac} min={0.06} max={0.40} step={0.005} onChange={(v) => set('lMaxFrac', v)} />
            <Slider label="GAP"                value={s.gapFrac}  min={0.00} max={0.15} step={0.005} onChange={(v) => set('gapFrac', v)} />
            <Slider label="maxW (text width)"  value={s.maxWFrac} min={0.30} max={0.95} step={0.01}  onChange={(v) => set('maxWFrac', v)} />
          </div>

          <h3 style={{ fontSize: 13, color: '#ccc', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Orientation correction _O</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: 'monospace' }}>
              <span style={{ width: 130, color: '#aaa' }}>_O axis</span>
              <select
                value={s.oAxis}
                onChange={(e) => set('oAxis', e.target.value as Settings['oAxis'])}
                style={{ background: '#222', color: '#ddd', border: '1px solid #444', padding: '4px 8px' }}
              >
                <option value="X">X</option>
                <option value="Y">Y</option>
                <option value="Z">Z</option>
              </select>
            </label>
            <Slider label="_O angle (deg)" value={s.oAngleDeg} min={-180} max={180} step={1} onChange={(v) => set('oAngleDeg', v)} fmt={(v) => `${v.toFixed(0)}°`} />
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[-180, -90, 0, 90, 180].map((deg) => (
                <button
                  key={deg}
                  onClick={() => set('oAngleDeg', deg)}
                  style={{ background: '#222', color: '#ddd', border: '1px solid #444', padding: '4px 8px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}
                >{deg}°</button>
              ))}
            </div>
          </div>

          <h3 style={{ fontSize: 13, color: '#ccc', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Camera / geometry</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Slider label="cam Y"       value={s.camY}      min={0.5} max={6}    step={0.05} onChange={(v) => set('camY', v)} />
            <Slider label="cam Z"       value={s.camZ}      min={-3}  max={3}    step={0.05} onChange={(v) => set('camZ', v)} />
            <Slider label="cam FOV"     value={s.camFov}    min={15}  max={80}   step={1}    onChange={(v) => set('camFov', v)} fmt={(v) => `${v.toFixed(0)}°`} />
            <Slider label="die size"    value={s.dieSize}   min={0.3} max={1.5}  step={0.02} onChange={(v) => set('dieSize', v)} />
            <Slider label="die radius"  value={s.dieRadius} min={0}   max={0.35} step={0.005} onChange={(v) => set('dieRadius', v)} />
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 13, color: '#ccc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Per-face tune</h3>
          <p style={{ fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.4 }}>
            <strong>spin</strong>: in-plane rotation around the top-axis.
            <strong> X / Y</strong>: nudge the texture on the face (UV offset).
            <strong> mX / mY</strong>: mirror.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ background: '#181818', borderRadius: 4, padding: '6px 8px' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontFamily: 'monospace' }}>face {i}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 56px', columnGap: 6, rowGap: 3, alignItems: 'center', fontSize: 11, fontFamily: 'monospace' }}>
                  <span style={{ color: '#aaa' }}>spin</span>
                  <input
                    type="range" min={-180} max={180} step={1}
                    value={s.faceSpinDeg[i]!}
                    onChange={(e) => setFaceNum('faceSpinDeg', i, parseFloat(e.target.value))}
                  />
                  <span style={{ textAlign: 'right', color: '#ddd' }}>{s.faceSpinDeg[i]!.toFixed(0)}°</span>

                  <span style={{ color: '#aaa' }}>X</span>
                  <input
                    type="range" min={-0.5} max={0.5} step={0.005}
                    value={s.faceOffsetX[i]!}
                    onChange={(e) => setFaceNum('faceOffsetX', i, parseFloat(e.target.value))}
                  />
                  <span style={{ textAlign: 'right', color: '#ddd' }}>{s.faceOffsetX[i]!.toFixed(3)}</span>

                  <span style={{ color: '#aaa' }}>Y</span>
                  <input
                    type="range" min={-0.5} max={0.5} step={0.005}
                    value={s.faceOffsetY[i]!}
                    onChange={(e) => setFaceNum('faceOffsetY', i, parseFloat(e.target.value))}
                  />
                  <span style={{ textAlign: 'right', color: '#ddd' }}>{s.faceOffsetY[i]!.toFixed(3)}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, fontFamily: 'monospace', color: '#ccc' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={s.faceMirrorX[i]!}
                      onChange={(e) => setFaceBool('faceMirrorX', i, e.target.checked)}
                    />
                    mirror X
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={s.faceMirrorY[i]!}
                      onChange={(e) => setFaceBool('faceMirrorY', i, e.target.checked)}
                    />
                    mirror Y
                  </label>
                  <button
                    onClick={() => {
                      setFaceNum('faceSpinDeg', i, 0);
                      setFaceNum('faceOffsetX', i, 0);
                      setFaceNum('faceOffsetY', i, 0);
                      setFaceBool('faceMirrorX', i, false);
                      setFaceBool('faceMirrorY', i, false);
                    }}
                    style={{ marginLeft: 'auto', background: '#222', color: '#999', border: '1px solid #333', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 }}
                  >reset face</button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13, color: '#ccc', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Output</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={copy}
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 4 }}
            >Copy JSON</button>
            <button
              onClick={reset}
              style={{ background: '#222', color: '#ddd', border: '1px solid #444', padding: '8px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
            >Reset to current main</button>
          </div>
          <textarea
            readOnly
            value={json}
            style={{ width: '100%', minHeight: 280, background: '#0a0a0a', color: '#9cdcfe', border: '1px solid #333', borderRadius: 4, padding: 12, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  );
}

export function DicePreview() {
  const { bg, text } = CARD_COLORS['blue']!;
  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: 32, fontFamily: 'sans-serif', color: '#eee' }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>Die face texture preview</h1>
      <p style={{ marginBottom: 32, fontSize: 13, color: '#888' }}>
        Raw 512×512 canvas texture scaled to 120px. Text is drawn upright; FACE_CORRECT_Q handles UV rotation in 3D.
      </p>
      {COLORS.map(({ key, bg: cbg, text: ctext }) => (
        <div key={key} style={{ marginBottom: 40 }}>
          <h2 style={{ marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, color: '#aaa' }}>
            {key}
          </h2>
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
      <LiveTuner bg={bg} text={text} />
    </div>
  );
}
