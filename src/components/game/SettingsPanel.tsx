import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { StringKey } from "../../game/i18n";
import { keyLabel, REBINDABLE, type Action } from "../../game/input";
import { useGame, type CameraMode, type Quality } from "../../game/store";
import type { TransmissionMode } from "../../game/vehicle";
import { useT } from "./useT";

const ACTION_LABEL: Record<Action, StringKey> = {
  throttle: "throttle",
  brake: "brake",
  left: "left",
  right: "right",
  handbrake: "handbrake",
  clutch: "clutch",
  shiftUp: "shiftUp",
  shiftDown: "shiftDown",
  camera: "cameraKey",
  pause: "pauseKey",
  mute: "muteKey",
  transmission: "transmissionKey",
  launch: "launchKey",
  gearR: "gearR",
  gearN: "gearN",
  gear1: "gear1",
  gear2: "gear2",
  gear3: "gear3",
  gear4: "gear4",
  gear5: "gear5",
  gear6: "gear6",
};

interface SegProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

export function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" data-active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full border transition ${on ? "border-primary bg-primary shadow-neon" : "border-border bg-secondary"}`}
    >
      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-foreground transition-all ${on ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

function KeyBindings() {
  const t = useT();
  const bindings = useGame((s) => s.settings.bindings);
  const setBinding = useGame((s) => s.setBinding);
  const resetBindings = useGame((s) => s.resetBindings);
  const [listening, setListening] = useState<Action | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape") setBinding(listening, e.code);
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, setBinding]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-xs tracking-[0.2em] text-primary">{t("keyBindings").toUpperCase()}</h3>
        <button type="button" className="btn-ghost px-3 py-1 text-[0.65rem]" onClick={resetBindings}>
          {t("reset")}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {REBINDABLE.map((action) => (
          <div key={action} className="flex items-center justify-between border-b border-border/50 py-1.5">
            <span className="text-sm text-muted-foreground">{t(ACTION_LABEL[action])}</span>
            <button
              type="button"
              onClick={() => setListening(action)}
              className={`min-w-20 rounded-md border px-2 py-1 font-display text-[0.65rem] ${
                listening === action ? "border-primary bg-primary/20 text-primary" : "border-border bg-secondary/60"
              }`}
            >
              {listening === action ? t("pressKey") : (bindings[action] ?? []).slice(0, 1).map(keyLabel).join("")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const t = useT();
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSetting);
  const close = () => useGame.getState().setSettingsOpen(false);

  const transmissions: ReadonlyArray<{ value: TransmissionMode; label: string }> = [
    { value: "automatic", label: t("automatic") },
    { value: "semi", label: t("semi") },
    { value: "manual", label: t("manual") },
  ];
  const cameras: ReadonlyArray<{ value: CameraMode; label: string }> = [
    { value: "chase", label: t("chase") },
    { value: "hood", label: t("hood") },
    { value: "cockpit", label: t("cockpit") },
  ];
  const qualities: ReadonlyArray<{ value: Quality; label: string }> = [
    { value: "low", label: t("low") },
    { value: "medium", label: t("medium") },
    { value: "high", label: t("high") },
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
      <div className="glass animate-float-in flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display text-lg tracking-[0.15em] text-primary">{t("settings").toUpperCase()}</h2>
          <button type="button" onClick={close} aria-label={t("back")} className="rounded-full p-1.5 hover:bg-foreground/10">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <Row label={t("transmission")}>
            <Seg value={settings.transmission} options={transmissions} onChange={(v) => set("transmission", v)} />
          </Row>
          <Row label={t("autoDownshift")}>
            <Toggle on={settings.autoDownshift} onChange={(v) => set("autoDownshift", v)} label={t("autoDownshift")} />
          </Row>
          <Row label={t("camera")}>
            <Seg value={settings.camera} options={cameras} onChange={(v) => set("camera", v)} />
          </Row>
          <Row label={`${t("fov")} · ${settings.fov}°`}>
            <input type="range" min={50} max={110} step={1} value={settings.fov} onChange={(e) => set("fov", Number(e.target.value))} className="w-48" />
          </Row>
          <Row label={`${t("volume")} · ${Math.round(settings.volume * 100)}%`}>
            <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => set("volume", Number(e.target.value))} className="w-48" />
          </Row>
          <Row label={t("mute")}>
            <Toggle on={settings.muted} onChange={(v) => set("muted", v)} label={t("mute")} />
          </Row>
          <Row label={t("quality")}>
            <Seg value={settings.quality} options={qualities} onChange={(v) => set("quality", v)} />
          </Row>
          <Row label={t("dayCycle")}>
            <Toggle on={settings.dayCycle} onChange={(v) => set("dayCycle", v)} label={t("dayCycle")} />
          </Row>
          <Row label={t("touchControls")}>
            <Seg
              value={settings.touchControls}
              options={[
                { value: "auto", label: t("auto") },
                { value: "on", label: t("on") },
                { value: "off", label: t("off") },
              ]}
              onChange={(v) => set("touchControls", v)}
            />
          </Row>
          <Row label={t("language")}>
            <Seg
              value={settings.lang}
              options={[
                { value: "en", label: "English" },
                { value: "el", label: "Ελληνικά" },
              ]}
              onChange={(v) => set("lang", v)}
            />
          </Row>
          <div className="mt-3 border-t border-border pt-4">
            <KeyBindings />
          </div>
        </div>
      </div>
    </div>
  );
}
