/* ──────────────────────────────────────────────────────────────────
   The WebGL half of the transformer engine. Loaded lazily by
   TransformerEngine.tsx — nothing in here may run during SSR.

   Everything is unlit (Line2 wireframes + MeshBasicMaterial fills):
   the page supplies the mood, the scene supplies the drawing.

   ONE continuous machine, top → bottom along negative y — tokens fall
   in at the top, the answer drops out at the bottom, and every scene
   is authored directly in that world. Levels never swap scenes in and out — every
   part lives in a SlideGroup that damps position and opacity toward
   where the current level wants it, so scrolling reads as the machine
   taking itself apart in place: the block opens, the attention
   heatmap slides out of it like a file from a drawer, its Q/K/V parts
   separate around it, the MLP unpacks below, the deep stack continues
   down, and everything packs back at the end.

   TWO HARD-WON RULES — read before "fixing" anything here:
   1. NEVER put a negative `scale` on any ancestor group (a y-flip
      mirror, say). Line2 wireframe edges render nearly invisible
      under a mirrored transform while fills survive — the scene
      reads as dim murk. Every scene is authored directly in world
      space so no mirroring is needed.
   2. A black canvas is almost never this file. See the header of
      TransformerEngine.tsx for the checklist (backgrounded tabs,
      dev servers poisoned by unrelated broken islands). Verify on
      the production build in a fresh browser first.
   ────────────────────────────────────────────────────────────────── */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, OrthographicCamera, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import {
  CAMERA,
  COLORS,
  INPUT_TEXT,
  LEVEL_INDEX,
  NEXT_TOKEN,
  STACK_LEVELS,
  TOKENS,
  boxEdges,
  geluPoints,
  gridEdges,
  triangleCells,
  zoomFor,
  type LevelId,
  type Vec3,
} from '@/lib/transformer-engine';

type LineRef = React.ComponentRef<typeof Line>;
type Tone = 'steel' | 'blue' | 'blueHot' | 'rust' | 'cyan';

/** Shared label style. DOM, so it rides the page's type.
    whitespace-pre keeps leading spaces in tokens like " is" visible.
    The `plain` variant drops the mono-uppercase HUD treatment — for
    the one label that quotes the user's sentence verbatim. */
const LABEL =
  'pointer-events-none font-mono text-[10px] uppercase tracking-[0.15em] whitespace-pre transition-opacity duration-300';
const LABEL_PLAIN =
  'pointer-events-none text-[13px] whitespace-pre transition-opacity duration-300';

/**
 * Labels mount only while their scene is (being) shown — Html ignores
 * its parent group's visibility, so a hidden scene's labels would pile
 * up at the world origin. SlideGroup provides its target opacity
 * through this context.
 */
const SceneShown = createContext(true);

/**
 * A scene's LIVE fade (0‥1), as a mutable ref so per-frame consumers
 * (DiveHalo's pulse, Hotspot hitboxes) can read it inside useFrame
 * without re-rendering the scene tree. Anything that animates its own
 * material opacity MUST multiply by this — an absolute opacity write
 * clobbers the fade and the part blinks at full brightness inside a
 * scene that is supposed to be dimming away.
 */
const Fade = createContext<{ o: number }>({ o: 1 });

/* Tones index COLORS directly — never snapshot the hexes into a
   module-level map: setEnginePalette mutates COLORS on a theme flip
   and a snapshot would keep the old theme's colours. */

function Label({
  position,
  children,
  tone = 'steel',
  show = true,
  plain = false,
}: {
  position: Vec3;
  children: React.ReactNode;
  tone?: Tone;
  /** Faded with a CSS transition — hover-driven labels stay mounted. */
  show?: boolean;
  /** Sentence case, no HUD tracking — for quoting the user's words. */
  plain?: boolean;
}) {
  const shown = useContext(SceneShown);
  if (!shown) return null;
  return (
    <Html position={position} center zIndexRange={[5, 0]}>
      <span className={plain ? LABEL_PLAIN : LABEL} style={{ color: COLORS[tone], opacity: show ? 1 : 0 }}>
        {children}
      </span>
    </Html>
  );
}

/** One wireframe box: edges plus an optional translucent fill. Edges
    can run fainter (and in a different colour) than the fill — the
    shell outline. */
