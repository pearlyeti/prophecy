// 3D dice pool rendered with Three.js (react-three-fiber + drei).
// Lazy-loaded — the bundle only loads when the game route is visited.
// Used as a drop-in replacement for the flat DiceStack component.
//
// Architecture: one Canvas per player zone (not per die) — a single
// WebGL context per zone keeps the context count low (browsers cap at ~16).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { FacePickEvent } from '../store.js';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { DieFace, DieInPool, DieSymbol } from '@prophecy/game-engine';
import { useApp, type SelectionMode } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture } from '../lib/dieFaceTexture.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DIE_SIZE = 0.8;           // world units
const DIE_RADIUS = 0.04;        // chamfer radius (tuned via /dice-preview)
const DIE_SPACING = 1.05;       // center-to-center spacing
const CANVAS_HEIGHT_PX = 96;    // px — tall enough to show value+label at readable size

// Per-face UV transforms — tuned via /dice-preview live tuner. Indexed by
// face index k (which cube face is on top). Applied to the die's CanvasTexture
// at render time so text reads upright and centered on every face.
//
// Material order: +X=0  -X=1  +Y=2  -Y=3  +Z=4  -Z=5
const FACE_SPIN_DEG: readonly number[]  = [-180, 0, 90, 90, 90, 90];
const FACE_OFFSET_X: readonly number[]  = [0.13, 0.135, -0.135, 0.145, 0.135, 0.16];
const FACE_OFFSET_Y: readonly number[]  = [0.205, -0.09, -0.085, -0.055, -0.08, 0.225];
const FACE_MIRROR_X: readonly boolean[] = [true, false, false, true, false, false];
const FACE_MIRROR_Y: readonly boolean[] = [false, false, false, false, false, true];

// At rest with no override, the die shows face index 2 (+Y on top by default).
const DEFAULT_FACE_INDEX = 2;

// Camera stays centered on X so the die row doesn't shift in screen space.
// Z=0.9 provides the overhead-with-depth look (bottom-of-screen tilt).
// The "left" component of the perspective comes from the die's rest rotation below.
const CAM_POS: [number, number, number] = [0, 2.5, 0.9];
const CAM_FOV = 40;

// Quaternions that put BoxGeometry material face k on top AND orient the
// face texture so the value text reads correctly from the overhead camera.
//
// Two-step per face:
//   1. Bring the face normal to +Y  (so the die is "face up")
//   2. Rotate around Y until the UV V+ axis points toward -Z
//      (the direction that reads upright to a camera at [0, 2.5, 0.9])
//
// Material order: +X=0  -X=1  +Y=2  -Y=3  +Z=4  -Z=5
// Prophecy face index k → material slot k (one-to-one).
const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const _q  = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
// compose(a, b) = apply b first, then a
const _c  = (a: THREE.Quaternion, b: THREE.Quaternion) => a.clone().multiply(b);

// Empirical UV correction: RoundedBoxGeometry UV axes are rotated ~90° from
// standard BoxGeometry, so all face-up quaternions need a Ry(-π/2) post-step
// to orient the text upright from the overhead camera.
const _O = _q(_AY, -Math.PI / 2); // orientation correction

export const FACE_CORRECT_Q: readonly THREE.Quaternion[] = [
  _c(_O, _c(_q(_AY, -Math.PI / 2), _q(_AZ,  Math.PI / 2))), // 0: +X → top
  _c(_O, _c(_q(_AY,  Math.PI / 2), _q(_AZ, -Math.PI / 2))), // 1: -X → top
  _c(_O, new THREE.Quaternion()),                             // 2: +Y → top
  _c(_O, _q(_AX, Math.PI)),                                   // 3: -Y → top
  _c(_O, _q(_AX, -Math.PI / 2)),                              // 4: +Z → top
  _c(_O, _c(_q(_AY,  Math.PI),     _q(_AX,  Math.PI / 2))),  // 5: -Z → top
];

