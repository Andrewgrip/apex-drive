import * as THREE from "three";
import type { CarId, CarSpec } from "./cars";

/**
 * Procedural cars. The body is a smooth "loft": a rounded cross-section is swept along the car's
 * length while its width and height follow a table of stations (Catmull-Rom interpolated). That
 * gives clean, continuous surfaces with clear-coated paint and dark glass instead of blocky
 * low-poly models. Forward is +z, up is +y, the car is centred on x = 0.
 */

export interface CarParts {
  /** everything that leans on the suspension: the body, lights, interior (not the wheels) */
  body: THREE.Group;
  frontWheels: THREE.Object3D[];
  allWheels: THREE.Object3D[];
  steeringWheel: THREE.Object3D;
  paint: THREE.MeshPhysicalMaterial;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  /** local positions of the headlights, for the night beams */
  headPositions: THREE.Vector3[];
  /** where the rear tyres touch the ground, for smoke and skid marks */
  rearContact: THREE.Vector3[];
}

interface Station {
  z: number;
  /** half width at the bottom of the section */
  w: number;
  /** half width at the top (tumblehome); defaults to w */
  wt?: number;
  yb: number;
  yt: number;
  /** 1 = glass, 0 = pillar / paint (cabin only) */
  g?: number;
}

interface Detail {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

interface Design {
  lower: Station[];
  cabin: Station[];
  tireWidth: number;
  wheelX: number;
  head: Detail;
  tail: Detail;
  grille: Detail;
  intake: Detail;
  mirror: Detail;
  plateY: number;
  frontZ: number;
  rearZ: number;
  exhaust: { x: number; y: number; z: number; r: number }[];
  extra: "wing" | "scoop" | "spoilerLip";
  dashZ: number;
  seatZ: number;
  /** roof height above the seats, to size the interior */
  roofY: number;
}

const DESIGNS: Record<CarId, Design> = {
  hatchback: {
    lower: [
      { z: -1.99, w: 0.64, yb: 0.44, yt: 0.82 },
      { z: -1.85, w: 0.8, yb: 0.3, yt: 0.92 },
      { z: -1.5, w: 0.84, yb: 0.26, yt: 0.93 },
      { z: -0.8, w: 0.85, yb: 0.24, yt: 0.92 },
      { z: 0, w: 0.85, yb: 0.24, yt: 0.91 },
      { z: 0.7, w: 0.85, yb: 0.24, yt: 0.88 },
      { z: 1.3, w: 0.845, yb: 0.25, yt: 0.84 },
      { z: 1.75, w: 0.82, yb: 0.27, yt: 0.78 },
      { z: 1.93, w: 0.74, yb: 0.33, yt: 0.7 },
      { z: 1.99, w: 0.6, yb: 0.46, yt: 0.6 },
    ].map((s) => ({ ...s, wt: s.w * 0.97 })),
    cabin: [
      { z: -1.86, w: 0.7, wt: 0.46, yb: 0.93, yt: 0.98, g: 0 },
      { z: -1.75, w: 0.74, wt: 0.52, yb: 0.93, yt: 1.1, g: 1 },
      { z: -1.35, w: 0.76, wt: 0.58, yb: 0.92, yt: 1.4, g: 1 },
      { z: -1.05, w: 0.76, wt: 0.6, yb: 0.91, yt: 1.45, g: 1 },
      { z: -0.54, w: 0.77, wt: 0.61, yb: 0.91, yt: 1.45, g: 1 },
      { z: -0.42, w: 0.77, wt: 0.61, yb: 0.91, yt: 1.45, g: 0 },
      { z: -0.3, w: 0.77, wt: 0.61, yb: 0.91, yt: 1.44, g: 1 },
      { z: -0.1, w: 0.77, wt: 0.61, yb: 0.91, yt: 1.43, g: 1 },
      { z: 0.2, w: 0.77, wt: 0.62, yb: 0.9, yt: 1.36, g: 1 },
      { z: 0.6, w: 0.765, wt: 0.64, yb: 0.89, yt: 1.1, g: 1 },
      { z: 0.82, w: 0.76, wt: 0.7, yb: 0.88, yt: 0.95, g: 0 },
    ],
    tireWidth: 0.19,
    wheelX: 0.755,
    head: { x: 0.58, y: 0.7, z: 1.9, sx: 0.24, sy: 0.09, sz: 0.09 },
    tail: { x: 0.62, y: 0.8, z: -1.95, sx: 0.22, sy: 0.13, sz: 0.06 },
    grille: { x: 0, y: 0.5, z: 1.95, sx: 0.7, sy: 0.14, sz: 0.06 },
    intake: { x: 0, y: 0.36, z: 1.96, sx: 0.6, sy: 0.08, sz: 0.05 },
    mirror: { x: 0.9, y: 0.98, z: 0.55, sx: 0.16, sy: 0.09, sz: 0.1 },
    plateY: 0.55,
    frontZ: 1.99,
    rearZ: -1.99,
    exhaust: [{ x: 0.55, y: 0.3, z: -1.99, r: 0.04 }],
    extra: "spoilerLip",
    dashZ: 0.42,
    seatZ: -0.25,
    roofY: 1.45,
  },
  coupe: {
    lower: [
      { z: -2.24, w: 0.66, yb: 0.4, yt: 0.82 },
      { z: -2.18, w: 0.84, yb: 0.3, yt: 0.92 },
      { z: -1.95, w: 0.92, yb: 0.22, yt: 0.98 },
      { z: -1.4, w: 0.95, yb: 0.19, yt: 0.96 },
      { z: -0.6, w: 0.94, yb: 0.18, yt: 0.88 },
      { z: 0.2, w: 0.94, yb: 0.18, yt: 0.8 },
      { z: 0.9, w: 0.93, yb: 0.17, yt: 0.74 },
      { z: 1.45, w: 0.92, yb: 0.17, yt: 0.68 },
      { z: 1.95, w: 0.9, yb: 0.18, yt: 0.64 },
      { z: 2.18, w: 0.84, yb: 0.26, yt: 0.58 },
      { z: 2.24, w: 0.68, yb: 0.38, yt: 0.5 },
    ].map((s) => ({ ...s, wt: s.w * 0.96 })),
    cabin: [
      { z: -2.0, w: 0.84, wt: 0.4, yb: 0.97, yt: 0.99, g: 0 },
      { z: -1.75, w: 0.88, wt: 0.48, yb: 0.95, yt: 1.02, g: 0 },
      { z: -1.35, w: 0.88, wt: 0.56, yb: 0.92, yt: 1.1, g: 0.6 },
      { z: -0.95, w: 0.87, wt: 0.6, yb: 0.88, yt: 1.2, g: 1 },
      { z: -0.55, w: 0.86, wt: 0.62, yb: 0.84, yt: 1.22, g: 1 },
      { z: -0.42, w: 0.86, wt: 0.62, yb: 0.83, yt: 1.21, g: 0 },
      { z: -0.3, w: 0.855, wt: 0.63, yb: 0.83, yt: 1.2, g: 1 },
      { z: -0.15, w: 0.85, wt: 0.64, yb: 0.82, yt: 1.16, g: 1 },
      { z: 0.3, w: 0.84, wt: 0.68, yb: 0.8, yt: 0.98, g: 1 },
      { z: 0.55, w: 0.82, wt: 0.74, yb: 0.78, yt: 0.84, g: 0 },
    ],
    tireWidth: 0.26,
    wheelX: 0.79,
    head: { x: 0.62, y: 0.56, z: 2.12, sx: 0.32, sy: 0.07, sz: 0.1 },
    tail: { x: 0, y: 0.88, z: -2.2, sx: 1.5, sy: 0.07, sz: 0.06 },
    grille: { x: 0, y: 0.34, z: 2.2, sx: 0.9, sy: 0.1, sz: 0.06 },
    intake: { x: 0.68, y: 0.3, z: 2.16, sx: 0.28, sy: 0.1, sz: 0.06 },
    mirror: { x: 0.98, y: 0.9, z: 0.3, sx: 0.16, sy: 0.08, sz: 0.1 },
    plateY: 0.5,
    frontZ: 2.24,
    rearZ: -2.24,
    exhaust: [
      { x: 0.5, y: 0.3, z: -2.24, r: 0.05 },
      { x: -0.5, y: 0.3, z: -2.24, r: 0.05 },
    ],
    extra: "wing",
    dashZ: 0.08,
    seatZ: -0.55,
    roofY: 1.22,
  },
  muscle: {
    lower: [
      { z: -2.47, w: 0.68, yb: 0.42, yt: 0.92 },
      { z: -2.42, w: 0.84, yb: 0.32, yt: 1.02 },
      { z: -2.2, w: 0.95, yb: 0.25, yt: 1.08 },
      { z: -1.5, w: 0.97, yb: 0.22, yt: 1.06 },
      { z: -0.5, w: 0.965, yb: 0.22, yt: 1.02 },
      { z: 0.3, w: 0.965, yb: 0.21, yt: 0.99 },
      { z: 0.9, w: 0.96, yb: 0.21, yt: 0.96 },
      { z: 1.6, w: 0.96, yb: 0.21, yt: 0.92 },
      { z: 2.2, w: 0.94, yb: 0.22, yt: 0.86 },
      { z: 2.41, w: 0.88, yb: 0.28, yt: 0.78 },
      { z: 2.47, w: 0.7, yb: 0.4, yt: 0.66 },
    ].map((s) => ({ ...s, wt: s.w * 0.96 })),
    cabin: [
      { z: -2.1, w: 0.88, wt: 0.5, yb: 1.07, yt: 1.1, g: 0 },
      { z: -1.95, w: 0.9, wt: 0.58, yb: 1.06, yt: 1.14, g: 0 },
      { z: -1.55, w: 0.9, wt: 0.64, yb: 1.05, yt: 1.3, g: 0.6 },
      { z: -1.2, w: 0.9, wt: 0.68, yb: 1.04, yt: 1.39, g: 1 },
      { z: -0.75, w: 0.89, wt: 0.69, yb: 1.03, yt: 1.4, g: 1 },
      { z: -0.55, w: 0.89, wt: 0.69, yb: 1.03, yt: 1.4, g: 0 },
      { z: -0.4, w: 0.88, wt: 0.7, yb: 1.02, yt: 1.36, g: 1 },
      { z: 0.05, w: 0.86, wt: 0.72, yb: 1.0, yt: 1.2, g: 1 },
      { z: 0.35, w: 0.84, wt: 0.76, yb: 0.99, yt: 1.04, g: 0 },
    ],
    tireWidth: 0.28,
    wheelX: 0.82,
    head: { x: 0.7, y: 0.76, z: 2.4, sx: 0.26, sy: 0.16, sz: 0.1 },
    tail: { x: 0.6, y: 0.9, z: -2.45, sx: 0.5, sy: 0.15, sz: 0.06 },
    grille: { x: 0, y: 0.52, z: 2.45, sx: 1.1, sy: 0.16, sz: 0.06 },
    intake: { x: 0, y: 0.36, z: 2.44, sx: 0.9, sy: 0.12, sz: 0.05 },
    mirror: { x: 1.0, y: 1.08, z: 0.05, sx: 0.17, sy: 0.09, sz: 0.11 },
    plateY: 0.56,
    frontZ: 2.47,
    rearZ: -2.47,
    exhaust: [
      { x: 0.62, y: 0.34, z: -2.47, r: 0.06 },
      { x: -0.62, y: 0.34, z: -2.47, r: 0.06 },
    ],
    extra: "scoop",
    dashZ: 0.08,
    seatZ: -0.6,
    roofY: 1.4,
  },
};

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

const sgnPow = (v: number, p: number): number => Math.sign(v) * Math.abs(v) ** p;

interface LoftResult {
  geometry: THREE.BufferGeometry;
}

/** Sweep a squircle cross-section along the stations. `glass` splits the surface into paint + glass groups. */
function loft(stations: Station[], samples: number, ring: number, squareness: number, glass: boolean): LoftResult {
  const S = stations.length;
  const at = (i: number) => stations[Math.min(Math.max(i, 0), S - 1)]!;
  const positions: number[] = [];
  const vMean: number[] = [];
  const gAt: number[] = [];
  const pw = 2 / squareness;

  for (let s = 0; s < samples; s++) {
    const t = (s / (samples - 1)) * (S - 1);
    const i = Math.min(Math.floor(t), S - 2);
    const f = t - i;
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c = (k: (st: Station) => number) => catmull(k(p0), k(p1), k(p2), k(p3), f);
    const z = c((st) => st.z);
    const w = c((st) => st.w);
    const wt = c((st) => st.wt ?? st.w);
    const yb = c((st) => st.yb);
    const yt = c((st) => st.yt);
    const g = Math.min(1, Math.max(0, c((st) => st.g ?? 1)));
    for (let j = 0; j < ring; j++) {
      const th = (j / ring) * Math.PI * 2;
      const u = sgnPow(Math.cos(th), pw);
      const v = sgnPow(Math.sin(th), pw);
      const k = (v + 1) / 2;
      const half = w + (wt - w) * k;
      positions.push(u * half, yb + (yt - yb) * k, z);
      vMean.push(v);
      gAt.push(g);
    }
  }
  // end caps: a centre vertex per end
  const frontCentre = positions.length / 3;
  {
    const base = (samples - 1) * ring;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) {
      cx += positions[(base + j) * 3]!;
      cy += positions[(base + j) * 3 + 1]!;
      cz += positions[(base + j) * 3 + 2]!;
    }
    positions.push(cx / ring, cy / ring, cz / ring);
    vMean.push(0);
    gAt.push(0);
  }
  const rearCentre = positions.length / 3;
  {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) {
      cx += positions[j * 3]!;
      cy += positions[j * 3 + 1]!;
      cz += positions[j * 3 + 2]!;
    }
    positions.push(cx / ring, cy / ring, cz / ring);
    vMean.push(0);
    gAt.push(0);
  }

  const tris: number[][] = [];
  for (let s = 0; s < samples - 1; s++) {
    for (let j = 0; j < ring; j++) {
      const a = s * ring + j;
      const a1 = s * ring + ((j + 1) % ring);
      const b = (s + 1) * ring + j;
      const b1 = (s + 1) * ring + ((j + 1) % ring);
      tris.push([a, a1, b], [a1, b1, b]);
    }
  }
  const lastBase = (samples - 1) * ring;
  for (let j = 0; j < ring; j++) {
    tris.push([frontCentre, lastBase + j, lastBase + ((j + 1) % ring)]);
    tris.push([rearCentre, ((j + 1) % ring), j]);
  }

  const paintIdx: number[] = [];
  const glassIdx: number[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const [a, b, c] of tris as [number, number, number][]) {
    let isGlass = false;
    if (glass) {
      va.fromArray(positions, a * 3);
      vb.fromArray(positions, b * 3);
      vc.fromArray(positions, c * 3);
      n.subVectors(vb, va).cross(vc.sub(va)).normalize();
      const g = (gAt[a]! + gAt[b]! + gAt[c]!) / 3;
      const v = (vMean[a]! + vMean[b]! + vMean[c]!) / 3;
      isGlass = g > 0.55 && v > -0.15 && n.y < 0.86;
    }
    (isGlass ? glassIdx : paintIdx).push(a, b, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([...paintIdx, ...glassIdx]);
  geometry.addGroup(0, paintIdx.length, 0);
  if (glassIdx.length > 0) geometry.addGroup(paintIdx.length, glassIdx.length, 1);
  geometry.computeVertexNormals();
  return { geometry };
}

function box(d: Detail, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(d.sx, d.sy, d.sz), mat);
  m.position.set(d.x, d.y, d.z);
  return m;
}