function Box({
  center,
  size,
  color = COLORS.blue,
  edgeColor,
  edgeOpacity = 1,
  lineWidth = 1,
  fill = 0.05,
  opacity = 1,
}: {
  center: Vec3;
  size: Vec3;
  color?: string;
  edgeColor?: string;
  edgeOpacity?: number;
  lineWidth?: number;
  fill?: number;
  opacity?: number;
}) {
  const edges = useMemo(() => boxEdges(center, size), [center, size]);
  return (
    <group>
      <Wire points={edges} color={edgeColor ?? color} lineWidth={lineWidth} opacity={opacity * edgeOpacity} />
      {fill > 0 && (
        <mesh position={center}>
          <boxGeometry args={size} />
          <meshBasicMaterial color={color} transparent opacity={fill * opacity} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** A wire line (segments). */
function Wire({
  points,
  color = COLORS.blue,
  lineWidth = 1,
  dashed = false,
  opacity = 1,
}: {
  points: Vec3[];
  color?: string;
  lineWidth?: number;
  dashed?: boolean;
  opacity?: number;
}) {
  return (
    <Line
      segments
      points={points}
      color={color}
      lineWidth={lineWidth}
      dashed={dashed}
      dashSize={0.08}
      gapSize={0.06}
      transparent
      opacity={opacity}
    />
  );
}

/** A vertical vector column: a box with internal cell divisions. */
function VectorColumn({
  x,
  z,
  baseY,
  cells,
  cellH,
  w,
  color = COLORS.blue,
}: {
  x: number;
  z: number;
  baseY: number;
  cells: number;
  cellH: number;
  w: number;
  color?: string;
}) {
  const edges = useMemo(() => {
    const h = cells * cellH;
    const out = boxEdges([x, baseY + h / 2, z], [w, h, w]);
    for (let i = 1; i < cells; i++) {
      const y = baseY + i * cellH;
      const hw = w / 2;
      out.push(
        [x - hw, y, z - hw], [x + hw, y, z - hw],
        [x + hw, y, z - hw], [x + hw, y, z + hw],
        [x + hw, y, z + hw], [x - hw, y, z + hw],
        [x - hw, y, z + hw], [x - hw, y, z - hw],
      );
    }
    return out;
  }, [x, z, baseY, cells, cellH, w]);
  return <Wire points={edges} color={color} lineWidth={0.75} />;
}

/** A score grid standing in the XY plane; the causal mask lights the
    lower triangle — no position may look at the future. */
function HeatGrid({
  c,
  n,
  cell,
  masked = true,
  hot = COLORS.blueHot,
}: {
  c: Vec3;
  n: number;
  cell: number;
  masked?: boolean;
  hot?: string;
}) {
  const cells = useMemo(
    () => (masked ? triangleCells(c, n, cell) : []),
    [c, n, cell, masked],
  );
  return (
    <group>
      <Wire points={gridEdges(c, n, cell)} color={COLORS.steel} lineWidth={0.6} />
      {cells.map((p, j) => (
        <mesh key={j} position={p}>
          <planeGeometry args={[cell * 0.88, cell * 0.88]} />
          <meshBasicMaterial
            color={hot}
            transparent
            opacity={0.32}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A bundle of curved connections between two rows of nodes — the
 * sankey/weave look. Dashes crawl along the curves: data flowing.
 */
function FlowBundle({
  from,
  to,
  links = 1,
  sag = 0.25,
  color = COLORS.steel,
  opacity = 0.5,
  speed = 0.7,
}: {
  from: Vec3[];
  to: Vec3[];
  links?: number;
  sag?: number;
  color?: string;
  opacity?: number;
  speed?: number;
}) {
  const refs = useRef<(LineRef | null)[]>([]);
  const curves = useMemo(() => {
    const out: Vec3[][] = [];
    from.forEach((f, i) => {
      for (let k = 0; k < links; k++) {
        const t = to[(i * links + k) % to.length];
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(...f),
          new THREE.Vector3((f[0] + t[0]) / 2, (f[1] + t[1]) / 2 + sag, (f[2] + t[2]) / 2 + sag * 0.5),
          new THREE.Vector3(...t),
        );
        out.push(curve.getPoints(14).map((p): Vec3 => [p.x, p.y, p.z]));
      }
    });
    return out;
  }, [from, to, links, sag]);
  useFrame(({ clock }) => {
    for (const l of refs.current) {
      const mat = l?.material as (THREE.LineBasicMaterial & { dashOffset?: number }) | undefined;
      if (mat && mat.dashOffset !== undefined) mat.dashOffset = -clock.elapsedTime * speed;
    }
  });
  return (
    <group>
      {curves.map((pts, i) => (
        <Line
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          points={pts}
          color={color}
          lineWidth={0.7}
          dashed
          dashSize={0.09}
          gapSize={0.07}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  );
}

/** Every material under `root` gets its opacity scaled by `k`. Each
    material's authored opacity is captured once as the base. */
function applyOpacity(root: THREE.Object3D, k: number) {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!mat) return;
    if (mat.userData.baseOpacity === undefined) mat.userData.baseOpacity = mat.opacity;
    mat.opacity = (mat.userData.baseOpacity as number) * k;
  });
}

/**
 * One scene's place in the machine. Position and opacity are damped
 * toward the level's targets, so a transition is parts sliding and
 * fading in place — never one drawing vanishing and another popping
 * in. Never nest these: nested groups would fight over the same
 * materials' opacity. Hidden groups leave the raycaster via `visible`.
 */
function SlideGroup({
  pos,
  opacity,
  reduced,
  children,
}: {
  pos: Vec3;
  opacity: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const st = useRef({ o: 0, applied: -1, init: false });
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const s = st.current;
    if (!s.init || reduced) {
      g.position.set(pos[0], pos[1], pos[2]);
      s.o = opacity;
      s.init = true;
    } else {
      const k = 5;
      g.position.x = THREE.MathUtils.damp(g.position.x, pos[0], k, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, pos[1], k, delta);
      g.position.z = THREE.MathUtils.damp(g.position.z, pos[2], k, delta);
      s.o = THREE.MathUtils.damp(s.o, opacity, k, delta);
    }
    if (Math.abs(s.o - s.applied) > 0.002) {
      applyOpacity(g, s.o);
      s.applied = s.o;
    }
    g.visible = s.o > 0.02;
  });
  return (
    <group ref={ref}>
      <Fade.Provider value={st.current}>
        <SceneShown.Provider value={opacity > 0.5}>{children}</SceneShown.Provider>
      </Fade.Provider>
    </group>
  );
}

/**
 * A hover/tap target that owns no geometry of its own: an invisible
 * hit box over a part. Hovering (desktop) or tapping (mobile) draws a
 * faint outline round the part and fades its label in — the drawing
 * stays text-free until someone reaches for it.
 */
function Hotspot({
  center,
  size,
  label,
  tone = 'steel',
}: {
  center: Vec3;
  size: Vec3;
  label: string;
  tone?: Tone;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const fade = useContext(Fade);
  const hit = useRef<THREE.Mesh>(null);
  /* Dead to the pointer while its scene is faded out — backdrop parts
     must not catch hovers meant for the scene in focus. */
  useFrame(() => {
    if (hit.current) hit.current.visible = fade.o > 0.5;
  });
  const edges = useMemo(
    () => boxEdges(center, [size[0] + 0.14, size[1] + 0.14, size[2] + 0.14]),
    [center, size],
  );
  return (
    <group>
      {hovered && <Wire points={edges} color={COLORS.blueHot} lineWidth={1.25} opacity={0.8} />}
      <Label
        position={[center[0], center[1] + size[1] / 2 + 0.38, center[2]]}
        tone={tone}
        show={hovered}
      >
        {label}
      </Label>
      <mesh
        ref={hit}
        position={center}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          setHovered((h) => !h);
        }}
        aria-label={label}
      >
        <boxGeometry args={[size[0] + 0.45, size[1] + 0.45, size[2] + 0.45]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Pulsing outline marking a dive target; its label shows on hover. */
function DiveHalo({
  center,
  size,
  onDive,
  label,
  tag,
}: {
  center: Vec3;
  size: Vec3;
  onDive: () => void;
  /** Accessibility name — "Open block 01". */
  label: string;
  /** Shown on hover; defaults to `label`. */
  tag?: string;
}) {
  const line = useRef<LineRef>(null);
  const hit = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const fade = useContext(Fade);
  useFrame(({ clock }) => {
    const mat = line.current?.material as THREE.LineBasicMaterial | undefined;
    /* Multiply by the scene fade — an absolute write here used to
       clobber applyOpacity, so dive halos blinked at FULL brightness
       inside scenes that were supposed to be dimming into the
       backdrop. */
    if (mat) mat.opacity = ((hovered ? 0.95 : 0.55) + Math.sin(clock.elapsedTime * 2.4) * 0.25) * fade.o;
    if (hit.current) hit.current.visible = fade.o > 0.5;
  });
  const edges = useMemo(
    () => boxEdges(center, [size[0] + 0.14, size[1] + 0.14, size[2] + 0.14]),
    [center, size],
  );
  return (
    <group>
      <Line
        ref={line}
        segments
        points={edges}
        color={COLORS.blueHot}
        lineWidth={hovered ? 2 : 1.25}
        transparent
        opacity={0.7}
      />
      <Label
        position={[center[0], center[1] + size[1] / 2 + 0.42, center[2]]}
        tone="blueHot"
        show={hovered}
      >
        {tag ?? label}
      </Label>
      <mesh
        ref={hit}
        position={center}
        onClick={(e) => {
          e.stopPropagation();
          onDive();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        aria-label={label}
      >
        <boxGeometry args={[size[0] + 0.5, size[1] + 0.5, size[2] + 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ── the overview stack ─────────────────────────────────────────── */

/** Every layer of the machine gets the same square footprint — the
    mac-mini body: even slabs, evenly paced. */
const SLAB: Vec3 = [2.9, 0.55, 2.9];
const PLATE: Vec3 = [2.9, 0.14, 2.9];

/** Token chips: two rows on the tokenizer plate, reading order. */
const CHIP: Vec3 = [0.6, 0.34, 0.56];
const CHIP_POS: Vec3[] = TOKENS.map((_, i) =>
  i < 4
    ? [-1.08 + i * 0.72, -0.42, -0.4]
    : [-0.72 + (i - 4) * 0.72, -0.42, 0.4],
);

/**
 * First-sight animation: the stack starts packed tight and the layers
 * settle into their exploded positions, staggered in stack order.
 * Runs once, on mount; reduced motion skips straight to exploded.
 */
function UnpackLayer({
  index,
  exploded,
  packed,
  progress,
  children,
}: {
  index: number;
  exploded: number;
  packed: number;
  progress: React.RefObject<number>;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = THREE.MathUtils.clamp(progress.current * 1.7 - index * 0.13, 0, 1);
    const e = t * t * (3 - 2 * t);
    g.position.y = (packed - exploded) * (1 - e);
  });
  return <group ref={ref}>{children}</group>;
}

/** [exploded anchor, packed anchor] per layer, in stack order —
    tokenizer first. World y descends: the tokenizer sits at the top
    and the output at the bottom. */
const UNPACK: [number, number][] = [
  [-0.2, -0.3], // tokenizer
  [-1.8, -0.95], // embeddings
  [-2.3, -1.55], // block 01
  [-2.98, -2.15], // block 02
  [-3.66, -2.75], // block 03
  [-4.3, -3.25], // final norm
  [-4.85, -3.7], // unembed
  [-6.1, -4.3], // output
];

/** Tokens going in, the answer coming out — chips riding the flow. */
function FlowChips() {
  const inRefs = useRef<(THREE.Mesh | null)[]>([]);
  const outRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < 3; i++) {
      const m = inRefs.current[i];
      if (!m) continue;
      const p = (t * 0.22 + i / 3) % 1;
      m.position.set(-0.6 + i * 0.6, 1.5 - p * 1.55, 0);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.85;
    }
    const out = outRef.current;
    if (out) {
      const p = (t * 0.3) % 1;
      out.position.set(0, -6.85 - p * 1.7, 0);
      (out.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.9;
    }
  });
  const chip = (color: string, size: Vec3) => (
    <>
      <boxGeometry args={size} />
      <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
    </>
  );
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(el) => { inRefs.current[i] = el; }}>
          {chip(COLORS.cyan, [0.3, 0.16, 0.16])}
        </mesh>
      ))}
      <mesh ref={outRef}>{chip(COLORS.blueHot, [0.34, 0.2, 0.2])}</mesh>
    </group>
  );
}

/** The seven token chips and their texts. Kept out of OverviewStack
    so the chips can slide toward the embeddings on their own
    SlideGroup without nesting opacity groups. */
function TokenChips() {
  return (
    <group>
      {TOKENS.map((t, i) => (
        <group key={t.id}>
          <Box center={CHIP_POS[i]} size={CHIP} color={COLORS.cyan} fill={0.18} />
          <Label position={[CHIP_POS[i][0], -0.88, CHIP_POS[i][2]]} tone="cyan">{t.text}</Label>
        </group>
      ))}
    </group>
  );
}

function OverviewStack({ onDive, reduced }: { onDive: (l: LevelId) => void; reduced: boolean }) {
  const bars = useMemo(() => [0.18, 0.32, 0.24, 0.5, 0.14, 0.38, 0.86, 0.22, 0.3], []);
  const progress = useRef(reduced ? 1 : 0);
  useFrame((_, delta) => {
    if (progress.current < 1) progress.current = Math.min(progress.current + delta / 3.4, 1);
  });
  const layer = (i: number, children: React.ReactNode) => (
    <UnpackLayer index={i} exploded={UNPACK[i][0]} packed={UNPACK[i][1]} progress={progress}>
      {children}
    </UnpackLayer>
  );
  return (
    <group>
      <FlowChips />

      {/* tokenizer: the question, cut into teal chips (chips themselves
          live in TokenChips so they can slide on their own) */}
      {layer(
        0,
        <group>
          <Box center={[0, -0.15, 0]} size={PLATE} color={COLORS.cyan} edgeOpacity={0.55} fill={0.04} />
          <Label position={[0, 0.28, 0]}>[{TOKENS.map((t) => t.id).join(' · ')}]</Label>
          <Label position={[0, 0.85, 0]} tone="cyan" plain>“{INPUT_TEXT}”</Label>
        </group>,
      )}

      {/* embeddings: one teal column per token */}
      {layer(
        1,
        <group>
          <Box center={[0, -1.15, 0]} size={[2.9, 0.06, 2.9]} color={COLORS.steel} edgeOpacity={0.5} fill={0.02} />
          {CHIP_POS.map((p, i) => (
            <VectorColumn key={i} x={p[0]} z={p[2]} baseY={-2.58} cells={8} cellH={0.17} w={0.4} color={COLORS.steelLight} />
          ))}
          <Hotspot center={[0, -1.9, 0]} size={[2.9, 1.5, 2.9]} label="embedding + position" />
        </group>,
      )}

      {/* blocks: three square slabs, the first one lit */}
      {layer(
        2,
        <group>
          <Box center={[0, -2.3, 0]} size={SLAB} color={COLORS.blue} edgeColor={COLORS.blueHot} edgeOpacity={0.85} fill={0.14} />
          <DiveHalo center={[0, -2.3, 0]} size={SLAB} onDive={() => onDive('block')} label="Open block 01" tag="block 01" />
        </group>,
      )}
      {layer(
        3,
        <group>
          <Box center={[0, -2.98, 0]} size={SLAB} color={COLORS.blue} edgeColor={COLORS.steelLight} edgeOpacity={0.5} fill={0.05} />
          <Wire
            points={[
              [1.8, -2.02, 0], [1.8, -3.94, 0],
              [1.7, -2.02, 0], [1.8, -2.02, 0],
              [1.7, -3.94, 0], [1.8, -3.94, 0],
            ]}
            color={COLORS.steel}
            dashed
          />
        </group>,
      )}
      {layer(
        4,
        <group>
          <Box center={[0, -3.66, 0]} size={SLAB} color={COLORS.blue} edgeColor={COLORS.steelLight} edgeOpacity={0.5} fill={0.05} />
          <Hotspot center={[0, -3.32, 0]} size={[2.9, 1.34, 2.9]} label="× 96" />
        </group>,
      )}

      {/* final norm + unembed */}
      {layer(
        5,
        <group>
          <Box center={[0, -4.3, 0]} size={PLATE} color={COLORS.blue} edgeColor={COLORS.steelLight} edgeOpacity={0.5} fill={0.06} />
          <Hotspot center={[0, -4.3, 0]} size={PLATE} label="final norm" />
        </group>,
      )}
      {layer(
        6,
        <group>
          <Box center={[0, -4.85, 0]} size={[2.9, 0.26, 2.9]} color={COLORS.blue} edgeOpacity={0.7} fill={0.08} />
          <Hotspot center={[0, -4.85, 0]} size={[2.9, 0.26, 2.9]} label="unembed" />
        </group>,
      )}

      {/* output: the distribution, then the answer */}
      {layer(
        7,
        <group>
          <Box center={[0, -5.35, 0]} size={PLATE} color={COLORS.steel} edgeOpacity={0.5} fill={0.03} />
          {bars.map((h, i) => (
            <Box
              key={i}
              center={[-1.44 + i * 0.36, -5.42 - h / 2, 0]}
              size={[0.18, h, 0.18]}
              color={i === 6 ? COLORS.blueHot : COLORS.steel}
              fill={i === 6 ? 0.3 : 0.05}
            />
          ))}
          <Box center={[0, -6.6, 0]} size={[1.15, 0.42, 0.42]} color={COLORS.blueHot} fill={0.2} />
          <Label position={[0, -7.05, 0]} tone="blueHot">{NEXT_TOKEN}</Label>
          <Hotspot center={[0, -5.85, 0]} size={[2.9, 1.1, 0.5]} label="p(next)" />
        </group>,
      )}
    </group>
  );
}

/* ── block internals ────────────────────────────────────────────── */

const SUB_SLAB: Vec3 = [3.2, 0.4, 1.7];
const SUB_WIDE: Vec3 = [3.2, 0.95, 1.7];

/** The block's own attention heatmap lies FLAT inside the attention
    slab — a file kept flat in a drawer (matrices lie; see
    AttentionInternals). The attention dive's heatmap lands in the
    same orientation, so the handoff reads as the same object. */
export const BLOCK_HEAT_POS: Vec3 = [0, -3.35, 0];

function BlockInternals({ onDive }: { onDive: (l: LevelId) => void }) {
  /* nodes for the MLP slab's connection weave */
  const mlpBottom = useMemo<Vec3[]>(
    () => [-1.1, -0.55, 0, 0.55, 1.1].map((x) => [x, -5.68, 0.3]),
    [],
  );
  const mlpTop = useMemo<Vec3[]>(
    () => [-1.3, -0.85, -0.4, 0, 0.4, 0.85, 1.3].map((x) => [x, -6.62, 0.3]),
    [],
  );
  return (
    <group>
      {/* thin slabs: norms and adds */}
      {[
        { y: -2.35, label: 'ln' },
        { y: -4.45, label: 'add & norm' },
        { y: -5.35, label: 'ln' },
        { y: -7.25, label: 'add & norm' },
      ].map((s) => (
        <group key={s.label + s.y}>
          <Box center={[0, s.y, 0]} size={SUB_SLAB} color={COLORS.blue} edgeColor={COLORS.steelLight} edgeOpacity={0.9} fill={0.02} />
          <Hotspot center={[0, s.y, 0]} size={SUB_SLAB} label={s.label} />
        </group>
      ))}

      {/* attention slab — its heatmap lives in a sibling SlideGroup so
          it can slide out of the slab like a file from a drawer */}
      <Box center={[0, -3.35, 0]} size={SUB_WIDE} color={COLORS.blue} edgeColor={COLORS.blueHot} edgeOpacity={1} lineWidth={1.5} fill={0.04} />
      <DiveHalo center={[0, -3.35, 0]} size={SUB_WIDE} onDive={() => onDive('attention')} label="Open attention" tag="multi-head attention" />

      {/* mlp slab — connections flowing through */}
      <Box center={[0, -6.15, 0]} size={SUB_WIDE} color={COLORS.blue} edgeColor={COLORS.blueHot} edgeOpacity={1} lineWidth={1.5} fill={0.04} />
      <FlowBundle from={mlpBottom} to={mlpTop} links={2} sag={-0.12} color={COLORS.blueHot} opacity={0.45} />
      <DiveHalo center={[0, -6.15, 0]} size={SUB_WIDE} onDive={() => onDive('mlp')} label="Open the MLP" tag="mlp" />

      {/* residual stream: bypass line + junctions at the two adds */}
      <Wire points={[[2.0, -1.85, 0], [2.0, -7.75, 0]]} color={COLORS.rust} lineWidth={1.75} />
      {[-4.45, -7.25].map((y) => (
        <group key={y}>
          <Wire points={[[1.6, y, 0], [2.0, y, 0]]} color={COLORS.rust} dashed />
          <Wire
            points={[[1.9, y, 0], [2.1, y, 0], [2.0, y - 0.1, 0], [2.0, y + 0.1, 0]]}
            color={COLORS.rust}
            lineWidth={1.75}
          />
        </group>
      ))}
      <Hotspot center={[2.0, -4.8, 0]} size={[0.7, 6.2, 0.7]} label="residual stream" tone="rust" />
    </group>
  );
}

/* ── attention internals ────────────────────────────────────────── */

/**
 * The heatmap decomposed: Q and K maps talk to each other, their
 * conversation becomes the score grid, and the grid talks to V.
 *
 * Every map lies FLAT on the ground (XZ plane) — the token stream
 * falls through the machine top→bottom, so a map standing upright
 * would put its grid axes perpendicular to the flow: literally the
 * wrong orientation. Vectors stand; matrices lie.
 */
function AttentionInternals() {
  /* Q/K edges face each other across z; heat's left edge faces them */
  const qFront = useMemo<Vec3[]>(() => [-3.1, -2.7, -2.3].map((x) => [x, 0.06, -0.45]), []);
  const kBack = useMemo<Vec3[]>(() => [-3.1, -2.7, -2.3].map((x) => [x, 0.06, 0.55]), []);
  const qEdge = useMemo<Vec3[]>(() => [-1.4, -1.05, -0.7].map((z) => [-2.1, 0.06, z]), []);
  const kEdge = useMemo<Vec3[]>(() => [0.7, 1.05, 1.4].map((z) => [-2.1, 0.06, z]), []);
  const heatLeft = useMemo<Vec3[]>(() => [-0.35, 0, 0.35].map((z) => [-0.12, 0.06, z]), []);
  const heatFront = useMemo<Vec3[]>(() => [0.15, 0.5, 0.85].map((x) => [x, 0.06, 0.62]), []);
  const vBack = useMemo<Vec3[]>(() => [0.15, 0.5, 0.85].map((x) => [x, 0.06, 1.55]), []);
  return (
    <group>
      {/* input vector, projected three ways */}
      <VectorColumn x={-4.4} z={-0.5} baseY={0.02} cells={7} cellH={0.19} w={0.36} color={COLORS.cyan} />
      <Hotspot center={[-4.4, 0.72, -0.5]} size={[0.6, 1.7, 0.6]} label="x" tone="cyan" />
      <Wire points={[[-4.2, 1.05, -0.6], [-3.3, 0.06, -1.05]]} color={COLORS.steel} dashed />
      <Wire points={[[-4.2, 0.7, -0.3], [-3.3, 0.06, 1.15]]} color={COLORS.steel} dashed />
      <Wire points={[[-4.2, 0.35, 0], [-0.15, 0.06, 2.15]]} color={COLORS.steel} dashed />

      {/* Q and K maps, talking — flat on the ground */}
      <Box center={[-2.7, 0, -1.05]} size={[1.15, 0.08, 1.15]} fill={0.08} />
      <group position={[-2.7, 0.06, -1.05]} rotation={[Math.PI / 2, 0, 0]}>
        <HeatGrid c={[0, 0, 0]} n={4} cell={0.26} masked={false} />
      </group>
      <Hotspot center={[-2.7, 0, -1.05]} size={[1.15, 0.2, 1.15]} label="Q map" tone="blueHot" />
      <Box center={[-2.7, 0, 1.15]} size={[1.15, 0.08, 1.15]} fill={0.08} />
      <group position={[-2.7, 0.06, 1.15]} rotation={[Math.PI / 2, 0, 0]}>
        <HeatGrid c={[0, 0, 0]} n={4} cell={0.26} masked={false} />
      </group>
      <Hotspot center={[-2.7, 0, 1.15]} size={[1.15, 0.2, 1.15]} label="K map" tone="blueHot" />
      <FlowBundle from={qFront} to={kBack} sag={0.4} color={COLORS.blueHot} opacity={0.7} />

      {/* their conversation: the score grid, causal-masked */}
      <group position={[0.5, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <HeatGrid c={[0, 0, 0]} n={5} cell={0.24} />
      </group>
      <Hotspot center={[0.5, 0, 0]} size={[1.3, 0.2, 1.3]} label="softmax(QKᵀ/√d) · mask" tone="blue" />
      <Label position={[1.95, 0.35, 0.9]}>one head of 12</Label>
      <FlowBundle from={qEdge} to={heatLeft} sag={0.3} color={COLORS.blueHot} opacity={0.6} />
      <FlowBundle from={kEdge} to={heatLeft} sag={0.3} color={COLORS.blueHot} opacity={0.6} />

      {/* the grid talks to V */}
      <Box center={[0.5, 0, 2.15]} size={[1.15, 0.08, 1.15]} fill={0.08} />
      <group position={[0.5, 0.06, 2.15]} rotation={[Math.PI / 2, 0, 0]}>
        <HeatGrid c={[0, 0, 0]} n={4} cell={0.26} masked={false} />
      </group>
      <Hotspot center={[0.5, 0, 2.15]} size={[1.15, 0.2, 1.15]} label="V map" tone="blueHot" />
      <FlowBundle from={heatFront} to={vBack} sag={0.25} color={COLORS.blueHot} opacity={0.7} />

      {/* output projection */}
      <Box center={[2.4, 0, 0]} size={[0.5, 0.08, 1.3]} fill={0.08} />
      <Hotspot center={[2.4, 0, 0]} size={[0.5, 0.2, 1.3]} label="Wₒ" tone="blueHot" />
      <FlowBundle from={[[1.08, 0.06, 2.15]]} to={[[2.4, 0.06, 0.68]]} sag={0.5} color={COLORS.steel} opacity={0.6} />
      <VectorColumn x={3.7} z={0} baseY={0.02} cells={7} cellH={0.19} w={0.36} />
      <Hotspot center={[3.7, 0.72, 0]} size={[0.6, 1.7, 0.6]} label="out" />
      <Wire points={[[2.66, 0.06, 0], [3.5, 0.35, 0]]} color={COLORS.steel} dashed />
    </group>
  );
}

/* ── MLP internals ──────────────────────────────────────────────── */

/**
 * Token-wise: a row of token slots below, all empty but one — the MLP
 * processes each position alone. Connections weave stage to stage:
 * widen 4×, GELU, narrow back, something comes out. Parked below the
 * attention scene, where the block keeps its MLP slab.
 */
function MlpInternals() {
  const gelu = useMemo(() => geluPoints([-0.4, 3.15, 0], 1.5, 0.75), []);
  const xNodes = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [-3.72, 4.7 + i * 0.28, 0]),
    [],
  );
  const upLeft = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [-2.6, 4.35 + i * 0.45, 0]),
    [],
  );
  const upRight = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [-1.8, 4.35 + i * 0.45, 0]),
    [],
  );
  const hidLeft = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [-0.65, 4.35 + i * 0.42, 0]),
    [],
  );
  const hidRight = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [-0.15, 4.35 + i * 0.42, 0]),
    [],
  );
  const downLeft = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [1.0, 4.35 + i * 0.45, 0]),
    [],
  );
  const downRight = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [1.8, 4.35 + i * 0.45, 0]),
    [],
  );
  const outNodes = useMemo<Vec3[]>(
    () => [0, 1, 2, 3, 4].map((i) => [2.92, 4.7 + i * 0.28, 0]),
    [],
  );
  return (
    <group>
      {/* token slots below — every position gets the same MLP, one at
          a time; only this one is lit */}
      {[-5.3, -4.6, -3.9, -3.2, -2.5].map((x) => (
        <Box
          key={x}
          center={[x, 2.6, 0]}
          size={[0.5, 0.8, 0.5]}
          color={x === -3.9 ? COLORS.cyan : COLORS.steel}
          fill={x === -3.9 ? 0.18 : 0}
          opacity={x === -3.9 ? 1 : 0.55}
        />
      ))}
      <Hotspot center={[-3.9, 2.6, 0]} size={[3.4, 0.9, 0.6]} label="token slots" />
      <Wire points={[[-3.9, 3.05, 0], [-3.9, 4.4, 0]]} color={COLORS.cyan} dashed />

      <VectorColumn x={-3.9} z={0} baseY={4.5} cells={7} cellH={0.2} w={0.36} color={COLORS.cyan} />
      <Hotspot center={[-3.9, 5.3, 0]} size={[0.6, 1.9, 0.6]} label="x · d" tone="cyan" />

      <Box center={[-2.2, 5.25, 0]} size={[0.8, 2.6, 0.12]} fill={0.07} />
      <Hotspot center={[-2.2, 5.25, 0]} size={[0.8, 2.6, 0.2]} label="W↑ · 4d" tone="blueHot" />
      <FlowBundle from={xNodes} to={upLeft} links={2} sag={0.15} opacity={0.45} />

      <VectorColumn x={-0.4} z={0} baseY={4.2} cells={10} cellH={0.21} w={0.5} />
      <Hotspot center={[-0.4, 5.3, 0]} size={[0.7, 2.5, 0.7]} label="4d" />
      <FlowBundle from={upRight} to={hidLeft} links={2} sag={0.15} opacity={0.45} />

      <Line points={gelu} color={COLORS.blueHot} lineWidth={1.5} />
      <Wire points={[[-0.4, 4.15, 0], [-0.4, 3.6, 0]]} color={COLORS.steel} dashed />
      <Hotspot center={[-0.4, 3.15, 0]} size={[1.7, 0.9, 0.4]} label="gelu" tone="blueHot" />

      <Box center={[1.4, 5.25, 0]} size={[0.8, 2.6, 0.12]} fill={0.07} />
      <Hotspot center={[1.4, 5.25, 0]} size={[0.8, 2.6, 0.2]} label="W↓ · d" tone="blueHot" />
      <FlowBundle from={hidRight} to={downLeft} links={2} sag={0.15} opacity={0.45} />

      <VectorColumn x={3.1} z={0} baseY={4.5} cells={7} cellH={0.2} w={0.36} />
      <Hotspot center={[3.1, 5.3, 0]} size={[0.6, 1.9, 0.6]} label="out · d" />
      <FlowBundle from={downRight} to={outNodes} links={1} sag={0.15} opacity={0.45} />

      {/* …and something comes out */}
      <Box center={[3.1, 6.35, 0]} size={[0.5, 0.3, 0.3]} color={COLORS.blueHot} fill={0.25} />
      <Wire points={[[3.1, 5.9, 0], [3.1, 6.2, 0]]} color={COLORS.blueHot} dashed />
    </group>
  );
}

