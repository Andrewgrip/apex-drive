import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { CARS, type CarSpec } from "../../game/cars";
import { useGame, type CameraMode } from "../../game/store";
import { telemetry } from "../../game/telemetry";

interface Rig {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  rate: number;
}

function rigFor(mode: CameraMode, spec: CarSpec): Rig {
  if (mode === "chase") return { pos: new THREE.Vector3(0, 2.5, -6.8), look: new THREE.Vector3(0, 1.0, 6), rate: 5 };
  if (mode === "hood") {
    const [x, y, z] = spec.hoodCam;
    return { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(x, y - 0.15, z + 30), rate: 22 };
  }
  const [x, y, z] = spec.eye;
  return { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(x, y - 0.08, z + 30), rate: 26 };
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _flatQ = new THREE.Quaternion();
const _euler = new THREE.Euler();

const FOV_PER_KMH = 1 / 15;
const MAX_FOV_BOOST = 20;

export function CameraRig({ carRef, menu }: { carRef: RefObject<THREE.Group | null>; menu: boolean }) {
  const mode = useGame((s) => s.settings.camera);
  const fov = useGame((s) => s.settings.fov);
  const carId = useGame((s) => s.settings.carId);
  const lookState = useRef(new THREE.Vector3());
  const orbit = useRef(0);
  const first = useRef(true);
  const prevCar = useRef(new THREE.Vector3());
  const velocity = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const car = carRef.current;
    if (!car) return;
    // car velocity, used to lead the follow camera: an exponential follow alone trails by v/rate metres
    if (delta > 0 && !first.current) {
      velocity.current.copy(car.position).sub(prevCar.current).divideScalar(delta);
      if (velocity.current.length() > 140) velocity.current.set(0, 0, 0); // teleport (restart), not motion
    }
    prevCar.current.copy(car.position);
    // the field of view opens up with speed: the strongest cheap cue for "going fast"
    const boost = menu ? 0 : Math.min(MAX_FOV_BOOST, telemetry.speedKmh * FOV_PER_KMH);
    const targetFov = menu ? 45 : fov + boost;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-4 * delta));
      cam.updateProjectionMatrix();
    }

    if (menu) {
      orbit.current += delta * 0.18;
      const r = 8;
      _pos.set(
        car.position.x + Math.sin(orbit.current) * r,
        car.position.y + 2.0 + Math.sin(orbit.current * 0.5) * 0.4,
        car.position.z + Math.cos(orbit.current) * r,
      );
      // aim a little below the car so it sits in the clear upper-middle of the screen, above the menu panels
      _look.copy(car.position).add(new THREE.Vector3(0, -0.3, 0));
      const t = first.current ? 1 : 1 - Math.exp(-3 * delta);
      cam.position.lerp(_pos, t);
      lookState.current.lerp(_look, t);
      cam.lookAt(lookState.current);
      first.current = false;
      return;
    }

    const cfg = rigFor(mode, CARS[carId]);
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
    _pos.applyQuaternion(_q).add(car.position).addScaledVector(velocity.current, 1 / cfg.rate);
    _look.copy(cfg.look).applyQuaternion(_q).add(car.position).addScaledVector(velocity.current, 1 / (cfg.rate + 4));
    const t = first.current ? 1 : 1 - Math.exp(-cfg.rate * delta);
    cam.position.lerp(_pos, t);
    lookState.current.lerp(_look, first.current ? 1 : 1 - Math.exp(-(cfg.rate + 4) * delta));
    cam.lookAt(lookState.current);
    // road buzz at speed
    const shake = THREE.MathUtils.clamp((telemetry.speedKmh - 150) / 220, 0, 0.5);
    if (shake > 0) {
      cam.position.y += (Math.random() - 0.5) * 0.03 * shake;
      cam.position.x += (Math.random() - 0.5) * 0.03 * shake;
    }
    first.current = false;
  });
  return null;
}
