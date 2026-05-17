// 3D dice pool rendered with Three.js (react-three-fiber + drei).
// Lazy-loaded — the bundle only loads when the game route is visited.
// Used as a drop-in replacement for the flat DiceStack component.
//
// Architecture
// ────────────
// Each die is a <group> containing:
//   • One RoundedBox body (solid color, no texture) for the chamfered cube.
//   • Six flat plane meshes laid over each face, each with a CanvasTexture
//     that just shows "value + label" drawn upright. There are no UV transforms
//     anywhere — the plane's cube-local rotation is what makes text upright
//     when that face is on top. Derivation is in the FACE_LAYOUT comment below.
//
// One Canvas per player zone (not per die) keeps the WebGL context count low
// (browsers cap at ~16).

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { DieFace, DieInPool, DieSymbol } from '@prophecy/game-engine';
import type { FacePickEvent } from '../store.js';
import { useApp, type SelectionMode } from '../store.js';
import { CARD_COLORS, FALLBACK_COLOR, makeFaceTexture } from '../lib/dieFaceTexture.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DIE_SIZE = 0.8;
const DIE_RADIUS = 0.04;
const DIE_SPACING = 1.05;
const CANVAS_HEIGHT_PX = 96;

// Face overlay planes: sized to fit between the chamfers, pushed just outside
// the cube body so they don't z-fight.
const FACE_PLANE_SIZE   = DIE_SIZE - 2 * DIE_RADIUS;
const FACE_PLANE_OFFSET = DIE_SIZE / 2 + 0.001;

// At rest with no override the die shows face index 2 (+Y on top).
const DEFAULT_FACE_INDEX = 2;

const CAM_POS: [number, number, number] = [0, 2.5, 0.9];
const CAM_ZOOM = 50; // px / world-unit; matches previous apparent die size at centre

// ── Face plane layout ────────────────────────────────────────────────────────
//
// Slot order (kept for the allFaces array passed in from the engine):
//   0=+X  1=-X  2=+Y  3=-Y  4=+Z  5=-Z
//
// Each plane is rotated from the default plane orientation (normal +Z, up +Y)
// so its outward normal points along the named axis. Its "local up" — the
// world direction the texture's top points to in cube space — is picked so
// the FACE_CORRECT_Q rotation that puts this slot on top is as simple as
// possible (identity for slot 2, the default).

const FACE_LAYOUT: readonly { pos: [number, number, number]; rot: [number, number, number] }[] = [
  { pos: [+1,  0,  0], rot: [           0,  Math.PI / 2, 0] }, // 0: +X face, local up +Y
  { pos: [-1,  0,  0], rot: [           0, -Math.PI / 2, 0] }, // 1: -X face, local up +Y
  { pos: [ 0, +1,  0], rot: [-Math.PI / 2,            0, 0] }, // 2: +Y face, local up -Z
  { pos: [ 0, -1,  0], rot: [ Math.PI / 2,            0, 0] }, // 3: -Y face, local up +Z
  { pos: [ 0,  0, +1], rot: [           0,            0, 0] }, // 4: +Z face, local up +Y
  { pos: [ 0,  0, -1], rot: [           0,      Math.PI, 0] }, // 5: -Z face, local up +Y
];

// ── Orientation ──────────────────────────────────────────────────────────────
//
// FACE_CORRECT_Q[k]: rotation applied to the whole die so slot k is on top
// with its text upright for the camera. The camera at (0, 2.5, 0.9) looking
// at origin has screen-up projected onto the world-XZ plane (the top face's
// plane) in the -Z direction. So for each face k we need:
//   • face k's outward normal → +Y (world)
//   • face k's local "up"     → -Z (world)
// FACE_CORRECT_Q[2] is identity because slot 2's normal is already +Y and
// its local up was chosen as -Z; everything else follows mechanically.