/* ── the deep stack ─────────────────────────────────────────────── */

/** Block after block after block — the depth is the brute force, and
    the residual stream runs down the whole spine. */
function DeepStack() {
  const slabs = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => 3.2 - i * 0.62), []);
  return (
    <group>
      {slabs.map((y, i) => (
        <Box
          key={y}
          center={[0, y, 0]}
          size={SLAB}
          color={i === 0 ? COLORS.blue : COLORS.steel}
          edgeColor={i === 0 ? COLORS.blueHot : COLORS.steelLight}
          edgeOpacity={i === 0 ? 0.8 : 0.5}
          fill={i === 0 ? 0.14 : 0.05}
          opacity={1 - i * 0.13}
        />
      ))}
      {/* continuing down past the bottom of the drawing */}
      {[[-1.45, -1.45], [1.45, -1.45], [0, 1.45]].map(([x, z]) => (
        <Wire key={x + z} points={[[x, -0.72, z], [x, -2.1, z]]} color={COLORS.steel} dashed opacity={0.5} />
      ))}
      <Label position={[0, -1.9, 0]}>· · ·</Label>
      <Hotspot center={[0, 3.2, 0]} size={SLAB} label="block × 96" tone="blueHot" />

      {/* the residual spine */}
      <Wire points={[[2.0, 3.9, 0], [2.0, -2.0, 0]]} color={COLORS.rust} lineWidth={1.75} />
      {slabs.map((y) => (
        <Wire key={y} points={[[1.45, y, 0], [2.0, y, 0]]} color={COLORS.rust} dashed opacity={0.7} />
      ))}
      <Hotspot center={[2.0, 0.95, 0]} size={[0.7, 6, 0.7]} label="residual stream" tone="rust" />
    </group>
  );
}

