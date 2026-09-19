import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Stars } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  ARENA,
  buildRoadGeometry,
  city,
  connectorSamples,
  CITY_HALF,
  HIGHWAY_HALF_WIDTH,
  highwaySamples,
  trackSamples,
  TREE_CELL,
  treeForCell,
} from "../../game/world";
import { TERRAIN_GLSL } from "../../game/terrainGlsl";
import { environment, telemetry } from "../../game/telemetry";
import { useGame } from "../../game/store";

// ---------- Terrain ----------
// One static grid that follows the car (snapped to the grid so it never swims). Heights and
// colours are computed on the GPU from world coordinates, so the ground is endless and free.
// 4 m cells: coarser cells let the terrain's straight-edged facets poke through the roads above it.
const TERRAIN_HALF = 600;
const TERRAIN_SEGMENTS = 300;
const TERRAIN_CELL = (TERRAIN_HALF * 2) / TERRAIN_SEGMENTS;

function Terrain() {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(TERRAIN_HALF * 2, TERRAIN_HALF * 2, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    g.rotateX(-Math.PI / 2);
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 3).fill(1), 3));
    return g;
  }, []);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${TERRAIN_GLSL}`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec2 groundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
          float groundH = terrainH(groundXZ);
          transformed.y = groundH;
          vColor.rgb = terrainColor(groundXZ, groundH);`,
        );
    };
    return m;
  }, []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    m.position.set(Math.round(telemetry.x / TERRAIN_CELL) * TERRAIN_CELL, 0, Math.round(telemetry.z / TERRAIN_CELL) * TERRAIN_CELL);
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} receiveShadow />;
}

// ---------- Roads ----------
function Roads() {
  const track = useMemo(() => buildRoadGeometry(trackSamples, 6, true, true), []);
  const connector = useMemo(() => buildRoadGeometry(connectorSamples, 5, false, false), []);
  const highway = useMemo(() => buildRoadGeometry(highwaySamples, HIGHWAY_HALF_WIDTH, false, false), []);
  // polygonOffset keeps distant road surfaces from z-fighting with the ground
  const roadProps = { vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;
  return (
    <group>
      <mesh geometry={track} receiveShadow>
        <meshStandardMaterial {...roadProps} metalness={0} />
      </mesh>
      <mesh geometry={connector} receiveShadow>
        <meshStandardMaterial {...roadProps} />
      </mesh>
      <mesh geometry={highway} receiveShadow frustumCulled={false}>
        <meshStandardMaterial {...roadProps} />
      </mesh>
    </group>
  );
}

// ---------- Drift arena ----------
function Arena() {
  const paint = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 } as const;
  return (
    <group position={[ARENA.x, 0.06, ARENA.z]} rotation-x={-Math.PI / 2}>
      <mesh receiveShadow>
        <circleGeometry args={[ARENA.r, 96]} />
        <meshStandardMaterial color="#2b2d31" roughness={0.92} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {[35, 75, 115].map((r) => (
        <mesh key={r} position={[0, 0, 0.01]}>
          <ringGeometry args={[r - 0.35, r + 0.35, 96]} />
          <meshStandardMaterial color="#e8e2cf" roughness={0.8} {...paint} />
        </mesh>
      ))}
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[3, 24]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff7a1a" emissiveIntensity={0.5} {...paint} />
      </mesh>
      <mesh position={[0, 0, 0.5]}>
        <ringGeometry args={[ARENA.r - 1, ARENA.r + 1, 96]} />
        <meshStandardMaterial color="#c8352b" roughness={0.8} {...paint} />
      </mesh>
    </group>
  );
}