const _AX = new THREE.Vector3(1, 0, 0);
const _AY = new THREE.Vector3(0, 1, 0);
const _AZ = new THREE.Vector3(0, 0, 1);
const _q = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle);
// compose(a, b) = apply b first, then a (Three.js convention)
const _c = (a: THREE.Quaternion, b: THREE.Quaternion) => a.clone().multiply(b);

export const FACE_CORRECT_Q: readonly THREE.Quaternion[] = [
  _c(_q(_AY, -Math.PI / 2), _q(_AZ,  Math.PI / 2)), // 0: +X → top
  _c(_q(_AY,  Math.PI / 2), _q(_AZ, -Math.PI / 2)), // 1: -X → top
  new THREE.Quaternion(),                             // 2: +Y → top (identity)
  _q(_AX, Math.PI),                                   // 3: -Y → top
  _q(_AX, -Math.PI / 2),                              // 4: +Z → top
  _c(_q(_AY,  Math.PI), _q(_AX, Math.PI / 2)),       // 5: -Z → top
];

const DEFAULT_REST_Q = FACE_CORRECT_Q[DEFAULT_FACE_INDEX]!;

// Positions and aims the camera so all dice fit horizontally with a margin.
// Zooms out when the pool is wider than the canvas at the default zoom.
function CameraRig({ diceCount }: { diceCount: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const halfSpan = ((diceCount - 1) / 2) * DIE_SPACING + DIE_SIZE / 2;
    const needed   = halfSpan * 1.25; // 25% breathing room
    const zoom = Math.min(CAM_ZOOM, (size.width / 2) / needed);
    (camera as THREE.OrthographicCamera).zoom = zoom;
    camera.position.set(...CAM_POS);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size, diceCount]);
  return null;
}

// ── Single die ───────────────────────────────────────────────────────────────

type DieState = 'default' | 'eligible' | 'selected-resolve' | 'selected-reroll' | 'dimmed';

