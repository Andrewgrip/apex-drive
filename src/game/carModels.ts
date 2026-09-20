import * as THREE from "three";
import type { CarId, CarSpec } from "./cars";

/**
 * Ready-made car models (glTF). Each source car is normalised into the game's car frame:
 * forward = +z, up = +y, centred between the axles, tyres on y = 0, sized to the physics wheelbase.
 * The four wheels become separate pivots (spin about x, front pair steers about y); everything else
 * is the "body" that leans on the suspension.
 *
 * Credits: see public/models/CREDITS.txt.
 */

export interface CarParts {
  /** everything that leans on the suspension: the body, lights, interior (not the wheels) */
  body: THREE.Group;
  frontWheels: THREE.Object3D[];
  allWheels: THREE.Object3D[];
  steeringWheel: THREE.Object3D;
  /** the recolourable body paint, when the model has one */
  paint: THREE.MeshStandardMaterial | null;
  head: THREE.MeshStandardMaterial | null;
  tail: THREE.MeshStandardMaterial | null;
  /** local positions of the headlights, for the night beams */
  headPositions: THREE.Vector3[];
  /** where the rear tyres touch the ground, for smoke and skid marks */
  rearContact: THREE.Vector3[];
}

export interface CarView {
  /** driver's eye and bonnet-camera positions in car space */
  eye: [number, number, number];
  hoodCam: [number, number, number];
}

export interface CarSource {
  url: string;
  /** name of the car's node inside the file; null = the whole file is one car */
  node: string | null;
  /** target body width (m) for the stylised pack cars; null = keep the model's real proportions */
  width: number | null;
  recolor: boolean;
}

const BASE = import.meta.env.BASE_URL;
const PACK = `${BASE}models/cars_big_set.glb`;

export const CAR_SOURCES: Record<CarId, CarSource> = {
  hatchback: { url: PACK, node: "car_daily", width: 1.72, recolor: false },
  coupe: { url: PACK, node: "car_sports_striped", width: 1.85, recolor: false },
  muscle: { url: PACK, node: "car_charger", width: 1.95, recolor: false },
  hypercar: { url: `${BASE}models/ferrari.glb`, node: null, width: null, recolor: true },
};

/** the camera positions of the car currently on screen (the cameras follow the model, not fixed numbers) */
export const carRuntime: { view: CarView | null } = { view: null };

const WHEEL_NAME = /^wheel_(f|r|b)[lr]/i;
const FRONT_WHEEL = /^wheel_f/i;

const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

function mean(vs: THREE.Vector3[]): THREE.Vector3 {
  const m = new THREE.Vector3();
  for (const v of vs) m.add(v);
  return m.divideScalar(Math.max(1, vs.length));
}

function findMaterial(root: THREE.Object3D, name: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || found) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m.name === name && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) found = m as THREE.MeshStandardMaterial;
  });
  return found;
}