function wheelAssembly(R: number, tw: number, side: 1 | -1, mats: { tire: THREE.Material; rim: THREE.Material; dark: THREE.Material; disc: THREE.Material; caliper: THREE.Material }): THREE.Group {
  const g = new THREE.Group();
  g.rotation.order = "YXZ";
  // tyre: rounded lathe profile revolved around the axle (x axis)
  const half = tw / 2;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(R * 0.62, -half),
    new THREE.Vector2(R * 0.9, -half),
    new THREE.Vector2(R * 0.98, -half * 0.72),
    new THREE.Vector2(R, -half * 0.3),
    new THREE.Vector2(R, half * 0.3),
    new THREE.Vector2(R * 0.98, half * 0.72),
    new THREE.Vector2(R * 0.9, half),
    new THREE.Vector2(R * 0.62, half),
  ];
  const tireGeo = new THREE.LatheGeometry(profile, 32);
  tireGeo.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(tireGeo, mats.tire));

  const outer = side * half;
  // rim barrel + face
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, tw * 0.86, 28, 1, true), mats.dark);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.64, R * 0.64, 0.02, 28), mats.rim);
  face.rotation.z = Math.PI / 2;
  face.position.x = outer * 0.86;
  g.add(face);
  const spokeGeo = new THREE.BoxGeometry(0.03, R * 0.58, R * 0.1);
  spokeGeo.translate(0, R * 0.29, 0);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, mats.rim);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spoke.position.x = outer * 0.9;
    g.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.13, R * 0.13, 0.04, 16), mats.dark);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = outer * 0.92;
  g.add(hub);
  // brake disc behind the spokes, caliper does not spin with the wheel in reality but reads fine
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.025, 28), mats.disc);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = side * tw * 0.12;
  g.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.06, R * 0.34, R * 0.26), mats.caliper);
  caliper.position.set(side * tw * 0.2, R * 0.42, 0);
  g.add(caliper);
  return g;
}

