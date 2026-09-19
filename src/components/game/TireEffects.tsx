import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "../../game/effects";
import { useGame } from "../../game/store";

// ---------- tyre smoke: a small pool of soft, growing, fading puffs ----------
const MAX_PUFFS = 180;
const PUFF_LIFE = 1.6;

const smokeVertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (620.0 / max(0.5, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const smokeFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.86, 0.86, 0.88), a);
  }
`;

function Smoke() {
  const data = useMemo(
    () => ({
      pos: new Float32Array(MAX_PUFFS * 3),
      size: new Float32Array(MAX_PUFFS),
      alpha: new Float32Array(MAX_PUFFS),
      vel: new Float32Array(MAX_PUFFS * 3),
      age: new Float32Array(MAX_PUFFS).fill(PUFF_LIFE),
      next: 0,
      carry: 0,
    }),
    [],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(data.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(data.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [data]);
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: smokeVertex, fragmentShader: smokeFragment, transparent: true, depthWrite: false }),
    [],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (fx.slip > 0.12 && fx.speedKmh > 6) {
      data.carry += fx.slip * 70 * dt;
      while (data.carry >= 1) {
        data.carry -= 1;
        const i = data.next;
        data.next = (data.next + 1) % MAX_PUFFS;
        const src = fx.rear[Math.random() < 0.5 ? 0 : 1];
        data.pos[i * 3] = src.x + (Math.random() - 0.5) * 0.3;
        data.pos[i * 3 + 1] = src.y + 0.15;
        data.pos[i * 3 + 2] = src.z + (Math.random() - 0.5) * 0.3;
        data.vel[i * 3] = (Math.random() - 0.5) * 1.6;
        data.vel[i * 3 + 1] = 0.6 + Math.random() * 0.9;
        data.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
        data.age[i] = 0;
      }
    }
    for (let i = 0; i < MAX_PUFFS; i++) {
      const age = data.age[i]! + dt;
      data.age[i] = age;
      if (age >= PUFF_LIFE) {
        data.alpha[i] = 0;
        data.size[i] = 0;
        continue;
      }
      const t = age / PUFF_LIFE;
      data.pos[i * 3] = data.pos[i * 3]! + data.vel[i * 3]! * dt;
      data.pos[i * 3 + 1] = data.pos[i * 3 + 1]! + data.vel[i * 3 + 1]! * dt;
      data.pos[i * 3 + 2] = data.pos[i * 3 + 2]! + data.vel[i * 3 + 2]! * dt;
      data.vel[i * 3 + 1] = data.vel[i * 3 + 1]! * (1 - 0.8 * dt);
      data.size[i] = 0.7 + t * 3.4;
      data.alpha[i] = (1 - t) * (1 - t) * 0.55;
    }
    (geometry.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes["aSize"] as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes["aAlpha"] as THREE.BufferAttribute).needsUpdate = true;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------- skid marks: a ring buffer of dark quads laid where the rear tyres slide ----------
const MAX_QUADS = 2200;
const MARK_HALF_WIDTH = 0.13;
const MIN_SEGMENT = 0.45;
const MARK_LIFT = 0.1;

function SkidMarks() {
  const state = useRef({ count: 0, head: 0, last: [null, null] as (THREE.Vector3 | null)[], generation: -1 });
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const index = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], q * 6);
    }
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.setDrawRange(0, 0);
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#050505",
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      }),
    [],
  );

  useFrame(() => {
    const s = state.current;
    if (s.generation !== fx.generation) {
      s.generation = fx.generation;
      s.count = 0;
      s.head = 0;
      s.last = [null, null];
      geometry.setDrawRange(0, 0);
    }
    const attr = geometry.attributes["position"] as THREE.BufferAttribute;
    const sliding = fx.slip > 0.35 && fx.speedKmh > 12;
    let dirty = false;
    for (let w = 0; w < 2; w++) {
      const cur = fx.rear[w]!;
      const last = s.last[w];
      if (!sliding) {
        s.last[w] = null;
        continue;
      }
      if (!last) {
        s.last[w] = cur.clone();
        continue;
      }
      const dx = cur.x - last.x;
      const dz = cur.z - last.z;
      const len = Math.hypot(dx, dz);
      if (len < MIN_SEGMENT) continue;
      const nx = (-dz / len) * MARK_HALF_WIDTH;
      const nz = (dx / len) * MARK_HALF_WIDTH;
      const q = s.head;
      const o = q * 12;
      const a = attr.array as Float32Array;
      a[o] = last.x - nx; a[o + 1] = last.y + MARK_LIFT; a[o + 2] = last.z - nz;
      a[o + 3] = last.x + nx; a[o + 4] = last.y + MARK_LIFT; a[o + 5] = last.z + nz;
      a[o + 6] = cur.x - nx; a[o + 7] = cur.y + MARK_LIFT; a[o + 8] = cur.z - nz;
      a[o + 9] = cur.x + nx; a[o + 10] = cur.y + MARK_LIFT; a[o + 11] = cur.z + nz;
      s.head = (s.head + 1) % MAX_QUADS;
      s.count = Math.min(MAX_QUADS, s.count + 1);
      last.copy(cur);
      dirty = true;
    }
    if (dirty) {
      attr.needsUpdate = true;
      geometry.setDrawRange(0, s.count * 6);
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

export function TireEffects() {
  const quality = useGame((s) => s.settings.quality);
  return (
    <>
      <SkidMarks />
      {quality !== "low" && <Smoke />}
    </>
  );
}
