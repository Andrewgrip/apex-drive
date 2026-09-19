import * as THREE from "three";

/** The terrain is procedural and endless; this is only a sanity limit for the physics. */
export const WORLD_BOUND = 1_000_000;
export const CITY_HALF = 100;

/** Flat paved skid pad used by the Drift Challenge. */
export const ARENA = { x: 0, z: 820, r: 150 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function terrainHeight(x: number, z: number): number {
  const cheb = Math.max(Math.abs(x), Math.abs(z));
  const mask = smoothstep(CITY_HALF + 8, CITY_HALF + 55, cheb);
  const h =
    5.5 * Math.sin(x * 0.021) * Math.cos(z * 0.017) +
    3.2 * Math.sin((x + z) * 0.031 + 1.3) +
    1.6 * Math.sin(x * 0.05 - z * 0.043) +
    0.6 * Math.sin(x * 0.11 + z * 0.09);
  // flatten the terrain along the speedway (z ~ 0, x > 232) and inside the drift arena
  const corridor = 1 - (1 - smoothstep(14, 90, Math.abs(z))) * smoothstep(232, 330, x);
  const arena = smoothstep(ARENA.r + 10, ARENA.r + 90, Math.hypot(x - ARENA.x, z - ARENA.z));
  return (h + 4) * mask * corridor * arena;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Track ----------

function makeTrackCurve() {
  const pts: THREE.Vector3[] = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 200 + 48 * Math.sin(i * 2.3) + 22 * Math.cos(i * 1.1 + 0.6);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);
}

export const trackCurve = makeTrackCurve();

export interface RoadSample {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

function sampleClosed(curve: THREE.CatmullRomCurve3, n: number): RoadSample[] {
  const pts = curve.getSpacedPoints(n);
  const out: RoadSample[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    out.push({ x: p.x, z: p.z, tx, tz });
  }
  return out;
}

export const trackSamples = sampleClosed(trackCurve, 520);

function straightSamples(x0: number, z0: number, x1: number, z1: number, n: number): RoadSample[] {
  const out: RoadSample[] = [];
  let tx = x1 - x0;
  let tz = z1 - z0;
  const l = Math.hypot(tx, tz) || 1;
  tx /= l;
  tz /= l;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx, tz });
  }
  return out;
}

export const connectorSamples = straightSamples(CITY_HALF - 2, 0, trackSamples[0].x - 4, 0, 60);

