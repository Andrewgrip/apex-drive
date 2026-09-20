import { Flame, Play, RotateCcw, Settings as SettingsIcon, LogOut, Timer } from "lucide-react";
import { useEffect } from "react";
import { audio } from "../../game/audio";
import { CARS, type CarId, type CarSpec } from "../../game/cars";
import type { GameMode } from "../../game/modes";
import { useGame } from "../../game/store";
import type { TransmissionMode } from "../../game/vehicle";
import { Seg } from "./SettingsPanel";
import { useT } from "./useT";

const SWATCHES = ["#ff7a1a", "#e63946", "#2fa4ff", "#2ecc71", "#f4d03f", "#a06bff", "#d9d9d9", "#1f2430"];

export function startDriving(mode: GameMode): void {
  const { settings, startMode } = useGame.getState();
  audio.cylinders = CARS[settings.carId].cylinders;
  audio.init();
  audio.resume();
  startMode(mode);
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-0.5 flex justify-between text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary shadow-neon" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
      </div>
    </div>
  );
}

function CarCard({ spec, selected, onSelect }: { spec: CarSpec; selected: boolean; onSelect: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`glass-soft flex-1 rounded-xl p-3 text-left transition ${
        selected ? "border-primary! shadow-neon" : "hover:border-primary/40!"
      }`}
    >
      <div className="mb-2 font-display text-xs tracking-wider">{t(spec.id)}</div>
      <div className="flex flex-col gap-1.5">
        <StatBar label={`${t("topSpeed")} · ${spec.stats.topSpeed}`} value={spec.stats.topSpeed / 420} />
        <StatBar label={t("accel")} value={spec.stats.accel} />
        <StatBar label={t("handling")} value={spec.stats.handling} />
        <StatBar label={t("grip")} value={spec.stats.grip} />
      </div>
    </button>
  );
}

export function MainMenu() {
  const t = useT();
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSetting);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const settingsOpen = useGame((s) => s.settingsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      if (e.code === "Enter") startDriving("freeRoam");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const pickCar = (id: CarId) => {
    set("carId", id);
    set("carColor", CARS[id].defaultColor);
  };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-8">
      <div className="pointer-events-auto flex items-start justify-between">
        <div className="animate-float-in">
          <h1 className="neon-text text-4xl font-black tracking-[0.12em] sm:text-6xl">{t("title")}</h1>
          <p className="mt-1 text-lg font-semibold text-foreground sm:text-xl [text-shadow:0_2px_14px_rgba(0,0,0,0.9)]">{t("tagline")}</p>
        </div>
        <Seg
          value={settings.lang}
          options={[
            { value: "en", label: "EN" },
            { value: "el", label: "EL" },
          ]}
          onChange={(v) => set("lang", v)}
        />
      </div>

      <div className="pointer-events-auto flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="glass animate-float-in flex w-full max-w-md flex-col gap-3 rounded-2xl p-4">
          <button type="button" className="btn-neon px-6 py-3.5 text-base" onClick={() => startDriving("freeRoam")}>
            <Play size={18} /> {t("freeRoam")}
          </button>
          <p className="-mt-1 text-center text-[0.65rem] tracking-wider text-muted-foreground">{t("freeRoamHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost flex-col px-3 py-2.5 text-[0.7rem]" onClick={() => startDriving("timeTrial")}>
              <Timer size={16} /> {t("timeTrial")}
            </button>
            <button type="button" className="btn-ghost flex-col px-3 py-2.5 text-[0.7rem]" onClick={() => startDriving("drift")}>
              <Flame size={16} /> {t("driftChallenge")}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("quickTransmission")}</span>
            <Seg<TransmissionMode>
              value={settings.transmission}
              options={[
                { value: "automatic", label: t("automatic") },
                { value: "semi", label: t("semi") },
                { value: "manual", label: "Manual" },
              ]}
              onChange={(v) => set("transmission", v)}
            />
          </div>
          <button type="button" className="btn-ghost px-4 py-2.5 text-xs" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={15} /> {t("settings")}
          </button>
          <p className="text-center text-[0.65rem] tracking-wider text-muted-foreground">{t("version")}</p>
        </div>

        <div className="glass animate-float-in w-full max-w-2xl rounded-2xl p-4">
          <h2 className="mb-3 font-display text-xs tracking-[0.2em] text-primary">{t("garage").toUpperCase()}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(CARS) as CarId[]).map((id) => (
              <CarCard key={id} spec={CARS[id]} selected={settings.carId === id} onSelect={() => pickCar(id)} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("color")}</span>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => set("carColor", c)}
                  className={`h-7 w-7 rounded-full border-2 transition ${settings.carColor === c ? "scale-110 border-foreground" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={settings.carColor}
                onChange={(e) => set("carColor", e.target.value)}
                aria-label={t("color")}
                className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PauseMenu() {
  const t = useT();
  const setScreen = useGame((s) => s.setScreen);
  const restart = useGame((s) => s.restart);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass animate-float-in flex w-[min(90vw,22rem)] flex-col gap-3 rounded-2xl p-6">
        <h2 className="neon-text mb-2 text-center text-3xl font-black tracking-[0.2em]">{t("paused")}</h2>
        <button type="button" className="btn-neon px-4 py-3 text-sm" onClick={() => setScreen("playing")}>
          <Play size={16} /> {t("resume")}
        </button>
        <button type="button" className="btn-ghost px-4 py-3 text-sm" onClick={restart}>
          <RotateCcw size={16} /> {t("restart")}
        </button>
        <button type="button" className="btn-ghost px-4 py-3 text-sm" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={16} /> {t("settings")}
        </button>
        <button type="button" className="btn-ghost px-4 py-3 text-sm" onClick={() => setScreen("menu")}>
          <LogOut size={16} /> {t("quit")}
        </button>
      </div>
    </div>
  );
}
