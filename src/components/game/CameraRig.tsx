import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { useGame, type CameraMode } from "../../game/store";
import { telemetry } from "../../game/telemetry";

const OFFSETS: Record<CameraMode, { pos: THREE.Vector3; look: THREE.Vector3; rate: number }> = {
  chase: { pos: new THREE.Vector3(0, 2.6, -7.2), look: new THREE.Vector3(0, 0.9, 6), rate: 5 },
  hood: { pos: new THREE.Vector3(0, 1.45, 0.6), look: new THREE.Vector3(0, 1.1, 30), rate: 22 },
  cockpit: { pos: new THREE.Vector3(0.0, 1.25, -0.35), look: new THREE.Vector3(0, 1.05, 30), rate: 26 },
};

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _flatQ = new THREE.Quaternion();
const _euler = new THREE.Euler();

export function CameraRig({ carRef, menu }: { carRef: RefObject<THREE.Group | null>; menu: boolean }) {
  const mode = useGame((s) => s.settings.camera);
  const fov = useGame((s) => s.settings.fov);
  const lookState = useRef(new THREE.Vector3());
  const orbit = useRef(0);
  const first = useRef(true);

  useFrame(({ camera }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const car = carRef.current;
    if (!car) return;
    const targetFov = menu ? 45 : fov;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-4 * delta));
      cam.updateProjectionMatrix();
    }

    if (menu) {
      orbit.current += delta * 0.18;
      const r = 7.5;
      _pos.set(
        car.position.x + Math.sin(orbit.current) * r,
        car.position.y + 2.1 + Math.sin(orbit.current * 0.5) * 0.4,
        car.position.z + Math.cos(orbit.current) * r,
      );
      _look.copy(car.position).add(new THREE.Vector3(0, 0.9, 0));
      const t = first.current ? 1 : 1 - Math.exp(-3 * delta);
      cam.position.lerp(_pos, t);
      lookState.current.lerp(_look, t);
      cam.lookAt(lookState.current);
      first.current = false;
      return;
    }

    const cfg = OFFSETS[mode];
    // chase camera follows yaw only (flat), interior cams follow full orientation
    if (mode === "chase") {
      _euler.set(0, telemetry.yaw, 0);
      _flatQ.setFromEuler(_euler);
      _q.copy(_flatQ);
    } else {
      _q.copy(car.quaternion);
    }
    const speedPull = mode === "chase" ? Math.min(2.5, telemetry.speedKmh / 90) : 0;
    _pos.copy(cfg.pos);
    _pos.z -= speedPull;
    _pos.y += speedPull * 0.25;
    _pos.applyQuaternion(_q).add(car.position);
    _look.copy(cfg.look).applyQuaternion(_q).add(car.position);
    const t = first.current ? 1 : 1 - Math.exp(-cfg.rate * delta);
    cam.position.lerp(_pos, t);
    lookState.current.lerp(_look, first.current ? 1 : 1 - Math.exp(-(cfg.rate + 4) * delta));
    cam.lookAt(lookState.current);
    first.current = false;
  });
  return null;
}
