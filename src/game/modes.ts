import type { CarId } from "./cars";
import type { SimEvent, VehicleSim } from "./vehicle";
import { GATE_COUNT, gates, SPAWNS, type SpawnPoint } from "./world";

export type GameMode = "freeRoam" | "timeTrial" | "drift";

export const COUNTDOWN_SECONDS = 3;
export const DRIFT_DURATION = 120;
const GATE_HALF_WIDTH = 14;
const DRIFT_MIN_SPEED_KMH = 18;
const DRIFT_MIN_ANGLE = 0.15;
const DRIFT_WIDE_ANGLE = 0.3; // a slide this wide counts even if the sim has not flagged it
const DRIFT_BANK_DELAY = 1.1;
const DRIFT_STEP_SECONDS = 1.5;
const DRIFT_MAX_MULTIPLIER = 8;
const TOAST_SECONDS = 2.4;

export type ToastKey = "newBest" | "lapDone" | "bank" | "crash";

export interface Toast {
  key: ToastKey;
  value: number;
  ttl: number;
}

export interface ModeState {
  mode: GameMode;
  /** seconds until GO; while > 0 the car is held on the handbrake */
  countdown: number;
  // time trial
  lap: number;
  lapTime: number;
  lastLap: number;
  bestLap: number;
  nextGate: number;
  // drift
  score: number;
  chain: number;
  multiplier: number;
  driftTime: number;
  gap: number;
  timeLeft: number;
  bestScore: number;
  finished: boolean;
  toast: Toast | null;
}

export const modeState: ModeState = {
  mode: "freeRoam",
  countdown: 0,
  lap: 1,
  lapTime: 0,
  lastLap: 0,
  bestLap: 0,
  nextGate: 1,
  score: 0,
  chain: 0,
  multiplier: 1,
  driftTime: 0,
  gap: 0,
  timeLeft: DRIFT_DURATION,
  bestScore: 0,
  finished: false,
  toast: null,
};

// ---------- persistence (best lap per car, best drift score) ----------

const lapKey = (car: CarId) => `apex-drive-best-lap-${car}`;
const DRIFT_KEY = "apex-drive-best-drift";

function readNumber(key: string): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable (private mode): the record just isn't kept
  }
}

export function spawnFor(mode: GameMode): SpawnPoint {
  return SPAWNS[mode];
}

export function resetMode(mode: GameMode, car: CarId): void {
  modeState.mode = mode;
  modeState.countdown = mode === "freeRoam" ? 0 : COUNTDOWN_SECONDS;
  modeState.lap = 1;
  modeState.lapTime = 0;
  modeState.lastLap = 0;
  modeState.bestLap = mode === "timeTrial" ? readNumber(lapKey(car)) : 0;
  modeState.nextGate = 1;
  modeState.score = 0;
  modeState.chain = 0;
  modeState.multiplier = 1;
  modeState.driftTime = 0;
  modeState.gap = 0;
  modeState.timeLeft = DRIFT_DURATION;
  modeState.bestScore = mode === "drift" ? readNumber(DRIFT_KEY) : 0;
  modeState.finished = false;
  modeState.toast = null;
}

function setToast(key: ToastKey, value = 0): void {
  modeState.toast = { key, value, ttl: TOAST_SECONDS };
}

// ---------- time trial ----------

function crossedGate(index: number, px: number, pz: number, x: number, z: number): boolean {
  const g = gates[index]!;
  const before = (px - g.x) * g.tx + (pz - g.z) * g.tz;
  const after = (x - g.x) * g.tx + (z - g.z) * g.tz;
  if (before >= 0 || after < 0) return false;
  const lateral = Math.abs(-(x - g.x) * g.tz + (z - g.z) * g.tx);
  return lateral < GATE_HALF_WIDTH;
}

function updateTimeTrial(car: CarId, px: number, pz: number, x: number, z: number, dt: number): void {
  modeState.lapTime += dt;
  const next = modeState.nextGate;
  if (!crossedGate(next, px, pz, x, z)) return;
  if (next === 0) {
    const time = modeState.lapTime;
    const isBest = modeState.bestLap === 0 || time < modeState.bestLap;
    modeState.lastLap = time;
    if (isBest) {
      modeState.bestLap = time;
      writeNumber(lapKey(car), time);
      setToast("newBest", time);
    } else {
      setToast("lapDone", time);
    }
    modeState.lap += 1;
    modeState.lapTime = 0;
    modeState.nextGate = 1;
  } else {
    modeState.nextGate = (next + 1) % GATE_COUNT;
  }
}

// ---------- drift challenge ----------

function bankChain(): void {
  if (modeState.chain <= 0) return;
  const banked = Math.round(modeState.chain);
  modeState.score += banked;
  modeState.chain = 0;
  setToast("bank", banked);
}

function finishDrift(): void {
  bankChain();
  modeState.finished = true;
  if (modeState.score > modeState.bestScore) {
    modeState.bestScore = modeState.score;
    writeNumber(DRIFT_KEY, modeState.score);
  }
}

function updateDrift(sim: VehicleSim, events: readonly SimEvent[], dt: number): void {
  modeState.timeLeft = Math.max(0, modeState.timeLeft - dt);
  if (events.includes("hit") && modeState.chain > 0) {
    modeState.chain = 0;
    modeState.driftTime = 0;
    modeState.multiplier = 1;
    setToast("crash");
  }
  const slip = Math.abs(sim.driftAngle);
  const drifting = (sim.drifting || slip > DRIFT_WIDE_ANGLE) && sim.speedKmh > DRIFT_MIN_SPEED_KMH && slip > DRIFT_MIN_ANGLE;
  if (drifting) {
    modeState.gap = 0;
    modeState.driftTime += dt;
    modeState.multiplier = Math.min(DRIFT_MAX_MULTIPLIER, 1 + Math.floor(modeState.driftTime / DRIFT_STEP_SECONDS));
    modeState.chain += sim.speedKmh * Math.min(slip, 1.2) * 4 * modeState.multiplier * dt;
  } else {
    modeState.gap += dt;
    if (modeState.gap > DRIFT_BANK_DELAY) {
      bankChain();
      modeState.driftTime = 0;
      modeState.multiplier = 1;
    }
  }
  if (modeState.timeLeft <= 0) finishDrift();
}

// ---------- per-frame entry point ----------

export function updateMode(car: CarId, sim: VehicleSim, events: readonly SimEvent[], px: number, pz: number, dt: number): void {
  if (modeState.toast) {
    modeState.toast.ttl -= dt;
    if (modeState.toast.ttl <= 0) modeState.toast = null;
  }
  if (modeState.mode === "freeRoam") return;
  if (modeState.countdown > 0) {
    modeState.countdown = Math.max(0, modeState.countdown - dt);
    return;
  }
  if (modeState.mode === "timeTrial") updateTimeTrial(car, px, pz, sim.x, sim.z, dt);
  else if (!modeState.finished) updateDrift(sim, events, dt);
}