export function buildCar(id: CarId, spec: CarSpec, color: string): { group: THREE.Group; parts: CarParts } {
  const d = DESIGNS[id];
  const R = spec.wheelRadius;

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: "#0b1118", metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8 });
  const trim = new THREE.MeshStandardMaterial({ color: "#101215", roughness: 0.55, metalness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.18, metalness: 1 });
  const head = new THREE.MeshStandardMaterial({ color: "#eef0f2", roughness: 0.15, metalness: 0.2, emissive: new THREE.Color("#fff1c7"), emissiveIntensity: 0.25 });
  const tail = new THREE.MeshStandardMaterial({ color: "#6b0808", roughness: 0.3, emissive: new THREE.Color("#ff1212"), emissiveIntensity: 0.35 });
  const tire = new THREE.MeshStandardMaterial({ color: "#0c0c0d", roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.22, metalness: 1 });
  const discMat = new THREE.MeshStandardMaterial({ color: "#7d8188", roughness: 0.4, metalness: 0.9 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: "#c8202a", roughness: 0.4, metalness: 0.4 });
  const interior = new THREE.MeshStandardMaterial({ color: "#16181c", roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.6 });

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // ----- shell -----
  const lower = loft(d.lower, 48, 28, 4.4, false).geometry;
  const bodyMesh = new THREE.Mesh(lower, paint);
  body.add(bodyMesh);
  const cabin = loft(d.cabin, 40, 24, 3.4, true).geometry;
  body.add(new THREE.Mesh(cabin, [paint, glassMat]));

  // ----- front / rear details (mirrored across x) -----
  const both = (fn: (sign: 1 | -1) => THREE.Object3D): void => {
    body.add(fn(1), fn(-1));
  };
  both((s) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), head);
    m.scale.set(d.head.sx, d.head.sy, d.head.sz);
    m.position.set(s * d.head.x, d.head.y, d.head.z);
    return m;
  });
  if (d.tail.x === 0) {
    body.add(box(d.tail, tail));
  } else {
    both((s) => box({ ...d.tail, x: s * d.tail.x }, tail));
  }
  body.add(box(d.grille, trim));
  if (d.intake.x === 0) body.add(box(d.intake, trim));
  else both((s) => box({ ...d.intake, x: s * d.intake.x }, trim));
  // chrome grille bar
  body.add(box({ x: 0, y: d.grille.y, z: d.grille.z + 0.02, sx: d.grille.sx * 0.9, sy: 0.015, sz: 0.02 }, chrome));
  // mirrors
  both((s) => {
    const m = box({ ...d.mirror, x: s * d.mirror.x }, paint);
    return m;
  });
  // plates
  body.add(box({ x: 0, y: d.plateY, z: d.frontZ + 0.02, sx: 0.4, sy: 0.11, sz: 0.02 }, white));
  body.add(box({ x: 0, y: d.plateY + 0.22, z: d.rearZ - 0.02, sx: 0.4, sy: 0.11, sz: 0.02 }, white));
  // exhaust
  for (const e of d.exhaust) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(e.r, e.r, 0.16, 16), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(e.x, e.y, e.z - 0.05);
    body.add(pipe);
  }
  // underbody shadow plate
  body.add(box({ x: 0, y: 0.2, z: 0, sx: d.wheelX * 2 - 0.2, sy: 0.04, sz: (d.frontZ - d.rearZ) * 0.9 }, trim));
  // door seams and belt line
  both((s) => {
    const seam = box({ x: s * (d.lower[4]!.w * 0.985), y: 0.6, z: d.seatZ + 0.3, sx: 0.012, sy: 0.5, sz: 0.012 }, trim);
    return seam;
  });
  // bodystyle extras
  if (d.extra === "wing") {
    body.add(box({ x: 0, y: 1.08, z: -2.02, sx: 1.55, sy: 0.035, sz: 0.3 }, paint));
    both((s) => box({ x: s * 0.5, y: 1.0, z: -2.02, sx: 0.05, sy: 0.12, sz: 0.05 }, trim));
  } else if (d.extra === "scoop") {
    body.add(box({ x: 0, y: 1.02, z: 1.0, sx: 0.52, sy: 0.1, sz: 0.75 }, paint));
    body.add(box({ x: 0, y: 1.0, z: 1.38, sx: 0.4, sy: 0.05, sz: 0.02 }, trim));
    body.add(box({ x: 0, y: 1.1, z: -2.3, sx: 1.5, sy: 0.05, sz: 0.2 }, paint));
  } else {
    body.add(box({ x: 0, y: 1.08, z: -1.82, sx: 1.0, sy: 0.035, sz: 0.14 }, paint));
  }

  // ----- interior (visible from the cockpit and hood cameras) -----
  body.add(box({ x: 0, y: d.lower[4]!.yt - 0.06, z: d.dashZ, sx: d.lower[4]!.w * 1.7, sy: 0.16, sz: 0.4 }, interior));
  const belt = d.lower[4]!.yt;
  const backBottom = belt - 0.1;
  const backHeight = Math.max(0.25, d.roofY - 0.14 - backBottom); // keep the seat backs inside the roof
  for (const sx of [-0.34, 0.34]) {
    body.add(box({ x: sx, y: belt - 0.18, z: d.seatZ, sx: 0.44, sy: 0.1, sz: 0.5 }, interior));
    body.add(box({ x: sx, y: backBottom + backHeight / 2, z: d.seatZ - 0.24, sx: 0.44, sy: backHeight, sz: 0.1 }, interior));
  }
  const steerPivot = new THREE.Group();
  steerPivot.position.set(0.34, belt - 0.06, d.dashZ - 0.14); // rim stays below the driver's eye line
  steerPivot.rotation.x = -2.8;
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 10, 28), interior);
  steerPivot.add(steeringWheel);
  const spokeBar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), interior);
  steeringWheel.add(spokeBar);
  body.add(steerPivot);

  // ----- wheels + arches -----
  const wheelMats = { tire, rim: rimMat, dark: trim, disc: discMat, caliper: caliperMat };
  const frontZ = spec.wheelbase / 2;
  const rearZ = -spec.wheelbase / 2;
  const front: THREE.Object3D[] = [];
  const all: THREE.Object3D[] = [];
  const rearContact: THREE.Vector3[] = [];
  for (const [z, isFront] of [[frontZ, true], [rearZ, false]] as const) {
    for (const s of [1, -1] as const) {
      const w = wheelAssembly(R, d.tireWidth, s, wheelMats);
      w.position.set(s * d.wheelX, R, z);
      group.add(w);
      all.push(w);
      if (isFront) front.push(w);
      else rearContact.push(new THREE.Vector3(s * d.wheelX, 0.02, z));
      // dark wheel well + fender lip on the body side
      const well = new THREE.Mesh(new THREE.CircleGeometry(R + 0.06, 36), trim);
      well.rotation.y = s * Math.PI / 2;
      well.position.set(s * (d.wheelX + d.tireWidth / 2 - 0.012), R, z);
      body.add(well);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.085, 0.022, 8, 36, Math.PI), paint);
      lip.rotation.y = s * Math.PI / 2;
      lip.position.set(s * (d.wheelX + d.tireWidth / 2 - 0.004), R, z);
      body.add(lip);
    }
  }

  const headPositions = [new THREE.Vector3(d.head.x, d.head.y, d.head.z), new THREE.Vector3(-d.head.x, d.head.y, d.head.z)];
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });

  return {
    group,
    parts: { body, frontWheels: front, allWheels: all, steeringWheel, paint, head, tail, headPositions, rearContact },
  };
}