// Default resting orientation: face 2 placed on top via FACE_CORRECT_Q[2].
// (Per-face UV transforms above are calibrated against this orientation;
// adding any extra tilt would rotate the text away from upright.)
const DEFAULT_REST_Q = FACE_CORRECT_Q[DEFAULT_FACE_INDEX]!;

// Points the camera at the dice origin after mount.
// r3f positions the camera but doesn't auto-aim it for perspective cameras.
function CameraLookAt() {
  const { camera } = useThree();
  useEffect(() => { camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}


// ── Single die mesh ───────────────────────────────────────────────────────────

type DieState = 'default' | 'eligible' | 'selected-resolve' | 'selected-reroll' | 'dimmed';

function Die3D({
  die,
  position,
  baseColor,
  textColor,
  state,
  isTumbling,
  overrideFaceIndex,
  overrideFace,
  onClick,
}: {
  die: DieInPool;
  position: [number, number, number];
  baseColor: string;
  textColor: string;
  state: DieState;
  isTumbling: boolean;
  /** When set, animate the die to show this face index on top. */
  overrideFaceIndex?: number | null;
  /** Face data for the overridden face (for texture). */
  overrideFace?: DieFace | null;
  onClick: () => void;
}) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const animRef  = useRef(false);
  const targetQ  = useRef(DEFAULT_REST_Q.clone());
  const currentQ = useRef(DEFAULT_REST_Q.clone());
  const prevTumbling = useRef(false);

  // When a new face is chosen, set the target quaternion and kick off slerp.
  useEffect(() => {
    if (overrideFaceIndex == null || isTumbling) return;
    targetQ.current.copy(FACE_CORRECT_Q[overrideFaceIndex] ?? FACE_CORRECT_Q[2]!);
    animRef.current = true;
  }, [overrideFaceIndex, isTumbling]);

  // All rotation controlled here — no rotation prop on RoundedBox.
  useFrame((_, dt) => {
    if (!meshRef.current) return;

    if (isTumbling) {
      prevTumbling.current = true;
      meshRef.current.rotation.x += dt * 7.0;
      meshRef.current.rotation.y += dt * 5.3;
      meshRef.current.rotation.z += dt * 3.1;
      return;
    }

    // Just finished tumbling — snap back to display orientation.
    if (prevTumbling.current) {
      prevTumbling.current = false;
      currentQ.current.copy(targetQ.current);
      meshRef.current.quaternion.copy(targetQ.current);
      return;
    }

    // Smooth slerp toward target face orientation.
    if (animRef.current) {
      currentQ.current.slerp(targetQ.current, Math.min(1, dt * 7));
      meshRef.current.quaternion.copy(currentQ.current);
      if (currentQ.current.angleTo(targetQ.current) < 0.008) {
        currentQ.current.copy(targetQ.current);
        meshRef.current.quaternion.copy(targetQ.current);
        animRef.current = false;
      }
    }
  });

  // Use the override face texture when provided (shows chosen face value while
  // the die is animating/settled during a focus pick).
  const displayFace = overrideFace ?? die.face;
  const texture = useMemo(
    () => makeFaceTexture(displayFace.symbol, displayFace.value, displayFace.modifier, baseColor, textColor),
    [displayFace.symbol, displayFace.value, displayFace.modifier, baseColor, textColor],
  );
  useEffect(() => () => { texture.dispose(); }, [texture]);

  // Apply per-face UV transform (rotation / offset / mirror) so the texture
  // reads upright and centered for whichever face is on top. Values tuned via
  // /dice-preview live tuner. Texture matrix auto-rebuilds from these props.
  const effectiveFaceIndex = overrideFaceIndex ?? DEFAULT_FACE_INDEX;
  useEffect(() => {
    texture.center.set(0.5, 0.5);
    texture.offset.set(FACE_OFFSET_X[effectiveFaceIndex]!, FACE_OFFSET_Y[effectiveFaceIndex]!);
    texture.repeat.set(
      FACE_MIRROR_X[effectiveFaceIndex] ? -1 : 1,
      FACE_MIRROR_Y[effectiveFaceIndex] ? -1 : 1,
    );
    texture.rotation = (FACE_SPIN_DEG[effectiveFaceIndex]! * Math.PI) / 180;
  }, [texture, effectiveFaceIndex]);

  const emissiveHex =
    state === 'selected-resolve' ? '#064e3b' :
    state === 'selected-reroll'  ? '#451a03' :
    state === 'eligible'         ? '#052e16' :
    '#000000';
  const emissiveIntensity =
    state === 'selected-resolve' ? 0.9 :
    state === 'selected-reroll'  ? 0.9 :
    state === 'eligible'         ? 0.35 :
    0;
  const dimmed = state === 'dimmed';

  // Six-material array: only the slot that ends up on top (= effectiveFaceIndex)
  // shows the texture. Other slots show plain die color so we don't see ghost
  // text on the cube's side faces / chamfer.
  const materials = useMemo(
    () => Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })),
    [],
  );
  useEffect(() => () => { materials.forEach((m) => m.dispose()); }, [materials]);

  useEffect(() => {
    for (let slot = 0; slot < 6; slot++) {
      const m = materials[slot]!;
      m.emissive.set(emissiveHex);
      m.emissiveIntensity = emissiveIntensity;
      if (slot === effectiveFaceIndex) {
        m.map = texture;
        m.color.set(dimmed ? '#2a2a2a' : '#ffffff');
      } else {
        m.map = null;
        m.color.set(dimmed ? '#2a2a2a' : baseColor);
      }
      m.needsUpdate = true;
    }
  }, [materials, effectiveFaceIndex, texture, baseColor, emissiveHex, emissiveIntensity, dimmed]);

  // Apply the material array to the mesh once it's mounted.
  useEffect(() => {
    if (meshRef.current) meshRef.current.material = materials;
  }, [materials]);

  return (
    <RoundedBox
      ref={meshRef}
      args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]}
      radius={DIE_RADIUS}
      smoothness={3}
      position={position}
      // No rotation prop — fully controlled by useFrame to avoid reconciler conflicts.
      // Material array is set via the useEffect above (one textured slot + 5 plain).
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    />
  );
}