/* ── the packed unit ────────────────────────────────────────────── */

/** The end of the tour: the whole machine folded back into its box —
    one dense little unit, status light on, ready. */
function PackedUnit() {
  const slit = useRef<LineRef>(null);
  useFrame(({ clock }) => {
    const mat = slit.current?.material as THREE.LineBasicMaterial | undefined;
    if (mat) mat.opacity = 0.55 + Math.sin(clock.elapsedTime * 1.8) * 0.35;
  });
  return (
    <group>
      <Box center={[0, 1.45, 0]} size={[2.9, 2.9, 2.9]} fill={0.14} />
      <Box center={[0, 1.45, 0]} size={[2.3, 2.3, 2.3]} color={COLORS.steel} edgeOpacity={0.6} fill={0.05} />
      <Box center={[0, 1.45, 0]} size={[1.6, 1.6, 1.6]} color={COLORS.steel} edgeOpacity={0.45} fill={0.03} opacity={0.6} />
      {/* status slit on the front face */}
      <Line
        ref={slit}
        segments
        points={[[-0.8, 0.9, 1.47], [0.8, 0.9, 1.47]]}
        color={COLORS.blueHot}
        lineWidth={2.5}
        transparent
        opacity={0.8}
      />
      <Label position={[0, -0.55, 0]} tone="blueHot">engine · ready</Label>
    </group>
  );
}

