import * as THREE from "three";
import type { VehicleSim } from "./vehicle";

/** Per-frame tyre state shared between the player (writer) and the smoke / skid-mark renderers. */
const tmp = new THREE.Vector3();

export const fx = {
  /** 0..1: how hard the rear tyres are sliding */
  slip: 0,
  speedKmh: 0,
  /** world positions of the two rear contact patches */
  rear: [new THREE.Vector3(), new THREE.Vector3()] as [THREE.Vector3, THREE.Vector3],
  /** bumped on every reset so the skid marks are cleared */
  generation: 0,
  reset(): void {
    this.slip = 0;
    this.generation++;
  },
  update(local: readonly THREE.Vector3[], group: THREE.Object3D, sim: VehicleSim, handbrake: boolean): void {
    for (let i = 0; i < 2; i++) {
      const p = local[i];
      if (!p) continue;
      tmp.copy(p).applyMatrix4(group.matrixWorld);
      this.rear[i]!.copy(tmp);
    }
    const speed = sim.speedKmh;
    let slip = 0;
    if (sim.wheelspin) slip += 0.85;
    if (sim.drifting) slip += Math.min(1, Math.abs(sim.driftAngle) / 0.35);
    if (handbrake && speed > 15) slip += 0.7;
    if (sim.brake > 0.9 && speed > 45) slip += 0.5;
    this.slip = Math.min(1, slip);
    this.speedKmh = speed;
  },
};
