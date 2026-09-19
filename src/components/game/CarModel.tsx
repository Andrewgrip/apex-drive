import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildCar, type CarParts } from "../../game/carBuilder";
import type { CarSpec } from "../../game/cars";
import { environment, telemetry } from "../../game/telemetry";

export type { CarParts };

interface Props {
  spec: CarSpec;
  color: string;
  onParts?: (parts: CarParts) => void;
}

// scene lights are dimensionless: ~2.5 at 10 m matches a bright sun, so a headlight needs only a few tens
const BEAM_CANDELA = 45;

export function CarModel({ spec, color, onParts }: Props) {
  // the model is rebuilt only when the car changes; colour is applied by the effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => buildCar(spec.id, spec, color), [spec]);

  const beams = useMemo(() => {
    return built.parts.headPositions.map((p) => {
      const light = new THREE.SpotLight("#fff1cf", 0, 90, 0.5, 0.7, 1.2);
      light.position.set(p.x, p.y, p.z);
      light.target.position.set(p.x * 0.4, 0.2, p.z + 30);
      built.parts.body.add(light, light.target);
      return light;
    });
  }, [built]);

  useEffect(() => {
    built.parts.paint.color.set(color);
  }, [built, color]);

  useEffect(() => {
    onParts?.(built.parts);
  }, [built, onParts]);

  useEffect(() => {
    return () => {
      built.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      beams.forEach((b) => b.dispose());
    };
  }, [built, beams]);

  useFrame(() => {
    const night = THREE.MathUtils.clamp((0.12 - environment.sunElevation) * 6, 0, 1);
    built.parts.head.emissiveIntensity = 0.25 + night * 2.4;
    for (const b of beams) b.intensity = night * BEAM_CANDELA;
    const braking = telemetry.brake > 0.05 || telemetry.handbrake;
    built.parts.tail.emissiveIntensity = braking ? 2.6 : 0.35 + night * 0.7;
  });

  return <primitive object={built.group} />;
}