/* ── pulses: the engine running ─────────────────────────────────── */

const PULSE_COUNT = 26;
const PULSE_TOP = 8.1;

function Pulses() {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(
    () => Array.from({ length: PULSE_COUNT }, (_, i) => (i * 0.37) % 1),
    [],
  );
  useFrame(({ clock }) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const t = clock.elapsedTime * 0.55;
    for (let i = 0; i < PULSE_COUNT; i++) {
      const y = -(((seeds[i] + t * 0.12) % 1) * PULSE_TOP + 0.1);
      attr.setXYZ(i, Math.sin(i * 7.3) * 0.06, y, Math.cos(i * 5.1) * 0.06);
    }
    attr.needsUpdate = true;
  });
  const positions = useMemo(() => new Float32Array(PULSE_COUNT * 3), []);
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={COLORS.blueHot}
        size={0.075}
        sizeAttenuation
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/* ── camera ─────────────────────────────────────────────────────── */

function CameraRig({
  level,
  reduced,
  zoomBias,
}: {
  level: LevelId;
  reduced: boolean;
  zoomBias: number;
}) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    enabled: boolean;
    update: () => void;
  } | null;
  const goal = useRef(CAMERA[level]);
  const settled = useRef(false);

  /* OrbitControls starts life aiming at the world origin; the scene
     lives below it, so the very first thing we do is swing the target
     onto the level's preset. Runs again if the controls object
     arrives late. */
  useEffect(() => {
    if (!controls) return;
    const g = CAMERA[level];
    controls.target.set(...g.target);
    camera.position.set(...g.position);
    camera.zoom = zoomFor(level, size.width, size.height) * zoomBias;
    camera.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  if (goal.current !== CAMERA[level]) {
    goal.current = CAMERA[level];
    settled.current = false;
  }

  /* Reframe on viewport resize or a zoom-control step. */
  const lastSize = useRef(size);
  if (lastSize.current !== size) {
    lastSize.current = size;
    settled.current = false;
  }
  const lastBias = useRef(zoomBias);
  if (lastBias.current !== zoomBias) {
    lastBias.current = zoomBias;
    settled.current = false;
  }

  useFrame((_, delta) => {
    if (settled.current || !controls) return;
    const g = goal.current;
    const gz = zoomFor(level, size.width, size.height) * zoomBias;
    if (reduced) {
      camera.position.set(...g.position);
      controls.target.set(...g.target);
      camera.zoom = gz;
    } else {
      const k = 3.4;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, g.position[0], k, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, g.position[1], k, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, g.position[2], k, delta);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, g.target[0], k, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, g.target[1], k, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, g.target[2], k, delta);
      camera.zoom = THREE.MathUtils.damp(camera.zoom, gz, k, delta);
    }
    camera.updateProjectionMatrix();
    controls.update();
    const dp = camera.position.distanceTo(new THREE.Vector3(...g.position));
    const dz = Math.abs(camera.zoom - gz);
    if ((dp < 0.02 && dz < 0.5) || reduced) {
      settled.current = true;
      controls.enabled = true;
    } else {
      controls.enabled = false;
    }
  });
  return null;
}