export function adaptCar(spec: CarSpec, source: CarSource, scene: THREE.Object3D, color: string): { group: THREE.Group; parts: CarParts; view: CarView } {
  const original = source.node ? scene.getObjectByName(source.node) : scene;
  if (!original) throw new Error(`car node "${source.node}" not found in ${source.url}`);
  const holder = original.clone(true);
  holder.position.set(0, 0, 0);

  // ----- find the wheels and turn the car so it drives towards +z -----
  const wheelObjs: THREE.Object3D[] = [];
  holder.traverse((o) => {
    if (WHEEL_NAME.test(o.name)) wheelObjs.push(o);
  });
  if (wheelObjs.length !== 4) throw new Error(`expected 4 wheels in ${source.url}, found ${wheelObjs.length}`);
  holder.updateMatrixWorld(true);
  const centre = (o: THREE.Object3D) => boxOf(o).getCenter(new THREE.Vector3());
  const front = wheelObjs.filter((o) => FRONT_WHEEL.test(o.name));
  const rear = wheelObjs.filter((o) => !FRONT_WHEEL.test(o.name));
  const forward = mean(front.map(centre)).sub(mean(rear.map(centre)));
  holder.rotateY(-Math.atan2(forward.x, forward.z));
  holder.updateMatrixWorld(true);

  const info = wheelObjs.map((o) => {
    const b = boxOf(o);
    const size = b.getSize(new THREE.Vector3());
    return { obj: o, centre: b.getCenter(new THREE.Vector3()), diameter: Math.max(size.y, size.z), isFront: FRONT_WHEEL.test(o.name) };
  });
  const frontZ = mean(info.filter((w) => w.isFront).map((w) => w.centre)).z;
  const rearZ = mean(info.filter((w) => !w.isFront).map((w) => w.centre)).z;
  const midX = mean(info.map((w) => w.centre)).x;
  const midZ = (frontZ + rearZ) / 2;
  const wheelbase = frontZ - rearZ;

  // ----- scale: stylised cars are stretched along the length (their wheelbase is far too short for their width) -----
  const fullBox = boxOf(holder);
  const sz = spec.wheelbase / wheelbase;
  const sxy = source.width ? source.width / fullBox.getSize(new THREE.Vector3()).x : sz;
  const wheelScale = sxy;
  const map = (p: THREE.Vector3) => new THREE.Vector3((p.x - midX) * sxy, p.y * sxy, (p.z - midZ) * sz);
  const groundShift = -Math.min(...info.map((w) => map(w.centre).y - (w.diameter / 2) * wheelScale));

  // ----- build the car: wheel pivots + a scaled body -----
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.add(holder);
  group.add(body);
  const pivots: THREE.Object3D[] = [];
  const frontPivots: THREE.Object3D[] = [];
  const rearContact: THREE.Vector3[] = [];
  for (const w of info) {
    const pivot = new THREE.Group();
    pivot.rotation.order = "YXZ";
    group.add(pivot);
    pivot.position.copy(w.centre);
    pivot.updateMatrixWorld(true);
    pivot.attach(w.obj); // moves the wheel into the pivot without changing where it is
    const at = map(w.centre);
    pivot.position.set(at.x, at.y + groundShift, at.z);
    pivot.scale.setScalar(wheelScale);
    pivots.push(pivot);
    if (w.isFront) frontPivots.push(pivot);
    else rearContact.push(new THREE.Vector3(pivot.position.x, 0.02, pivot.position.z));
  }
  body.scale.set(sxy, sxy, sz);
  body.position.set(-midX * sxy, groundShift, -midZ * sz);

  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
    }
  });
  group.updateMatrixWorld(true);

  // ----- materials: recolourable paint and light materials where the model has them -----
  let paint: THREE.MeshStandardMaterial | null = null;
  let head: THREE.MeshStandardMaterial | null = null;
  let tail: THREE.MeshStandardMaterial | null = null;
  if (source.recolor) {
    paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
    const bodyMesh = holder.getObjectByName("body") as THREE.Mesh | undefined;
    if (bodyMesh) bodyMesh.material = paint;
    head = findMaterial(holder, "Projector_Glass");
    tail = findMaterial(holder, "Taillight_Glass");
    if (head) head.emissive = new THREE.Color("#fff1c7");
    if (tail) tail.emissive = new THREE.Color("#ff1212");
  }

  // ----- geometry-derived positions -----
  const bb = boxOf(body);
  const height = bb.max.y;
  const length = bb.max.z - bb.min.z;
  const centreZ = (bb.max.z + bb.min.z) / 2;
  const halfWidth = (bb.max.x - bb.min.x) / 2;
  const view: CarView = {
    eye: [0.34, height * 0.8, centreZ - length * 0.03],
    hoodCam: [0, height * 0.92, centreZ + length * 0.2],
  };
  const headPositions = [
    new THREE.Vector3(halfWidth * 0.62, height * 0.42, bb.max.z - 0.15),
    new THREE.Vector3(-halfWidth * 0.62, height * 0.42, bb.max.z - 0.15),
  ];

  return {
    group,
    parts: { body, frontWheels: frontPivots, allWheels: pivots, steeringWheel: new THREE.Object3D(), paint, head, tail, headPositions, rearContact },
    view,
  };
}
