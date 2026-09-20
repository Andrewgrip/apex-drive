export type CarId = "hatchback" | "coupe" | "muscle" | "hypercar";

export interface CarSpec {
  id: CarId;
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
  /** all-wheel drive: every wheel puts power down, so launches are not limited by rear-axle grip */
  awd: boolean;
  /** engine speed (rpm) the launch control holds while the car is staged on the brake */
  launchRpm: number;
  /** longitudinal acceleration (m/s²) above which the front wheels lift off; 0 = the car never wheelies */
  wheelieAccel: number;
  defaultColor: string;
  stats: { topSpeed: number; handling: number; grip: number; accel: number };
  /** driver's eye position and bonnet-camera position, in car space (left-hand drive: driver at +x) */
  eye: [number, number, number];
  hoodCam: [number, number, number];
}

export const CARS: Record<CarId, CarSpec> = {
  hatchback: {
    id: "hatchback",
    mass: 1150,
    maxTorque: 240,
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
    awd: false,
    launchRpm: 4300,
    wheelieAccel: 0,
    defaultColor: "#ff7a1a",
    stats: { topSpeed: 195, handling: 0.8, grip: 0.7, accel: 0.55 },
    eye: [0.34, 1.22, -0.15],
    hoodCam: [0, 1.32, 0.85],
  },
  coupe: {
    id: "coupe",
    mass: 1350,
    maxTorque: 520,
    idleRpm: 900,
    redline: 7600,
    maxRpm: 8100,
    cylinders: 6,
    gearRatios: [3.2, 2.05, 1.5, 1.16, 0.93, 0.76],
    reverseRatio: 3.0,
    finalDrive: 3.9,
    wheelRadius: 0.33,
    engineInertia: 0.2,
    drag: 0.41,
    brakeForce: 14000,
    grip: 1.25,
    gripLat: 10.5,
    driftGrip: 3.6,
    maxSteer: 0.55,
    wheelbase: 2.6,
    awd: false,
    launchRpm: 4700,
    wheelieAccel: 0,
    defaultColor: "#2fa4ff",
    stats: { topSpeed: 295, handling: 0.95, grip: 0.95, accel: 0.95 },
    eye: [0.36, 1.02, -0.35],
    hoodCam: [0, 1.18, 0.9],
  },
  muscle: {
    id: "muscle",
    mass: 1720,
    maxTorque: 1500,
    idleRpm: 750,
    redline: 6200,
    maxRpm: 6700,
    cylinders: 8,
    gearRatios: [2.97, 2.07, 1.43, 1.0, 0.84, 0.63],
    reverseRatio: 3.2,
    finalDrive: 3.55,
    wheelRadius: 0.35,
    engineInertia: 0.28,
    drag: 1.14,
    brakeForce: 15500,
    grip: 1.85,
    gripLat: 7.5,
    driftGrip: 2.6,
    maxSteer: 0.52,
    wheelbase: 2.9,
    awd: false,
    launchRpm: 4200,
    wheelieAccel: 5.5,
    defaultColor: "#d9d9d9",
    stats: { topSpeed: 300, handling: 0.6, grip: 0.9, accel: 1 },
    eye: [0.36, 1.16, -0.4],
    hoodCam: [0, 1.42, 1.0],
  },
  hypercar: {
    id: "hypercar",
    mass: 1560,
    maxTorque: 1000,
    idleRpm: 950,
    redline: 8500,
    maxRpm: 9000,
    cylinders: 10,
    gearRatios: [3.5, 2.35, 1.7, 1.3, 1.02, 0.8],
    reverseRatio: 3.3,
    finalDrive: 3.3,
    wheelRadius: 0.34,
    engineInertia: 0.22,
    drag: 0.36,
    brakeForce: 26000,
    grip: 1.25,
    gripLat: 12,
    driftGrip: 4.2,
    maxSteer: 0.5,
    wheelbase: 2.75,
    awd: true,
    launchRpm: 5600,
    wheelieAccel: 0,
    defaultColor: "#f4c20d",
    stats: { topSpeed: 400, handling: 0.95, grip: 1, accel: 0.93 },
    eye: [0.34, 0.98, -0.25],
    hoodCam: [0, 0.98, 1.2],
  },};

export function torqueCurve(t: number): number {
  // t = rpm / redline. Peak around 65% of redline, softer at both ends.
  const d = (t - 0.62) / 0.62;
  return Math.max(0.3, 1 - 0.65 * d * d);
}