// ── Same canSelectDie / canRerollDie logic as Game.tsx ───────────────────────

function canSelectDie3D(d: DieInPool, lockedSymbol: DieSymbol | null): boolean {
  const s = d.face.symbol;
  if (s === 'blank') return false;
  if (s === 'special' || s === 'indirect' || s === 'discard' || s === 'draw') return false;
  if (s === 'focus') return lockedSymbol === null; // focuser only as first tap
  if (lockedSymbol === null) return !d.face.modifier;
  return s === lockedSymbol || s === 'modifier';
}

function canRerollDie3D(d: DieInPool): boolean {
  return d.face.symbol !== 'blank';
}

// ── Public component ─────────────────────────────────────────────────────────

export interface DicePool3DProps {
  dice: DieInPool[];
  diceInteractive: boolean;
  selectionMode: SelectionMode | null;
  horizontal?: boolean;
  eligibleSymbols?: readonly string[];
  /** Card color for die face color. */
  cardColor?: string | null;
  /**
   * Character instance id currently in the activate flow.
   * Dice owned by this character tumble (pre-roll anticipation).
   */
  tumblingCharId?: string | null;
  /** Face overrides for focus-pick preview: maps die instanceId → chosen face. */
  faceOverrides?: Record<string, { faceIndex: number; face: DieFace }>;
  /** Preview: opponent's currently selected dice (glow green). */
  previewSelectedDieIds?: readonly string[];
  /** Preview: opponent's spent dice in pendingTargets (dimmed). */
  previewSpentDieIds?: readonly string[];
  /** Preview: opponent's reroll-picked dice (amber). */
  previewRerollDieIds?: readonly string[];
}

