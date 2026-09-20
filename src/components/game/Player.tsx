import { useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { audio } from "../../game/audio";
import { CARS } from "../../game/cars";
import { fx } from "../../game/effects";
import { input, type Action } from "../../game/input";
import { modeState, resetMode, spawnFor, updateMode } from "../../game/modes";
import { useGame } from "../../game/store";
import { telemetry } from "../../game/telemetry";
import { VehicleSim, type RawInput } from "../../game/vehicle";
import { city, terrainHeight, WORLD_BOUND } from "../../game/world";
import { CarModel, type CarParts } from "./CarModel";

/** Body lean: a damped spring per axis, driven by the car's accelerations. */
interface Suspension {
  pitch: number;
  pitchVel: number;
  roll: number;
  rollVel: number;
}
const SPRING = 90;
const DAMPING = 11;
const PITCH_PER_ACCEL = 0.0065; // rad of nose-up per m/s² of acceleration
const ROLL_PER_ACCEL = 0.0075; // rad of body roll per m/s² of lateral acceleration
const MAX_LEAN = 0.09;

const GEAR_ACTIONS: ReadonlyArray<readonly [Action, number]> = [
  ["gearR", -1],
  ["gearN", 0],
  ["gear1", 1],
  ["gear2", 2],
  ["gear3", 3],
  ["gear4", 4],
  ["gear5", 5],
  ["gear6", 6],
];

const euler = new THREE.Euler(0, 0, 0, "YXZ");

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const baseQuat = new THREE.Quaternion();
const wheelieQuat = new THREE.Quaternion();
const liftedQuat = new THREE.Quaternion();
const rearAxle = new THREE.Vector3();
const axleShift = new THREE.Vector3();

function applyPose(group: THREE.Group, sim: VehicleSim): void {
  euler.set(sim.pitch, sim.yaw, sim.roll);
  baseQuat.setFromEuler(euler);
  if (sim.wheelie < 0.001) {
    group.position.set(sim.x, sim.y, sim.z);
    group.quaternion.copy(baseQuat);
    return;
  }
  // a wheelie pivots the whole car about the rear axle: the nose rises, the rear tyres stay planted
  wheelieQuat.setFromAxisAngle(X_AXIS, -sim.wheelie);
  liftedQuat.copy(baseQuat).multiply(wheelieQuat);
  rearAxle.set(0, sim.spec.wheelRadius, -sim.spec.wheelbase / 2);
  axleShift.copy(rearAxle).applyQuaternion(baseQuat).sub(rearAxle.clone().applyQuaternion(liftedQuat));
  group.position.set(sim.x + axleShift.x, sim.y + axleShift.y, sim.z + axleShift.z);
  group.quaternion.copy(liftedQuat);
}

function fillTelemetry(sim: VehicleSim, handbrake: boolean): void {
  telemetry.speedKmh = sim.speedKmh;
  telemetry.rpm = sim.rpm;
  telemetry.gear = sim.gear;
  telemetry.clutch = sim.clutch;
  telemetry.clutchPedal = sim.clutchPedal;
  telemetry.throttle = sim.throttle;
  telemetry.brake = sim.brake;
  telemetry.engineOn = sim.engineOn;
  telemetry.stalled = sim.stalled;
  telemetry.starting = !sim.engineOn && sim.starter > 0;
  telemetry.wheelspin = sim.wheelspin;
  telemetry.drifting = sim.drifting;
  telemetry.limiter = sim.limiter;
  telemetry.shifting = sim.shiftTimer > 0;
  telemetry.handbrake = handbrake;
  telemetry.x = sim.x;
  telemetry.z = sim.z;
  telemetry.yaw = sim.yaw;
  telemetry.driftAngle = sim.driftAngle;
  telemetry.launch = sim.launchPhase;
  telemetry.wheelie = sim.wheelie;
  telemetry.launchRpm = sim.spec.launchRpm;
}

interface PlayerProps {
  carRef: RefObject<THREE.Group | null>;
}

export function Player({ carRef }: PlayerProps) {
  const carId = useGame((s) => s.settings.carId);
  const color = useGame((s) => s.settings.carColor);
  const mode = useGame((s) => s.settings.transmission);
  const restartToken = useGame((s) => s.restartToken);
  const gameMode = useGame((s) => s.mode);
  const spec = CARS[carId];

  const sim = useMemo(() => new VehicleSim(spec, terrainHeight, city.colliders, WORLD_BOUND), [spec]);
  const parts = useRef<CarParts | null>(null);
  const pedals = useRef({ fwd: 0, back: 0 });
  const susp = useRef<Suspension>({ pitch: 0, pitchVel: 0, roll: 0, rollVel: 0 });
  const onParts = useCallback((p: CarParts) => {
    parts.current = p;
  }, []);

  useLayoutEffect(() => {
    const spawn = spawnFor(gameMode);
    sim.reset(spawn.x, spawn.z, spawn.yaw, useGame.getState().settings.transmission);
    resetMode(gameMode, spec.id);
    audio.cylinders = spec.cylinders;
    pedals.current.fwd = 0;
    pedals.current.back = 0;
    susp.current = { pitch: 0, pitchVel: 0, roll: 0, rollVel: 0 };
    fx.reset();
    if (carRef.current) applyPose(carRef.current, sim);
    fillTelemetry(sim, false);
  }, [sim, spec, restartToken, gameMode, carRef]);

  useLayoutEffect(() => {
    if (mode !== "manual") {
      if (sim.gear === 0) sim.gear = 1;
      sim.pendingGear = sim.gear;
      sim.engineOn = true;
      sim.stalled = false;
      sim.starter = 0;
      if (sim.rpm < spec.idleRpm) sim.rpm = spec.idleRpm;
    }
    telemetry.mode = mode;
  }, [mode, sim, spec]);

  useFrame((_, delta) => {
    const group = carRef.current;
    if (!group) return;
    const state = useGame.getState();
    const { screen, settings } = state;

    if (input.pressed("pause")) {
      if (state.settingsOpen) state.setSettingsOpen(false);
      else if (screen === "playing") state.setScreen("paused");
      else if (screen === "paused") state.setScreen("playing");
    }
    if (screen !== "playing") {
      input.endFrame();
      return;
    }

    if (input.pressed("camera")) state.cycleCamera();
    if (input.pressed("transmission")) state.cycleTransmission();
    if (input.pressed("launch")) sim.toggleLaunch();
    if (input.pressed("mute")) state.setSetting("muted", !settings.muted);
    const shiftUp = input.pressed("shiftUp");
    const shiftDown = input.pressed("shiftDown");
    let selectGear: number | null = null;
    for (const [action, gear] of GEAR_ACTIONS) {
      if (input.pressed(action)) selectGear = gear;
    }

    const p = pedals.current;
    const wantFwd = input.held("throttle") ? 1 : 0;
    const wantBack = input.held("brake") ? 1 : 0;
    p.fwd = approach(p.fwd, wantFwd, (wantFwd > p.fwd ? 5 : 9) * delta);
    p.back = approach(p.back, wantBack, (wantBack > p.back ? 6 : 10) * delta);
    // Held on the handbrake during the countdown: the engine can rev, the car cannot move.
    const handbrake = input.held("handbrake") || modeState.countdown > 0;
    const raw: RawInput = {
      fwd: p.fwd,
      back: p.back,
      steer: (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0),
      handbrake,
      clutch: input.held("clutch"),
      shiftUp,
      shiftDown,
      selectGear,
    };

    const prevX = sim.x;
    const prevZ = sim.z;
    sim.step(delta, raw, { mode: settings.transmission, autoDownshift: settings.autoDownshift });
    updateMode(spec.id, sim, sim.events, prevX, prevZ, Math.min(delta, 0.05));

    for (const event of sim.events) {
      if (event === "shift") audio.playShift();
      else if (event === "grind") audio.playGrind();
      else if (event === "deny") audio.playDeny();
      else if (event === "stall") audio.playStall();
      else if (event === "start") audio.playStarter();
      else if (event === "hit") audio.playHit();
    }
    sim.events.length = 0;

    applyPose(group, sim);
    const wheels = parts.current;
    if (wheels) {
      const spin = sim.wheelOmegaVisual * delta;
      for (const w of wheels.allWheels) w.rotation.x += spin;
      for (const w of wheels.frontWheels) w.rotation.y = -sim.steer;
      wheels.steeringWheel.rotation.z = sim.steer * 3.2;

      // suspension: nose lifts on throttle and dives on the brakes, the body rolls out of corners
      const s = susp.current;
      const dt = Math.min(delta, 0.05);
      const targetPitch = THREE.MathUtils.clamp(-sim.accel * PITCH_PER_ACCEL, -MAX_LEAN, MAX_LEAN);
      const targetRoll = THREE.MathUtils.clamp(-sim.latAccel * ROLL_PER_ACCEL, -MAX_LEAN, MAX_LEAN);
      s.pitchVel += (SPRING * (targetPitch - s.pitch) - DAMPING * s.pitchVel) * dt;
      s.pitch += s.pitchVel * dt;
      s.rollVel += (SPRING * (targetRoll - s.roll) - DAMPING * s.rollVel) * dt;
      s.roll += s.rollVel * dt;
      wheels.body.rotation.x = s.pitch;
      wheels.body.rotation.z = s.roll;

      // where the rear tyres touch the ground, and how hard they are sliding (smoke + skid marks)
      group.updateMatrixWorld();
      fx.update(wheels.rearContact, group, sim, handbrake);
    }

    fillTelemetry(sim, handbrake);
    audio.update(telemetry, delta);
    input.endFrame();
  });

  return (
    <group ref={carRef}>
      <Suspense fallback={null}>
        <CarModel spec={spec} color={color} onParts={onParts} />
      </Suspense>
    </group>
  );
}