export function Die3D({
  die,
  allFaces,
  position,
  baseColor,
  textColor,
  state,
  isTumbling,
  staggerIndex = 0,
  overrideFaceIndex,
  overrideFace,
  onClick,
}: {
  die: DieInPool;
  /**
   * All 6 faces of this die (from state.cardDieFaces[die.cardId]).
   * Each cube face slot k shows allFaces[k]. Falls back to repeating
   * die.face on every slot if catalog data isn't available.
   */
  allFaces: readonly DieFace[] | undefined;
  position: [number, number, number];
  baseColor: string;
  textColor: string;
  state: DieState;
  isTumbling: boolean;
  /** Left-to-right index among tumbling dice — each adds 400 ms to settle delay. Defaults to 0. */
  staggerIndex?: number;
  /** When set, animate the die to show this face index on top. */
  overrideFaceIndex?: number | null;
  /** Face data for the overridden face (for the texture). */
  overrideFace?: DieFace | null;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const animRef = useRef(false);
  const targetQ = useRef(DEFAULT_REST_Q.clone());
  const currentQ = useRef(DEFAULT_REST_Q.clone());
  const prevTumbling = useRef(false);
  const stopAtRef = useRef<number | null>(null);

  // Rotate the die so the effective face index is on top.
  const effectiveFaceIndex = overrideFaceIndex ?? die.faceIndex;
  useEffect(() => {
    if (isTumbling) return;
    targetQ.current.copy(FACE_CORRECT_Q[effectiveFaceIndex] ?? DEFAULT_REST_Q);
    animRef.current = true;
  }, [effectiveFaceIndex, isTumbling]);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;

    if (isTumbling) {
      stopAtRef.current = null;
      prevTumbling.current = true;
      g.rotation.x += dt * 7.0;
      g.rotation.y += dt * 5.3;
      g.rotation.z += dt * 3.1;
      return;
    }

    // Just finished tumbling — stagger the settle left-to-right.
    if (prevTumbling.current) {
      if (stopAtRef.current === null) {
        stopAtRef.current = state.clock.elapsedTime + staggerIndex * 0.4;
      }
      if (state.clock.elapsedTime < stopAtRef.current) {
        g.rotation.x += dt * 7.0;
        g.rotation.y += dt * 5.3;
        g.rotation.z += dt * 3.1;
        return;
      }
      prevTumbling.current = false;
      stopAtRef.current = null;
      currentQ.current.copy(targetQ.current);
      g.quaternion.copy(targetQ.current);
      return;
    }

    if (animRef.current) {
      currentQ.current.slerp(targetQ.current, Math.min(1, dt * 7));
      g.quaternion.copy(currentQ.current);
      if (currentQ.current.angleTo(targetQ.current) < 0.008) {
        currentQ.current.copy(targetQ.current);
        g.quaternion.copy(targetQ.current);
        animRef.current = false;
      }
    }
  });

  // Per-slot face content. Catalog spec from allFaces; missing → repeat the
  // rolled face on every slot (mostly for transient/event dice). The override
  // slot, if any, gets the overrideFace.
  const effectiveFaces = useMemo<readonly DieFace[]>(() => {
    const base: readonly DieFace[] = allFaces && allFaces.length === 6
      ? allFaces
      : Array.from({ length: 6 }, () => die.face);
    if (overrideFaceIndex != null && overrideFace) {
      const next = base.slice();
      next[overrideFaceIndex] = overrideFace;
      return next;
    }
    return base;
  }, [allFaces, die.face, overrideFaceIndex, overrideFace]);

  // One texture per face — drawn upright, no tweaks. The plane orientation
  // does all the work of making text read upright on the die.
  const textures = useMemo(
    () => effectiveFaces.map((f) =>
      makeFaceTexture(f.symbol, f.value, f.modifier, baseColor, textColor),
    ),
    [effectiveFaces, baseColor, textColor],
  );
  useEffect(() => () => { textures.forEach((t) => t.dispose()); }, [textures]);

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

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={DIE_RADIUS} smoothness={3}>
        <meshStandardMaterial
          color={dimmed ? '#2a2a2a' : baseColor}
          roughness={0.45}
          metalness={0.05}
          emissive={emissiveHex}
          emissiveIntensity={emissiveIntensity}
        />
      </RoundedBox>
      {FACE_LAYOUT.map((face, slot) => (
        <mesh
          key={slot}
          position={[
            face.pos[0] * FACE_PLANE_OFFSET,
            face.pos[1] * FACE_PLANE_OFFSET,
            face.pos[2] * FACE_PLANE_OFFSET,
          ]}
          rotation={face.rot}
        >
          <planeGeometry args={[FACE_PLANE_SIZE, FACE_PLANE_SIZE]} />
          <meshStandardMaterial
            map={textures[slot]!}
            color={dimmed ? '#2a2a2a' : '#ffffff'}
            roughness={0.45}
            metalness={0.05}
            emissive={emissiveHex}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      ))}
    </group>
  );
}

// ── Selection rules (mirror Game.tsx) ────────────────────────────────────────

function canSelectDie3D(d: DieInPool, lockedSymbol: DieSymbol | null): boolean {
  const s = d.face.symbol;
  if (s === 'blank') return false;
  if (s === 'special' || s === 'indirect' || s === 'discard' || s === 'draw') return false;
  if (s === 'focus') return lockedSymbol === null;
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
  cardColor?: string | null;
  /** Non-null when this pool's owner is activating — all dice in the pool tumble. */
  tumblingCharId?: string | null;
  /** Explicit die instance ids to tumble (e.g. reroll selection). */
  tumblingDieIds?: readonly string[] | null;
  /** Face overrides for focus-pick preview: dieId → chosen face. */
  faceOverrides?: Record<string, { faceIndex: number; face: DieFace }>;
  previewSelectedDieIds?: readonly string[];
  previewSpentDieIds?: readonly string[];
  previewRerollDieIds?: readonly string[];
}