// ---------- City ----------
function makeWindowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#9aa0aa";
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 128; y += 32) {
    for (let x = 8; x < 128; x += 32) {
      ctx.fillStyle = Math.random() < 0.35 ? "#f5d38a" : "#1d2430";
      ctx.fillRect(x, y, 16, 20);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function City() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const sidewalks = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(() => (typeof document !== "undefined" ? makeWindowTexture() : null), []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    if (ref.current) {
      city.buildings.forEach((b, i) => {
        p.set(b.x, b.h / 2, b.z);
        s.set(b.w, b.h, b.d);
        m.compose(p, q, s);
        ref.current!.setMatrixAt(i, m);
        ref.current!.setColorAt(i, col.set(b.color));
      });
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
    if (sidewalks.current) {
      city.blocks.forEach((b, i) => {
        p.set(b.x, 0.12, b.z);
        s.set(b.size + 4, 0.24, b.size + 4);
        m.compose(p, q, s);
        sidewalks.current!.setMatrixAt(i, m);
      });
      sidewalks.current.instanceMatrix.needsUpdate = true;
    }
  }, []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[CITY_HALF * 2 + 16, CITY_HALF * 2 + 16]} />
        <meshStandardMaterial color="#2a2c31" roughness={0.95} />
      </mesh>
      <instancedMesh ref={sidewalks} args={[undefined, undefined, city.blocks.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8d8a82" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={ref} args={[undefined, undefined, city.buildings.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={tex ?? undefined} roughness={0.7} metalness={0.15} />
      </instancedMesh>
      {/* central plaza landmark */}
      <mesh position={[0, 6, 0]} castShadow>
        <cylinderGeometry args={[1.2, 2.2, 12, 8]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff7a1a" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// ---------- Trees ----------
const TREE_WINDOW = 620; // trees are generated this far around the car
const TREE_REFRESH = 60; // and regenerated after the car moves this far
const MAX_TREES = 900;
const treeMatrix = new THREE.Matrix4();
const treeQuat = new THREE.Quaternion();
const treeScale = new THREE.Vector3();
const treePos = new THREE.Vector3();
const treeColor = new THREE.Color();

function Trees() {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const center = useRef({ x: Number.NaN, z: Number.NaN });

  useFrame(() => {
    const tr = trunk.current;
    const lv = leaves.current;
    if (!tr || !lv) return;
    const c = center.current;
    if (Math.hypot(telemetry.x - c.x, telemetry.z - c.z) < TREE_REFRESH) return;
    c.x = telemetry.x;
    c.z = telemetry.z;
    const x0 = Math.floor((c.x - TREE_WINDOW) / TREE_CELL);
    const x1 = Math.floor((c.x + TREE_WINDOW) / TREE_CELL);
    const z0 = Math.floor((c.z - TREE_WINDOW) / TREE_CELL);
    const z1 = Math.floor((c.z + TREE_WINDOW) / TREE_CELL);
    let n = 0;
    for (let ix = x0; ix <= x1 && n < MAX_TREES; ix++) {
      for (let iz = z0; iz <= z1 && n < MAX_TREES; iz++) {
        const t = treeForCell(ix, iz);
        if (!t) continue;
        const h = 2.2 * t.scale;
        treePos.set(t.x, t.y + h / 2, t.z);
        treeScale.set(0.35 * t.scale, h, 0.35 * t.scale);
        treeMatrix.compose(treePos, treeQuat, treeScale);
        tr.setMatrixAt(n, treeMatrix);
        treePos.set(t.x, t.y + h + 2.4 * t.scale, t.z);
        treeScale.set(2.2 * t.scale, 5 * t.scale, 2.2 * t.scale);
        treeMatrix.compose(treePos, treeQuat, treeScale);
        lv.setMatrixAt(n, treeMatrix);
        treeColor.setHSL(0.28 + t.hue * 0.08, 0.45, 0.28 + t.hue * 0.12);
        lv.setColorAt(n, treeColor);
        n++;
      }
    }
    tr.count = n;
    lv.count = n;
    tr.instanceMatrix.needsUpdate = true;
    lv.instanceMatrix.needsUpdate = true;
    if (lv.instanceColor) lv.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, MAX_TREES]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.5, 0.7, 1, 6]} />
        <meshStandardMaterial color="#5a3d26" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, MAX_TREES]} frustumCulled={false} castShadow>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}

// ---------- Sky / sun / day-night ----------
const DAY = new THREE.Color("#8fc5ee");
const DUSK = new THREE.Color("#f08a4a");
const NIGHT = new THREE.Color("#070a16");
const tmpColor = new THREE.Color();

function SkyAndSun() {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.Fog>(null);
  const stars = useRef<THREE.Group>(null);
  const dayCycle = useGame((s) => s.settings.dayCycle);
  const target = useMemo(() => new THREE.Object3D(), []);
  const [isNight, setNight] = useNightState();

  useFrame((_, delta) => {
    if (dayCycle) environment.time = (environment.time + delta / 480) % 1;
    else environment.time = 0.2;
    const theta = environment.time * Math.PI * 2;
    const elev = Math.sin(theta);
    environment.sunElevation = elev;
    const dayness = THREE.MathUtils.clamp(elev * 3, 0, 1);
    const duskness = 1 - Math.min(1, Math.abs(elev) * 4);
    tmpColor.copy(NIGHT).lerp(DAY, dayness);
    tmpColor.lerp(DUSK, duskness * 0.65);
    (scene.background as THREE.Color | null)?.copy?.(tmpColor);
    if (!scene.background) scene.background = tmpColor.clone();
    if (fog.current) fog.current.color.copy(tmpColor);
    stars.current?.position.set(telemetry.x, 0, telemetry.z);
    if (sun.current) {
      const r = 220;
      sun.current.position.set(
        telemetry.x + Math.cos(theta) * r,
        Math.max(6, elev * r),
        telemetry.z + Math.sin(theta * 0.5) * 80 + 40,
      );
      target.position.set(telemetry.x, 0, telemetry.z);
      sun.current.target = target;
      sun.current.intensity = 0.15 + dayness * 2.3;
      sun.current.color.set(elev < 0.15 ? "#ffb070" : "#fff4e0");
    }
    if (hemi.current) hemi.current.intensity = 0.18 + dayness * 0.7;
    const night = elev < 0.06;
    if (night !== isNight) setNight(night);
  });

  return (
    <>
      <primitive object={target} />
      <fog ref={fog} attach="fog" args={["#8fc5ee", 120, 560]} />
      <hemisphereLight ref={hemi} args={["#bfe1ff", "#4a5a2a", 0.8]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={10}
        shadow-camera-far={600}
        shadow-bias={-0.0004}
      />
      <group ref={stars}>{isNight && <Stars radius={280} depth={40} count={1800} factor={4} fade speed={0.4} />}</group>
    </>
  );
}

import { useState } from "react";
function useNightState() {
  return useState(false);
}

export function World() {
  return (
    <group>
      <SkyAndSun />
      <Environment frames={1} resolution={64}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} color="#ffd9b0" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={0.8} color="#b0d0ff" position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <Terrain />
      <Roads />
      <Arena />
      <City />
      <Trees />
    </group>
  );
}
