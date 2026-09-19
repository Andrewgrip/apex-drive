import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import type * as THREE from "three";
import { audio } from "../../game/audio";
import { input } from "../../game/input";
import { useGame, type Quality } from "../../game/store";
import { CameraRig } from "./CameraRig";
import { Gates } from "./Gates";
import { Hud } from "./Hud";
import { MainMenu, PauseMenu } from "./Menus";
import { Player } from "./Player";
import { SettingsPanel } from "./SettingsPanel";
import { TireEffects } from "./TireEffects";
import { TouchControls } from "./TouchControls";
import { useT } from "./useT";
import { World } from "./World";

const DPR: Record<Quality, [number, number]> = {
  low: [1, 1],
  medium: [1, 1.5],
  high: [1, 2],
};

function LoadingOverlay() {
  const t = useT();
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
      <div className="neon-text font-display text-2xl tracking-[0.3em]">{t("title")}</div>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-secondary">
        <div className="h-full bg-primary shadow-neon transition-[width]" style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <div className="text-sm text-muted-foreground">{t("loading")}</div>
    </div>
  );
}

export function ApexDrive() {
  const carRef = useRef<THREE.Group>(null);
  const screen = useGame((s) => s.screen);
  const settingsOpen = useGame((s) => s.settingsOpen);
  const quality = useGame((s) => s.settings.quality);
  const volume = useGame((s) => s.settings.volume);
  const muted = useGame((s) => s.settings.muted);
  const bindings = useGame((s) => s.settings.bindings);
  const lang = useGame((s) => s.settings.lang);

  useEffect(() => {
    input.attach();
    return () => input.detach();
  }, []);

  useEffect(() => {
    input.bindings = bindings;
  }, [bindings]);

  useEffect(() => {
    audio.setVolume(volume);
    audio.setMuted(muted || screen !== "playing");
  }, [volume, muted, screen]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const autoPause = () => {
      const s = useGame.getState();
      if (s.screen === "playing") s.setScreen("paused");
    };
    window.addEventListener("blur", autoPause);
    return () => window.removeEventListener("blur", autoPause);
  }, []);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-background">
      <Canvas
        shadows={quality === "low" ? false : "percentage"}
        dpr={DPR[quality]}
        camera={{ fov: 70, near: 0.1, far: 900, position: [0, 4, -10] }}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <World />
          <Gates />
          <Player carRef={carRef} />
          <TireEffects />
          <CameraRig carRef={carRef} menu={screen === "menu"} />
        </Suspense>
      </Canvas>

      {screen === "menu" && <MainMenu />}
      {screen !== "menu" && <Hud />}
      {screen === "playing" && <TouchControls />}
      {screen === "paused" && <PauseMenu />}
      {settingsOpen && <SettingsPanel />}
      <LoadingOverlay />
    </div>
  );
}
