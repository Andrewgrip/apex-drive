import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { audio } from "../../game/audio";
import { CARS } from "../../game/cars";
import { input, type Action } from "../../game/input";
import { modeState, resetMode, spawnFor, updateMode } from "../../game/modes";
import { useGame } from "../../game/store";
import { telemetry } from "../../game/telemetry";
import { VehicleSim, type RawInput } from "../../game/vehicle";
import { city, terrainHeight, WORLD_BOUND } from "../../game/world";
import { CarModel, type CarParts } from "./CarModel";

for (const car of Object.values(CARS)) useGLTF.preload(car.model);

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

function applyPose(group: THREE.Group, sim: VehicleSim): void {
  group.position.set(sim.x, sim.y, sim.z);
  euler.set(sim.pitch, sim.yaw, sim.roll);
  group.quaternion.setFromEuler(euler);
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
    }

    fillTelemetry(sim, handbrake);
    audio.update(telemetry, delta);
    input.endFrame();
  });

  return (
    <group ref={carRef}>
      <Suspense fallback={null}>
        <CarModel url={spec.model} scale={spec.scale} color={color} onParts={onParts} />
      </Suspense>
    </group>
  );
}