/* ── the canvas ─────────────────────────────────────────────────── */

export default function EngineCanvas({
  level,
  onDive,
  onInteract,
  onContextLost,
  frameloop,
  reducedMotion,
  zoomBias,
}: {
  level: LevelId;
  onDive: (level: LevelId) => void;
  onInteract: () => void;
  /** The browser killed the WebGL context — the shell remounts us. */
  onContextLost: () => void;
  frameloop: 'always' | 'never';
  reducedMotion: boolean;
  zoomBias: number;
}) {
  const preset = CAMERA[level];

  /* Where each scene wants to be at this level. Positions are damped
     toward these — the drawer transitions. Scenes past their level
     slide on downward (the flow direction); scenes not yet reached
     wait above. */
  const inStack = STACK_LEVELS.includes(level);
  const inBlock = level === 'block' || level === 'attention' || level === 'mlp' || level === 'deep';
  const pastAttention = LEVEL_INDEX[level] > LEVEL_INDEX.attention;
  const pastMlp = LEVEL_INDEX[level] > LEVEL_INDEX.mlp;
  const pastDeep = LEVEL_INDEX[level] > LEVEL_INDEX.deep;
  const beforeBlock = LEVEL_INDEX[level] < LEVEL_INDEX.block;

  const attentionPos: Vec3 = level === 'attention'
    ? [-0.5, -6.65, 0]
    : pastAttention
      ? [-0.5, -7.15, 0]
      : [-0.5, -5.75, 0];
  const mlpPos: Vec3 = level === 'mlp'
    ? [0, -10.55, 0]
    : pastMlp
      ? [0, -11.05, 0]
      : [0, -9.65, 0];
  const deepPos: Vec3 = level === 'deep'
    ? [0, -11.5, 0]
    : pastDeep
      ? [0, -12, 0]
      : [0, -10.6, 0];

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true }}
      frameloop={frameloop}
      onPointerDown={onInteract}
      onCreated={({ gl }) => {
        /* preventDefault marks the context restorable; the shell
           answers with a full remount (fresh canvas, fresh context),
           which is the only reliable recovery — three.js's own
           restore path leaves half-initialised GPU state. */
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <OrthographicCamera makeDefault position={preset.position} zoom={60} near={0.1} far={100} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
        onStart={onInteract}
      />
      <CameraRig level={level} reduced={reducedMotion} zoomBias={zoomBias} />
      <group>
        {/* The machine runs top → bottom: tokens fall in at the top,
            the answer drops out at the bottom — scroll direction and
            data direction agree. */}
        <SlideGroup pos={[0, 0, 0]} opacity={level === 'packed' ? 0 : 1} reduced={reducedMotion}>
          <Pulses />
        </SlideGroup>
        <SlideGroup
          pos={inStack ? [0, 0, 0] : [0, 1.6, 0]}
          opacity={inStack ? 1 : 0}
          reduced={reducedMotion}
        >
          <OverviewStack onDive={onDive} reduced={reducedMotion} />
        </SlideGroup>
        <SlideGroup
          pos={
            inStack
              ? level === 'tokens' || level === 'embeddings'
                ? [0, -0.55, 0]
                : [0, 0, 0]
              : [0, 1.6, 0]
          }
          opacity={inStack ? 1 : 0}
          reduced={reducedMotion}
        >
          <TokenChips />
        </SlideGroup>
        <SlideGroup
          pos={inBlock ? [0, 0, 0] : [0, 2.4, 0]}
          opacity={
            level === 'block' ? 1 : level === 'attention' ? 0.08 : level === 'mlp' || level === 'deep' ? 0.06 : 0
          }
          reduced={reducedMotion}
        >
          <BlockInternals onDive={onDive} />
        </SlideGroup>
        {/* the block's heatmap, on its own group: at the block level
            it lies flat inside the attention slab; diving slides it
            down out of the slab — a file out of a drawer */}
        <SlideGroup
          pos={level === 'block' ? [0, 0, 0] : beforeBlock ? [0, 2.4, 0] : [0, -0.6, 0]}
          opacity={level === 'block' ? 1 : 0}
          reduced={reducedMotion}
        >
          <group position={BLOCK_HEAT_POS} rotation={[Math.PI / 2, 0, 0]}>
            <HeatGrid c={[0, 0, 0]} n={4} cell={0.21} />
          </group>
        </SlideGroup>
        <SlideGroup pos={attentionPos} opacity={level === 'attention' ? 1 : 0} reduced={reducedMotion}>
          <AttentionInternals />
        </SlideGroup>
        <SlideGroup pos={mlpPos} opacity={level === 'mlp' ? 1 : 0} reduced={reducedMotion}>
          <MlpInternals />
        </SlideGroup>
        <SlideGroup pos={deepPos} opacity={level === 'deep' ? 1 : 0} reduced={reducedMotion}>
          <DeepStack />
        </SlideGroup>
        <SlideGroup pos={[0, 0, 0]} opacity={level === 'packed' ? 1 : 0} reduced={reducedMotion}>
          <PackedUnit />
        </SlideGroup>
      </group>
    </Canvas>
  );
}
