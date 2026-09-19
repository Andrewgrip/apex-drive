import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CarId } from "./cars";
import { DEFAULT_BINDINGS, type Action, type Bindings } from "./input";
import type { Lang } from "./i18n";
import type { GameMode } from "./modes";
import type { TransmissionMode } from "./vehicle";

export type CameraMode = "chase" | "hood" | "cockpit";
export type Quality = "low" | "medium" | "high";
export type Screen = "menu" | "playing" | "paused";

export interface Settings {
  transmission: TransmissionMode;
  autoDownshift: boolean;
  camera: CameraMode;
  fov: number;
  volume: number;
  muted: boolean;
  quality: Quality;
  lang: Lang;
  dayCycle: boolean;
  touchControls: "auto" | "on" | "off";
  bindings: Bindings;
  carId: CarId;
  carColor: string;
}

const defaultSettings: Settings = {
  transmission: "automatic",
  autoDownshift: true,
  camera: "chase",
  fov: 70,
  volume: 0.7,
  muted: false,
  quality: "medium",
  lang: "en",
  dayCycle: true,
  touchControls: "auto",
  bindings: DEFAULT_BINDINGS,
  carId: "hatchback",
  carColor: "#ff7a1a",
};

interface GameState {
  screen: Screen;
  mode: GameMode;
  settingsOpen: boolean;
  restartToken: number;
  settings: Settings;
  setScreen: (s: Screen) => void;
  startMode: (mode: GameMode) => void;
  setSettingsOpen: (open: boolean) => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setBinding: (action: Action, code: string) => void;
  resetBindings: () => void;
  restart: () => void;
  cycleCamera: () => void;
  cycleTransmission: () => void;
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      screen: "menu",
      mode: "freeRoam",
      settingsOpen: false,
      restartToken: 0,
      settings: defaultSettings,
      setScreen: (screen) => set({ screen }),
      startMode: (mode) => set({ mode, restartToken: get().restartToken + 1, screen: "playing", settingsOpen: false }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setSetting: (key, value) => set({ settings: { ...get().settings, [key]: value } }),
      setBinding: (action, code) => {
        const b = { ...get().settings.bindings };
        // remove the code from any other action's primary slot
        for (const k of Object.keys(b) as Action[]) {
          if (k !== action && b[k].includes(code)) b[k] = b[k].filter((c) => c !== code);
        }
        b[action] = [code, ...b[action].slice(1)];
        set({ settings: { ...get().settings, bindings: b } });
      },
      resetBindings: () => set({ settings: { ...get().settings, bindings: DEFAULT_BINDINGS } }),
      restart: () => set({ restartToken: get().restartToken + 1, screen: "playing", settingsOpen: false }),
      cycleCamera: () => {
        const order: CameraMode[] = ["chase", "hood", "cockpit"];
        const cur = get().settings.camera;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        set({ settings: { ...get().settings, camera: next } });
      },
      cycleTransmission: () => {
        const order: TransmissionMode[] = ["automatic", "semi", "manual"];
        const cur = get().settings.transmission;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        set({ settings: { ...get().settings, transmission: next } });
      },
    }),
    {
      name: "apex-drive-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted as { settings?: Partial<Settings> } | undefined)?.settings ?? {};
        return {
          ...current,
          settings: {
            ...current.settings,
            ...p,
            bindings: { ...DEFAULT_BINDINGS, ...(p.bindings ?? {}) },
          },
        };
      },
    },
  ),
);
