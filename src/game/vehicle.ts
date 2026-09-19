import { torqueCurve, type CarSpec } from "./cars";
import type { Collider } from "./world";

export type TransmissionMode = "automatic" | "semi" | "manual";

export interface RawInput {
  fwd: number;
  back: number;
  steer: number;
  handbrake: boolean;
  clutch: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
  selectGear: number | null;
}

export interface SimOptions {
  mode: TransmissionMode;
  autoDownshift: boolean;
}

export type SimEvent = "shift" | "grind" | "stall" | "start" | "deny" | "hit";

const G = 9.81;
const CG_HEIGHT = 0.52; // centre of gravity height (m), for weight transfer
const TWO_PI = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export class VehicleSim {
  // pose
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  // motion
  vx = 0;
  vz = 0;
  vFwd = 0;
  vLat = 0;
  yawRate = 0;
  steer = 0;
  // drivetrain
  rpm = 900;
  gear = 0;
  pendingGear = 0;
  shiftTimer = 0;
  shiftCooldown = 0;
  clutchPedal = 0;
  clutch = 0;
  engineOn = true;
  stalled = false;
  starter = 0;
  throttle = 0;
  brake = 0;
  limiter = false;
  wheelspin = false;
  private wheelspinT = 0;
  drifting = false;
  driftAngle = 0;
  /** smoothed longitudinal acceleration (m/s²), used for weight transfer and body pitch */
  accel = 0;
  /** smoothed lateral acceleration, positive when turning right (m/s²) */
  latAccel = 0;
  wheelOmegaVisual = 0;
  events: SimEvent[] = [];

  constructor(
    public spec: CarSpec,
    private height: (x: number, z: number) => number,
    private colliders: Collider[],
    private bound: number,
  ) {}

  reset(x: number, z: number, yaw: number, mode: TransmissionMode) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.vFwd = this.vLat = this.yawRate = this.steer = 0;
    this.rpm = this.spec.idleRpm;
    this.gear = mode === "manual" ? 0 : 1;
    this.pendingGear = this.gear;
    this.shiftTimer = this.shiftCooldown = 0;
    this.clutchPedal = 0;
    this.clutch = 0;
    this.engineOn = true;
    this.stalled = false;
    this.starter = 0;
    this.wheelspinT = 0;
    this.accel = 0;
    this.latAccel = 0;
    this.events.length = 0;
    this.updatePose();
  }

  ratio(g: number): number {
    if (g === -1) return -this.spec.reverseRatio;
    if (g > 0) return this.spec.gearRatios[g - 1];
    return 0;
  }

  private beginShift(target: number, time: number) {
    this.pendingGear = target;
    this.shiftTimer = time;
  }

  step(rawDt: number, input: RawInput, opts: SimOptions) {
    const dt = Math.min(rawDt, 0.05);
    this.handleTransmission(dt, input, opts);
    const n = 4;
    const vBefore = this.vFwd;
    for (let i = 0; i < n; i++) this.integrate(dt / n, input, opts);
    if (dt > 0) {
      const k = 1 - Math.exp(-8 * dt);
      this.accel += ((this.vFwd - vBefore) / dt - this.accel) * k;
      this.latAccel += (-this.yawRate * this.vFwd - this.latAccel) * k;
    }
    this.collide();
    this.updatePose();
    // visual wheel spin: wheelspin makes the driven wheels spin faster than the road speed
    const roadOmega = this.vFwd / this.spec.wheelRadius;
    this.wheelOmegaVisual = this.wheelspin ? roadOmega + Math.sign(this.ratio(this.gear) || 1) * 25 : roadOmega;
  }

  private handleTransmission(dt: number, input: RawInput, opts: SimOptions) {
    const s = this.spec;
    const { mode } = opts;

    // Pedal mapping. Automatic handles reverse by itself.
    let thr: number;
    let brk: number;
    if (mode === "automatic") {
      const stopped = Math.abs(this.vFwd) < 0.8;
      if (this.gear === -1) {
        thr = input.back;
        brk = input.fwd;
        if (stopped && input.fwd > 0.1 && input.back < 0.1) this.gear = 1;
      } else {
        thr = input.fwd;
        brk = input.back;
        if (stopped && input.back > 0.1 && input.fwd < 0.1 && this.gear >= 0 && this.shiftTimer <= 0) this.gear = -1;
        if (this.gear === 0 && input.fwd > 0.1) this.gear = 1;
      }
    } else {
      thr = input.fwd;
      brk = input.back;
    }
    this.throttle = thr;
    this.brake = brk;

    // Clutch
    if (mode === "manual") {
      this.clutchPedal = input.clutch
        ? Math.min(1, this.clutchPedal + dt * 12)
        : Math.max(0, this.clutchPedal - dt * 3.2);
      this.clutch = this.gear === 0 ? 0 : 1 - smooth(0.3, 0.68, this.clutchPedal);
    } else {
      this.clutchPedal = this.shiftTimer > 0 ? 1 : 0;
      // torque-converter style coupling: slips near idle, locks with revs
      const conv = clamp((this.rpm - s.idleRpm * 0.95) / 900, 0, 1);
      this.clutch = this.gear === 0 || this.shiftTimer > 0 ? 0 : conv;
    }

    // Shifting
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) {
        this.gear = this.pendingGear;
        this.events.push("shift");
        this.shiftCooldown = 0.45;
      }
    } else if (mode === "automatic") {
      if (this.gear >= 1 && this.shiftCooldown <= 0) {
        const up = s.idleRpm + (s.redline - s.idleRpm) * (0.42 + 0.55 * thr);
        const down = s.redline * 0.27;
        if (this.rpm > up && this.gear < 6) this.beginShift(this.gear + 1, 0.25);
        else if (this.gear > 1) {
          const lowerRpm = (this.rpm * this.ratio(this.gear - 1)) / this.ratio(this.gear);
          if (this.rpm < down) this.beginShift(this.gear - 1, 0.25);
          else if (thr > 0.85 && this.rpm < s.redline * 0.62 && lowerRpm < s.redline * 0.94)
            this.beginShift(this.gear - 1, 0.2); // kickdown
        }
      }
    } else if (mode === "semi") {
      let target: number | null = null;
      if (input.shiftUp && this.gear < 6) target = this.gear + 1;
      else if (input.shiftDown && this.gear > -1) target = this.gear - 1;
      else if (input.selectGear !== null && input.selectGear !== this.gear) target = input.selectGear;
      if (target !== null) {
        const overRev = target >= 1 && this.gear !== 0 && (this.rpm * this.ratio(target)) / (this.ratio(this.gear) || 1) > s.maxRpm;
        const badReverse = target === -1 && this.vFwd > 2;
        if (overRev || badReverse) this.events.push("deny");
        else this.beginShift(target, 0.16);
      } else if (opts.autoDownshift && this.gear > 1 && this.rpm < s.idleRpm + 400 && this.shiftCooldown <= 0) {
        this.beginShift(this.gear - 1, 0.16);
      }
    } else {
      let target: number | null = null;
      if (input.shiftUp && this.gear < 6) target = this.gear + 1;
      else if (input.shiftDown && this.gear > -1) target = this.gear - 1;
      else if (input.selectGear !== null && input.selectGear !== this.gear) target = input.selectGear;
      if (target !== null) {
        const clutchIn = this.clutchPedal > 0.6 || !this.engineOn;
        if (clutchIn || target === 0 || Math.abs(this.vFwd) < 0.3) {
          this.gear = target;
          this.events.push("shift");
        } else {
          this.events.push("grind");
        }
      }
    }

    // Stalling & starting (manual only)
    if (mode === "manual") {
      if (this.engineOn && this.rpm < 420) {
        this.engineOn = false;
        this.stalled = true;
        this.events.push("stall");
      }
      if (!this.engineOn) {
        if (this.clutchPedal > 0.7 || this.gear === 0) {
          this.starter += dt;
          if (this.starter > 0.75) {
            this.engineOn = true;
            this.stalled = false;
            this.rpm = s.idleRpm + 300;
            this.starter = 0;
            this.events.push("start");
          }
        } else {
          this.starter = 0;
        }
        // bump start
        if (this.rpm > 900 && thr > 0.2) {
          this.engineOn = true;
          this.stalled = false;
          this.events.push("start");
        }
      }
    } else {
      this.engineOn = true;
      this.stalled = false;
      this.starter = 0;
    }
  }

  private integrate(dt: number, input: RawInput, opts: SimOptions) {
    const s = this.spec;

    // ----- Engine -----
    let thr = this.engineOn ? this.throttle : 0;
    if (this.engineOn) {
      const idleThr = clamp((s.idleRpm - this.rpm) / 300, 0, 0.45);
      thr = Math.max(thr, idleThr);
    }
    if (this.shiftTimer > 0 && opts.mode !== "manual") thr *= 0.15;
    this.limiter = false;
    if (this.rpm > s.redline) {
      thr = 0;
      this.limiter = true;
    }
    const Teng = this.engineOn ? s.maxTorque * torqueCurve(this.rpm / s.redline) * thr : 0;
    const Tfric = 0.012 * this.rpm + 10;

    // ----- Drivetrain / clutch -----
    let Fdrive = 0;
    let Tcl = 0;
    const ratio = this.ratio(this.gear) * s.finalDrive;
    const coupled = this.gear !== 0 && this.clutch > 0.001;
    if (coupled && !input.handbrake) {
      const wheelRpmE = ((this.vFwd / s.wheelRadius) * ratio * 60) / TWO_PI;
      const slipRpm = this.rpm - wheelRpmE;
      const Tmax = s.maxTorque * 1.8 * this.clutch;
      Tcl = clamp(slipRpm / 120, -1, 1) * Tmax;
      const latUse = clamp(Math.abs(this.vLat) / 6, 0, 1);
      // Weight moves onto the driven rear axle under acceleration (h/L * a/g), so a hard launch
      // bites harder than a gentle one instead of using a fixed static weight share.
      const rearShare = clamp(0.52 + (CG_HEIGHT / s.wheelbase) * (this.accel / G), 0.42, 0.78);
      const Ftmax = s.grip * s.mass * G * rearShare * (1 - 0.5 * latUse);
      let F = (Tcl * ratio) / s.wheelRadius;
      if (Math.abs(F) > Ftmax) {
        this.wheelspinT += dt;
        F = Math.sign(F) * Ftmax * 0.92;
        Tcl = (F * s.wheelRadius) / ratio;
      } else {
        this.wheelspinT = Math.max(0, this.wheelspinT - dt * 2);
      }
      Fdrive = F;
    } else {
      this.wheelspinT = Math.max(0, this.wheelspinT - dt * 2);
      if (coupled && input.handbrake) {
        // rear wheels locked: clutch drags the engine toward zero
        Tcl = clamp(this.rpm / 120, 0, 1) * s.maxTorque * 1.8 * this.clutch;
      }
    }
    this.wheelspin = this.wheelspinT > 0.06;
    this.rpm += (((Teng - Tfric - Tcl) / s.engineInertia) * 60) / TWO_PI / 1 * dt;
    if (this.rpm < 0) this.rpm = 0;

    // ----- Chassis -----
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    this.vFwd = this.vx * fx + this.vz * fz;
    this.vLat = this.vx * rx + this.vz * rz;

    let F = Fdrive - s.drag * this.vFwd * Math.abs(this.vFwd);
    const slopeAlong = (this.height(this.x + fx, this.z + fz) - this.height(this.x - fx, this.z - fz)) / 2;
    F -= s.mass * G * slopeAlong;
    this.vFwd += (F / s.mass) * dt;

    // brakes + rolling resistance (decelerations that cannot reverse motion)
    let decel = (this.brake * s.brakeForce + (input.handbrake ? s.brakeForce * 0.45 : 0) + 0.014 * s.mass * G) / s.mass;
    const dv = decel * dt;
    if (Math.abs(this.vFwd) <= dv) this.vFwd = 0;
    else this.vFwd -= Math.sign(this.vFwd) * dv;

    const speed = Math.abs(this.vFwd);
    const steerTarget = (input.steer * s.maxSteer) / (1 + speed / 22);
    this.steer += (steerTarget - this.steer) * (1 - Math.exp(-9 * dt));

    this.drifting = Math.abs(this.vLat) > 3.2 || (this.wheelspin && speed > 4);
    const gripLat = input.handbrake && speed > 2 ? 1.6 : this.drifting ? s.driftGrip : s.gripLat;
    // Tyre grip turns sideways motion into forward motion instead of just deleting it; without this
    // a slide bleeds all its speed and a drift dies in a second.
    const latBefore = Math.abs(this.vLat);
    this.vLat *= Math.exp(-gripLat * dt);
    this.vFwd += (this.vFwd < 0 ? -1 : 1) * (latBefore - Math.abs(this.vLat)) * 0.6;

    let wT = (-this.vFwd * Math.tan(this.steer)) / s.wheelbase;
    if (this.drifting || (input.handbrake && speed > 2)) wT *= 1.35;
    this.yawRate += (wT - this.yawRate) * (1 - Math.exp(-(this.drifting ? 3.5 : 9) * dt));

    // rebuild world velocity in the OLD frame so the car can slide
    this.vx = fx * this.vFwd + rx * this.vLat;
    this.vz = fz * this.vFwd + rz * this.vLat;
    this.yaw += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.driftAngle = Math.atan2(this.vLat, Math.abs(this.vFwd) + 0.5);
  }

  private collide() {
    for (const c of this.colliders) {
      const px = this.x - c.x;
      const pz = this.z - c.z;
      const ox = c.hw + 1.1 - Math.abs(px);
      const oz = c.hd + 1.1 - Math.abs(pz);
      if (ox > 0 && oz > 0) {
        const impact = Math.hypot(this.vx, this.vz);
        if (ox < oz) {
          this.x += Math.sign(px || 1) * ox;
          if (Math.sign(this.vx) !== Math.sign(px)) this.vx *= -0.35;
        } else {
          this.z += Math.sign(pz || 1) * oz;
          if (Math.sign(this.vz) !== Math.sign(pz)) this.vz *= -0.35;
        }
        this.vx *= 0.8;
        this.vz *= 0.8;
        if (impact > 4) this.events.push("hit");
      }
    }
    const b = this.bound;
    if (this.x > b) {
      this.x = b;
      this.vx = -Math.abs(this.vx) * 0.3;
    } else if (this.x < -b) {
      this.x = -b;
      this.vx = Math.abs(this.vx) * 0.3;
    }
    if (this.z > b) {
      this.z = b;
      this.vz = -Math.abs(this.vz) * 0.3;
    } else if (this.z < -b) {
      this.z = -b;
      this.vz = Math.abs(this.vz) * 0.3;
    }
  }

  private updatePose() {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    this.y = this.height(this.x, this.z);
    const sa = (this.height(this.x + fx * 1.3, this.z + fz * 1.3) - this.height(this.x - fx * 1.3, this.z - fz * 1.3)) / 2.6;
    const sl = (this.height(this.x + rx * 0.9, this.z + rz * 0.9) - this.height(this.x - rx * 0.9, this.z - rz * 0.9)) / 1.8;
    this.pitch = -Math.atan(sa);
    this.roll = -Math.atan(sl);
  }

  get speedKmh() {
    return Math.abs(this.vFwd) * 3.6;
  }
}
