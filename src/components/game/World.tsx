import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, Stars } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  buildRoadGeometry,
  city,
  connectorSamples,
  CITY_HALF,
  terrainHeight,
  trackSamples,
  trees,
  WORLD_HALF,
} from "../../game/world";
import { environment, telemetry } from "../../game/telemetry";
import { useGame } from "../../game/store";

// ---------- Terrain ----------
function Terrain() {
  const geometry = useMemo(() => {
    const seg = 140;
    const g = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const grassA = new THREE.Color("#5c8a3c");
    const grassB = new THREE.Color("#7aa04a");
    const dry = new THREE.Color("#9a9a5a");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const n = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.07) * Math.cos(z * 0.11 - x * 0.05);
      c.copy(grassA).lerp(grassB, n);
      c.lerp(dry, Math.min(1, Math.max(0, (h - 8) / 10)) * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}

// ---------- Roads ----------
function Roads() {
  const track = useMemo(() => buildRoadGeometry(trackSamples, 6, true, true), []);
  const connector = useMemo(() => buildRoadGeometry(connectorSamples, 5, false, false), []);
  return (
    <group>
      <mesh geometry={track} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0} />
      </mesh>
      <mesh geometry={connector} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
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
function Trees() {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      const h = 2.2 * t.scale;
      p.set(t.x, t.y + h / 2, t.z);
      s.set(0.35 * t.scale, h, 0.35 * t.scale);
      m.compose(p, q, s);
      trunk.current!.setMatrixAt(i, m);
      p.set(t.x, t.y + h + 2.4 * t.scale, t.z);
      s.set(2.2 * t.scale, 5 * t.scale, 2.2 * t.scale);
      m.compose(p, q, s);
      leaves.current!.setMatrixAt(i, m);
      col.setHSL(0.28 + t.hue * 0.08, 0.45, 0.28 + t.hue * 0.12);
      leaves.current!.setColorAt(i, col);
    });
    trunk.current!.instanceMatrix.needsUpdate = true;
    leaves.current!.instanceMatrix.needsUpdate = true;
    if (leaves.current!.instanceColor) leaves.current!.instanceColor.needsUpdate = true;
  }, []);
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.5, 0.7, 1, 6]} />
        <meshStandardMaterial color="#5a3d26" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, trees.length]} castShadow>
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
      <fog ref={fog} attach="fog" args={["#8fc5ee", 90, 460]} />
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
      {isNight && <Stars radius={280} depth={40} count={1800} factor={4} fade speed={0.4} />}
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
      <City />
      <Trees />
    </group>
  );
}