export function buildRoadGeometry(
  samples: RoadSample[],
  halfWidth: number,
  closed: boolean,
  kerbs: boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const asphalt = new THREE.Color("#2b2d31");
  const asphaltLight = new THREE.Color("#33363b");
  const line = new THREE.Color("#e8e2cf");
  const kerbRed = new THREE.Color("#c8352b");
  const kerbWhite = new THREE.Color("#ececec");
  const kerbW = kerbs ? 1.0 : 0;
  // Ten vertices per cross-section: the extra ones sit 1 cm apart so the kerb and the centre line
  // stay crisp instead of fading into the asphalt (colours are interpolated between vertices).
  const offsets = [-halfWidth - kerbW, -halfWidth, -halfWidth + 0.01, -0.16, -0.15, 0.15, 0.16, halfWidth - 0.01, halfWidth, halfWidth + kerbW];
  const V = offsets.length;
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const nx = -s.tz;
    const nz = s.tx;
    const kerbCol = Math.floor(i / 5) % 2 === 0 ? kerbRed : kerbWhite;
    const lineCol = i % 10 < 5 ? line : i % 2 === 0 ? asphalt : asphaltLight;
    const asp = i % 2 === 0 ? asphalt : asphaltLight;
    const cols = [kerbCol, kerbCol, asp, asp, lineCol, lineCol, asp, asp, kerbCol, kerbCol];
    for (let k = 0; k < V; k++) {
      const off = offsets[k];
      const x = s.x + nx * off;
      const z = s.z + nz * off;
      const isKerb = k <= 1 || k >= V - 2;
      const y = terrainHeight(x, z) + 0.08 + (isKerb ? 0.04 : 0);
      positions.push(x, y, z);
      const c = cols[k];
      colors.push(c.r, c.g, c.b);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * V;
    const b = ((i + 1) % n) * V;
    for (let k = 0; k < V - 1; k++) {
      if (!kerbs && (k === 0 || k === V - 2)) continue;
      // counter-clockwise seen from above, so the surface (and its normal) faces up
      indices.push(a + k, a + k + 1, b + k);
      indices.push(a + k + 1, b + k + 1, b + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function distanceToTrack(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < trackSamples.length; i += 2) {
    const s = trackSamples[i];
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------- Speedway: a 10 km straight, long enough to reach top speed ----------

export const HIGHWAY_START_X = trackSamples[0].x + 14;
export const HIGHWAY_END_X = 10500;
export const HIGHWAY_HALF_WIDTH = 9;
export const highwaySamples = straightSamples(
  HIGHWAY_START_X,
  0,
  HIGHWAY_END_X,
  0,
  Math.round((HIGHWAY_END_X - HIGHWAY_START_X) / 4),
);

// ---------- Time-trial gates on the circuit ----------

export interface Gate {
  x: number;
  z: number;
  tx: number;
  tz: number;
  yaw: number;
}

export const GATE_COUNT = 8;
const TT_START_BEHIND = 4; // samples before the finish line
const gateSample = (i: number): RoadSample => trackSamples[(i * (trackSamples.length / GATE_COUNT)) % trackSamples.length]!;
/** gates[0] is the start/finish line; 1..7 are checkpoints in driving order. */
export const gates: Gate[] = Array.from({ length: GATE_COUNT }, (_, i) => {
  const s = gateSample(i);
  return { x: s.x, z: s.z, tx: s.tx, tz: s.tz, yaw: Math.atan2(s.tx, s.tz) };
});

const ttStart = trackSamples[trackSamples.length - TT_START_BEHIND]!;

export interface SpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

export const SPAWNS = {
  freeRoam: { x: HIGHWAY_START_X + 30, z: 0, yaw: Math.PI / 2 },
  timeTrial: { x: ttStart.x, z: ttStart.z, yaw: Math.atan2(ttStart.tx, ttStart.tz) },
  drift: { x: ARENA.x - 100, z: ARENA.z, yaw: Math.PI / 2 },
} satisfies Record<string, SpawnPoint>;

// ---------- City ----------

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

const palette = ["#3a3f4b", "#4a4f5c", "#2e3340", "#5a5245", "#6b6157", "#3f4a55", "#514a5e"];

function makeCity() {
  const rand = mulberry32(1337);
  const buildings: Building[] = [];
  const blocks: { x: number; z: number; size: number }[] = [];
  const block = 40;
  const street = 14;
  const pitch = block + street;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (i === 0 && j === 0) continue;
      const cx = i * pitch;
      const cz = j * pitch;
      blocks.push({ x: cx, z: cz, size: block });
      const count = rand() < 0.45 ? 1 : 2;
      if (count === 1) {
        const w = block * (0.55 + rand() * 0.3);
        const d = block * (0.55 + rand() * 0.3);
        buildings.push({
          x: cx,
          z: cz,
          w,
          d,
          h: 10 + rand() * 42,
          color: palette[Math.floor(rand() * palette.length)],
        });
      } else {
        const split = rand() < 0.5;
        for (let k = 0; k < 2; k++) {
          const w = split ? block * 0.4 : block * (0.6 + rand() * 0.2);
          const d = split ? block * (0.6 + rand() * 0.2) : block * 0.4;
          const ox = split ? (k === 0 ? -block * 0.24 : block * 0.24) : 0;
          const oz = split ? 0 : k === 0 ? -block * 0.24 : block * 0.24;
          buildings.push({
            x: cx + ox,
            z: cz + oz,
            w,
            d,
            h: 8 + rand() * 30,
            color: palette[Math.floor(rand() * palette.length)],
          });
        }
      }
    }
  }
  const colliders: Collider[] = buildings.map((b) => ({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2 }));
  return { buildings, blocks, colliders };
}

export const city = makeCity();

// ---------- Trees ----------

export interface TreeInstance {
  x: number;
  z: number;
  y: number;
  scale: number;
  hue: number;
}

export const TREE_CELL = 42;

function isTreeExcluded(x: number, z: number): boolean {
  const cheb = Math.max(Math.abs(x), Math.abs(z));
  if (cheb < CITY_HALF + 12) return true;
  if (cheb < 330 && distanceToTrack(x, z) < 13) return true;
  if (x > CITY_HALF - 5 && Math.abs(z) < 24) return true; // connector + speedway
  if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 30) return true;
  return false;
}

/** Deterministic tree for a grid cell (or null), so the forest exists everywhere in the endless world. */
export function treeForCell(ix: number, iz: number): TreeInstance | null {
  const rand = mulberry32((Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x9e3779b9) >>> 0);
  if (rand() > 0.6) return null;
  const x = (ix + rand()) * TREE_CELL;
  const z = (iz + rand()) * TREE_CELL;
  if (isTreeExcluded(x, z)) return null;
  return { x, z, y: terrainHeight(x, z), scale: 0.8 + rand() * 0.9, hue: rand() };
}
