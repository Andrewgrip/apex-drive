import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { modeState } from "../../game/modes";
import { useGame } from "../../game/store";
import { gates, terrainHeight } from "../../game/world";

const PILLAR_OFFSET = 8;
const PILLAR_HEIGHT = 6;
const NEXT = new THREE.Color("#ff7a1a");
const DIM = new THREE.Color("#5a6270");
const FINISH = new THREE.Color("#f4f4f4");

interface GateMaterials {
  frame: THREE.MeshStandardMaterial;
  banner: THREE.MeshBasicMaterial;
}

function TimeTrialGates() {
  const materials = useMemo<GateMaterials[]>(
    () =>
      gates.map(() => ({
        frame: new THREE.MeshStandardMaterial({ color: DIM, emissive: DIM, emissiveIntensity: 0.1, roughness: 0.6 }),
        banner: new THREE.MeshBasicMaterial({ color: NEXT, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
      })),
    [],
  );

  useFrame(({ clock }) => {
    const pulse = 0.65 + 0.35 * Math.sin(clock.elapsedTime * 5);
    materials.forEach((m, i) => {
      const isNext = i === modeState.nextGate;
      const base = i === 0 ? FINISH : DIM;
      const color = isNext ? NEXT : base;
      m.frame.color.copy(color);
      m.frame.emissive.copy(color);
      m.frame.emissiveIntensity = isNext ? 0.6 + pulse : i === 0 ? 0.35 : 0.08;
      m.banner.color.copy(isNext ? NEXT : base);
      m.banner.opacity = isNext ? 0.14 + 0.1 * pulse : i === 0 ? 0.08 : 0;
    });
  });

  return (
    <group>
      {gates.map((g, i) => {
        const mat = materials[i]!;
        return (
          <group key={i} position={[g.x, terrainHeight(g.x, g.z), g.z]} rotation-y={g.yaw}>
            {[-PILLAR_OFFSET, PILLAR_OFFSET].map((x) => (
              <mesh key={x} position={[x, PILLAR_HEIGHT / 2, 0]} material={mat.frame} castShadow>
                <boxGeometry args={[0.7, PILLAR_HEIGHT, 0.7]} />
              </mesh>
            ))}
            <mesh position={[0, PILLAR_HEIGHT, 0]} material={mat.frame} castShadow>
              <boxGeometry args={[PILLAR_OFFSET * 2 + 0.7, 0.7, 0.7]} />
            </mesh>
            <mesh position={[0, PILLAR_HEIGHT / 2, 0]} material={mat.banner}>
              <planeGeometry args={[PILLAR_OFFSET * 2, PILLAR_HEIGHT]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function Gates() {
  const mode = useGame((s) => s.mode);
  return mode === "timeTrial" ? <TimeTrialGates /> : null;
}
