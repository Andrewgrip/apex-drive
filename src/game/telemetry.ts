import type { TransmissionMode } from "./vehicle";

/** Mutable per-frame vehicle data shared between the simulation, HUD and audio. */
export const telemetry = {
  speedKmh: 0,
  rpm: 0,
  gear: 0,
  clutch: 0,
  clutchPedal: 0,
  throttle: 0,
  brake: 0,
  engineOn: true,
  stalled: false,
  starting: false,
  wheelspin: false,
  drifting: false,
  limiter: false,
  shifting: false,
  handbrake: false,
  x: 0,
  z: 0,
  yaw: 0,
  mode: "automatic" as TransmissionMode,
  driftAngle: 0,
};

export type Telemetry = typeof telemetry;

/** Environment state (time of day etc.), mutated every frame. */
export const environment = {
  /** 0..1, 0.25 = noon, 0.75 = midnight */
  time: 0.2,
  sunElevation: 1,
};