export default function DicePool3D({
  dice,
  diceInteractive,
  selectionMode,
  eligibleSymbols,
  cardColor,
  tumblingCharId,
  faceOverrides,
  previewSelectedDieIds,
  previewSpentDieIds,
  previewRerollDieIds,
}: DicePool3DProps) {
  const activeFlow    = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  const toggleSelectedDie = useApp((s) => s.toggleSelectedDie);

  const inRerollPickDice = activeFlow?.kind === 'reroll' && activeFlow.step === 'pick-dice';
  const inRerollMode     = selectionMode?.kind === 'reroll';
  const inResolveFlow    = activeFlow?.kind === 'resolve';

  const handleTap = (d: DieInPool) => {
    if (inRerollPickDice && activeFlow?.kind === 'reroll') {
      const isSelected = activeFlow.selectedDieIds.includes(d.instanceId);
      const next = isSelected
        ? activeFlow.selectedDieIds.filter((id) => id !== d.instanceId)
        : [...activeFlow.selectedDieIds, d.instanceId];
      setActiveFlow({ ...activeFlow, selectedDieIds: next });
      return;
    }
    if (inRerollMode) { toggleSelectedDie(d.instanceId); return; }
    if (inResolveFlow) {
      const flow = activeFlow!;
      if (flow.kind !== 'resolve') return;
      const isSelected = flow.selectedDieIds.includes(d.instanceId);
      if (isSelected) {
        const next = flow.selectedDieIds.filter((id) => id !== d.instanceId);
        if (next.length === 0 && flow.pendingTargets.length === 0) {
          setActiveFlow(null);
        } else {
          setActiveFlow({ ...flow, selectedDieIds: next });
        }
      } else {
        const spentIds = new Set(flow.pendingTargets.flatMap(t => [...t.dieInstanceIds]));
        if (!spentIds.has(d.instanceId) && canSelectDie3D(d, flow.symbol as DieSymbol)) {
          setActiveFlow({ ...flow, selectedDieIds: [...flow.selectedDieIds, d.instanceId] });
        }
      }
      return;
    }
    // ── Face-pick flow ────────────────────────────────────────────────────
    if (activeFlow?.kind === 'face-pick') {
      const flow = activeFlow;
      const isFocuser = flow.focuserDieIds.includes(d.instanceId);

      if (!isFocuser && flow.budget > 0 && flow.pickingForDieId !== d.instanceId) {
        // Tap a non-focuser die to open its face picker.
        setActiveFlow({ ...flow, pickingForDieId: d.instanceId });
        return;
      }

      if (!isFocuser && flow.pickingForDieId === d.instanceId) {
        // Tap again to close the picker without selecting.
        setActiveFlow({ ...flow, pickingForDieId: null });
        return;
      }

      // Tap a die that was flipped to a focus face to chain it as a new focuser.
      const lastFlip = [...flow.history].reverse().find(
        (e): e is Extract<FacePickEvent, { kind: 'flip' }> =>
          e.kind === 'flip' && e.targetDieId === d.instanceId,
      );
      const currentFaceIndex = lastFlip ? lastFlip.faceIndex : d.faceIndex;
      const currentSymbol = d.face.symbol === 'focus' && !lastFlip
        ? 'focus'
        : lastFlip && d.ownerInstanceId
          ? 'unknown' // will be resolved by engine; we check the flipped face value
          : d.face.symbol;

      // Check if the current effective face is a focus face and this die isn't already a focuser.
      const effectiveFaceIsFocus =
        !isFocuser &&
        lastFlip &&
        (d.face.symbol === 'focus' || currentFaceIndex === lastFlip.faceIndex);

      if (!isFocuser && (d.face.symbol === 'focus' || effectiveFaceIsFocus)) {
        const budgetAdded = d.face.value;
        const chainEvent: FacePickEvent = {
          kind: 'chain',
          chainedFocuserId: d.instanceId,
          budgetAdded,
        };
        setActiveFlow({
          ...flow,
          focuserDieIds: [...flow.focuserDieIds, d.instanceId],
          budget: flow.budget + budgetAdded,
          history: [...flow.history, chainEvent],
          pickingForDieId: null,
        });
        return;
      }
      return;
    }

    if (diceInteractive && activeFlow === null && !d.face.modifier) {
      if (!eligibleSymbols?.includes(d.face.symbol)) return;
      // Focus dice skip the resolve step — go straight to face-pick.
      if (d.face.symbol === 'focus') {
        setActiveFlow({ kind: 'face-pick', focuserDieIds: [d.instanceId], budget: d.face.value, history: [], pickingForDieId: null });
        return;
      }
      setActiveFlow({ kind: 'resolve', symbol: d.face.symbol, selectedDieIds: [d.instanceId], pendingTargets: [] });
    }
  };

  const { bg: baseColor, text: textColor } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  // Horizontal centering: spread dice around origin.
  const xStart = -((dice.length - 1) * DIE_SPACING) / 2;

  // Empty pool — render a spacer that matches DiceStack min-h.
  if (dice.length === 0) {
    return <div style={{ minHeight: 40 }} className="w-full" />;
  }

  return (
    <div style={{ width: '100%', height: CANVAS_HEIGHT_PX }}>
      <Canvas
        camera={{ position: CAM_POS, fov: CAM_FOV, near: 0.1, far: 50 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: true, antialias: true }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraLookAt />
        {/* Lighting: ambient fill + directional from upper-left-front to match camera angle */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 5, 2]} intensity={0.9} castShadow={false} />

        {dice.map((d, i) => {
          const isTumbling = tumblingCharId != null && d.ownerInstanceId === tumblingCharId;

          // Determine visual state
          let dieState: DieState = 'default';
          if (inRerollPickDice && activeFlow?.kind === 'reroll') {
            dieState = activeFlow.selectedDieIds.includes(d.instanceId) ? 'selected-reroll'
                     : canRerollDie3D(d)                                ? 'default'
                     : 'dimmed';
          } else if (inResolveFlow && activeFlow?.kind === 'resolve') {
            const flow = activeFlow;
            const spentIds = new Set(flow.pendingTargets.flatMap(t => [...t.dieInstanceIds]));
            const isSelected = flow.selectedDieIds.includes(d.instanceId);
            const isSpent = spentIds.has(d.instanceId);
            const canAdd = !isSelected && !isSpent && canSelectDie3D(d, flow.symbol as DieSymbol);
            dieState = isSelected ? 'selected-resolve'
                     : isSpent    ? 'dimmed'
                     : canAdd     ? 'eligible'
                     : 'dimmed';
          } else if (inRerollMode) {
            const isSelected = selectionMode!.selectedDieIds.includes(d.instanceId);
            dieState = isSelected       ? 'selected-resolve'
                     : canRerollDie3D(d) ? 'default'
                     : 'dimmed';
          } else if (activeFlow?.kind === 'face-pick') {
            const flow = activeFlow;
            const isFocuser = flow.focuserDieIds.includes(d.instanceId);
            const isPickingTarget = flow.pickingForDieId === d.instanceId;
            const hasBeenFlipped = flow.history.some(
              (e) => e.kind === 'flip' && e.targetDieId === d.instanceId,
            );
            if (isFocuser) dieState = 'dimmed';                        // focuser is "spent"
            else if (isPickingTarget) dieState = 'selected-resolve';   // open picker
            else if (hasBeenFlipped) dieState = 'selected-reroll';     // flipped this focus
            else if (flow.budget > 0) dieState = 'eligible';           // valid target
            else dieState = 'dimmed';
          } else if (eligibleSymbols?.includes(d.face.symbol) && !d.face.modifier) {
            dieState = 'eligible';
          } else if (previewRerollDieIds?.includes(d.instanceId)) {
            dieState = 'selected-reroll';
          } else if (previewSelectedDieIds?.includes(d.instanceId)) {
            dieState = 'selected-resolve';
          } else if (previewSpentDieIds?.includes(d.instanceId)) {
            dieState = 'dimmed';
          }

          const override = faceOverrides?.[d.instanceId];
          return (
            <Die3D
              key={d.instanceId}
              die={d}
              position={[xStart + i * DIE_SPACING, 0, 0]}
              baseColor={baseColor}
              textColor={textColor}
              state={dieState}
              isTumbling={isTumbling}
              overrideFaceIndex={override?.faceIndex ?? null}
              overrideFace={override?.face ?? null}
              onClick={() => handleTap(d)}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