export default function DicePool3D({
  dice,
  diceInteractive,
  selectionMode,
  eligibleSymbols,
  cardColor,
  tumblingCharId,
  tumblingDieIds,
  faceOverrides,
  previewSelectedDieIds,
  previewSpentDieIds,
  previewRerollDieIds,
}: DicePool3DProps) {
  const activeFlow    = useApp((s) => s.activeFlow);
  const setActiveFlow = useApp((s) => s.setActiveFlow);
  const toggleSelectedDie = useApp((s) => s.toggleSelectedDie);
  const game = useApp((s) => s.game);
  const dieInstanceFaces = useMemo(() => {
    if (!game) return undefined;
    const map: Record<string, readonly DieFace[]> = {};
    for (const player of Object.values(game.players)) {
      for (const char of Object.values(player.characters)) {
        for (const die of char.dice) {
          map[die.instanceId] = die.faces;
        }
      }
      for (const support of Object.values(player.supports)) {
        for (const die of support.dice) {
          map[die.instanceId] = die.faces;
        }
      }
    }
    return map;
  }, [game]);

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
    if (activeFlow?.kind === 'face-pick') {
      const flow = activeFlow;
      const isFocuser = flow.focuserDieIds.includes(d.instanceId);

      if (!isFocuser && flow.budget > 0 && flow.pickingForDieId !== d.instanceId) {
        setActiveFlow({ ...flow, pickingForDieId: d.instanceId });
        return;
      }
      if (!isFocuser && flow.pickingForDieId === d.instanceId) {
        setActiveFlow({ ...flow, pickingForDieId: null });
        return;
      }

      const lastFlip = [...flow.history].reverse().find(
        (e): e is Extract<FacePickEvent, { kind: 'flip' }> =>
          e.kind === 'flip' && e.targetDieId === d.instanceId,
      );
      const currentFaceIndex = lastFlip ? lastFlip.faceIndex : d.faceIndex;
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
      if (d.face.symbol === 'focus') {
        setActiveFlow({ kind: 'face-pick', focuserDieIds: [d.instanceId], budget: d.face.value, history: [], pickingForDieId: null });
        return;
      }
      setActiveFlow({ kind: 'resolve', symbol: d.face.symbol, selectedDieIds: [d.instanceId], pendingTargets: [] });
    }
  };

  const { bg: baseColor, text: textColor } = CARD_COLORS[cardColor ?? ''] ?? FALLBACK_COLOR;

  const xStart = -((dice.length - 1) * DIE_SPACING) / 2;

  if (dice.length === 0) {
    return <div style={{ minHeight: 40 }} className="w-full" />;
  }

  return (
    <div style={{ width: '100%', height: CANVAS_HEIGHT_PX }}>
      <Canvas
        orthographic
        camera={{ position: CAM_POS, zoom: CAM_ZOOM, near: 0.1, far: 50 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: true, antialias: true }}
        dpr={Math.min(window.devicePixelRatio, 2)}
      >
        <CameraRig diceCount={dice.length} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 5, 2]} intensity={0.9} castShadow={false} />

        {(() => {
          let tumblingCount = 0;
          return dice.map((d, i) => {
          const isTumbling =
            tumblingCharId != null ||
            (tumblingDieIds?.includes(d.instanceId) ?? false);
          const staggerIndex = isTumbling ? tumblingCount++ : 0;

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
            if (isFocuser) dieState = 'dimmed';
            else if (isPickingTarget) dieState = 'selected-resolve';
            else if (hasBeenFlipped) dieState = 'selected-reroll';
            else if (flow.budget > 0) dieState = 'eligible';
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
          const allFaces = dieInstanceFaces?.[d.instanceId];
          return (
            <Die3D
              key={d.instanceId}
              die={d}
              allFaces={allFaces}
              position={[xStart + i * DIE_SPACING, 0, 0]}
              baseColor={baseColor}
              textColor={textColor}
              state={dieState}
              isTumbling={isTumbling}
              staggerIndex={staggerIndex}
              overrideFaceIndex={override?.faceIndex ?? null}
              overrideFace={override?.face ?? null}
              onClick={() => handleTap(d)}
            />
          );
        });
        })()}
      </Canvas>
    </div>
  );
}
