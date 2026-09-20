import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { CarSpec } from "../../game/cars";
import { adaptCar, CAR_SOURCES, carRuntime, type CarParts } from "../../game/carModels";
import { environment, telemetry } from "../../game/telemetry";

export type { CarParts };

for (const url of new Set(Object.values(CAR_SOURCES).map((s) => s.url))) useGLTF.preload(url, true);

interface Props {
  spec: CarSpec;
  color: string;
  onParts?: (parts: CarParts) => void;
}

// scene lights are dimensionless: ~2.5 at 10 m matches a bright sun, so a headlight needs only a few tens
const BEAM_CANDELA = 45;

export function CarModel({ spec, color, onParts }: Props) {
  const source = CAR_SOURCES[spec.id];
  const gltf = useGLTF(source.url, true);
  // the model is rebuilt only when the car changes; colour is applied by the effect below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const built = useMemo(() => adaptCar(spec, source, gltf.scene, color), [spec, source, gltf.scene]);

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
    built.parts.paint?.color.set(color);
  }, [built, color]);

  useEffect(() => {
    carRuntime.view = built.view;
    onParts?.(built.parts);
  }, [built, onParts]);

  useEffect(() => {
    return () => beams.forEach((b) => b.dispose());
  }, [beams]);

  useFrame(() => {
    const night = THREE.MathUtils.clamp((0.12 - environment.sunElevation) * 6, 0, 1);
    if (built.parts.head) built.parts.head.emissiveIntensity = night * 2.4;
    for (const b of beams) b.intensity = night * BEAM_CANDELA;
    const braking = telemetry.brake > 0.05 || telemetry.handbrake;
    if (built.parts.tail) built.parts.tail.emissiveIntensity = braking ? 2.6 : 0.2 + night * 0.7;
  });

  return <primitive object={built.group} />;
}
