import * as THREE from "three";

export const WORLD_HALF = 300;
export const CITY_HALF = 100;

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
  return (h + 4) * mask;
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
  const offsets = [-halfWidth - kerbW, -halfWidth, -0.15, 0.15, halfWidth, halfWidth + kerbW];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const nx = -s.tz;
    const nz = s.tx;
    const kerbCol = Math.floor(i / 5) % 2 === 0 ? kerbRed : kerbWhite;
    const lineOn = i % 10 < 5;
    const asp = i % 2 === 0 ? asphalt : asphaltLight;
    const cols = [kerbCol, kerbCol, asp, lineOn ? line : asp, asp, kerbCol];
    for (let k = 0; k < 6; k++) {
      const off = offsets[k];
      const x = s.x + nx * off;
      const z = s.z + nz * off;
      const y = terrainHeight(x, z) + 0.08 + (k === 0 || k === 5 ? 0.04 : 0);
      positions.push(x, y, z);
      const c = cols[k];
      colors.push(c.r, c.g, c.b);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = i * 6;
    const b = ((i + 1) % n) * 6;
    for (let k = 0; k < 5; k++) {
      if (!kerbs && (k === 0 || k === 4)) continue;
      indices.push(a + k, b + k, a + k + 1);
      indices.push(a + k + 1, b + k, b + k + 1);
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

export const SPAWN = {
  x: trackSamples[0].x,
  z: trackSamples[0].z,
  yaw: Math.atan2(trackSamples[0].tx, trackSamples[0].tz),
};

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

function makeTrees(): TreeInstance[] {
  const rand = mulberry32(42);
  const trees: TreeInstance[] = [];
  let tries = 0;
  while (trees.length < 700 && tries < 6000) {
    tries++;
    const x = (rand() * 2 - 1) * (WORLD_HALF - 10);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 10);
    if (Math.max(Math.abs(x), Math.abs(z)) < CITY_HALF + 12) continue;
    if (distanceToTrack(x, z) < 13) continue;
    if (Math.abs(z) < 9 && x > CITY_HALF - 5 && x < trackSamples[0].x + 5) continue;
    trees.push({ x, z, y: terrainHeight(x, z), scale: 0.8 + rand() * 0.9, hue: rand() });
  }
  return trees;
}

export const trees = makeTrees();
