import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

export interface CarParts {
  frontWheels: THREE.Object3D[];
  allWheels: THREE.Object3D[];
}

interface Props {
  url: string;
  scale: number;
  color: string;
  onParts?: (parts: CarParts) => void;
}

export function CarModel({ url, scale, color, onParts }: Props) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.material = (mesh.material as THREE.Material).clone();
      }
    });
    return s;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    const body = scene.getObjectByName("body") as THREE.Mesh | undefined;
    const tint = new THREE.Color(color);
    if (body) {
      const apply = (m: THREE.Material) => {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat.color) mat.color.copy(tint).lerp(new THREE.Color("#ffffff"), 0.08);
        mat.metalness = 0.35;
        mat.roughness = 0.45;
      };
      if (Array.isArray(body.material)) body.material.forEach(apply);
      else apply(body.material);
    }
    const spoiler = scene.getObjectByName("spoiler") as THREE.Mesh | undefined;
    if (spoiler && !Array.isArray(spoiler.material)) {
      const mat = spoiler.material as THREE.MeshStandardMaterial;
      mat.color?.copy(tint).lerp(new THREE.Color("#ffffff"), 0.25);
    }
    const front: THREE.Object3D[] = [];
    const all: THREE.Object3D[] = [];
    for (const n of ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"]) {
      const w = scene.getObjectByName(n);
      if (!w) continue;
      w.rotation.order = "YXZ";
      all.push(w);
      if (n.includes("front")) front.push(w);
    }
    onParts?.({ frontWheels: front, allWheels: all });
  }, [scene, color, onParts]);

  return <primitive object={scene} scale={scale} />;
}
