export type CarId = "hatchback" | "coupe" | "muscle";

export interface CarSpec {
  id: CarId;
  model: string;
  scale: number;
  mass: number;
  maxTorque: number;
  idleRpm: number;
  redline: number;
  maxRpm: number;
  cylinders: number;
  gearRatios: number[];
  reverseRatio: number;
  finalDrive: number;
  wheelRadius: number;
  engineInertia: number;
  drag: number;
  brakeForce: number;
  grip: number;
  gripLat: number;
  driftGrip: number;
  maxSteer: number;
  wheelbase: number;
  defaultColor: string;
  stats: { topSpeed: number; handling: number; grip: number; accel: number };
}

export const CARS: Record<CarId, CarSpec> = {
  hatchback: {
    id: "hatchback",
    model: `${import.meta.env.BASE_URL}models/hatchback.glb`,
    scale: 2.0,
    mass: 1150,
    maxTorque: 185,
    idleRpm: 850,
    redline: 6800,
    maxRpm: 7300,
    cylinders: 4,
    gearRatios: [3.6, 2.1, 1.42, 1.05, 0.84, 0.7],
    reverseRatio: 3.4,
    finalDrive: 4.1,
    wheelRadius: 0.31,
    engineInertia: 0.17,
    drag: 0.42,
    brakeForce: 10500,
    grip: 1.0,
    gripLat: 9,
    driftGrip: 3.2,
    maxSteer: 0.58,
    wheelbase: 2.5,
    defaultColor: "#ff7a1a",
    stats: { topSpeed: 165, handling: 0.8, grip: 0.8, accel: 0.5 },
  },
  coupe: {
    id: "coupe",
    model: `${import.meta.env.BASE_URL}models/coupe.glb`,
    scale: 2.0,
    mass: 1350,
    maxTorque: 340,
    idleRpm: 900,
    redline: 7600,
    maxRpm: 8100,
    cylinders: 6,
    gearRatios: [3.2, 2.05, 1.5, 1.16, 0.93, 0.76],
    reverseRatio: 3.0,
    finalDrive: 3.9,
    wheelRadius: 0.33,
    engineInertia: 0.2,
    drag: 0.36,
    brakeForce: 14000,
    grip: 1.15,
    gripLat: 10.5,
    driftGrip: 3.6,
    maxSteer: 0.55,
    wheelbase: 2.6,
    defaultColor: "#2fa4ff",
    stats: { topSpeed: 250, handling: 0.95, grip: 0.9, accel: 0.8 },
  },
  muscle: {
    id: "muscle",
    model: `${import.meta.env.BASE_URL}models/muscle.glb`,
    scale: 2.0,
    mass: 1720,
    maxTorque: 560,
    idleRpm: 750,
    redline: 6200,
    maxRpm: 6700,
    cylinders: 8,
    gearRatios: [2.97, 2.07, 1.43, 1.0, 0.84, 0.63],
    reverseRatio: 3.2,
    finalDrive: 3.55,
    wheelRadius: 0.35,
    engineInertia: 0.28,
    drag: 0.44,
    brakeForce: 15500,
    grip: 0.92,
    gripLat: 7.5,
    driftGrip: 2.6,
    maxSteer: 0.52,
    wheelbase: 2.9,
    defaultColor: "#d9d9d9",
    stats: { topSpeed: 280, handling: 0.6, grip: 0.65, accel: 0.95 },
  },
};

export function torqueCurve(t: number): number {
  // t = rpm / redline. Peak around 65% of redline, softer at both ends.
  const d = (t - 0.62) / 0.62;
  return Math.max(0.3, 1 - 0.65 * d * d);
}
