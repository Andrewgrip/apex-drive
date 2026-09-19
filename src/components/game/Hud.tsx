import { Camera, Pause, Settings as SettingsIcon, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CARS, type CarSpec } from "../../game/cars";
import { keyLabel, type Action } from "../../game/input";
import type { StringKey } from "../../game/i18n";
import { useGame } from "../../game/store";
import { telemetry, type Telemetry } from "../../game/telemetry";
import { CITY_HALF, connectorSamples, trackSamples, WORLD_HALF } from "../../game/world";
import { useT } from "./useT";

function useTelemetry(hz: number): Telemetry {
  const [snap, setSnap] = useState<Telemetry>(() => ({ ...telemetry }));
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 1000 / hz) {
        last = now;
        setSnap({ ...telemetry });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hz]);
  return snap;
}

// ---------- Analog gauge ----------
const SWEEP = 270;
const polar = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
};
const arcPath = (c: number, r: number, from: number, to: number) => {
  const p1 = polar(c, r, from);
  const p2 = polar(c, r, to);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
};

interface GaugeProps {
  value: number;
  max: number;
  step: number;
  labelDivisor?: number;
  redFrom?: number;
  unit: string;
  children?: ReactNode;
}

function Gauge({ value, max, step, labelDivisor = 1, redFrom, unit, children }: GaugeProps) {
  const c = 100;
  const angle = (v: number) => -SWEEP / 2 + (SWEEP * Math.min(Math.max(v, 0), max)) / max;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 0.001; v += step) ticks.push(v);
  const needle = angle(value);
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]">
      <circle cx={c} cy={c} r={96} fill="color-mix(in oklab, var(--card) 70%, transparent)" stroke="var(--border)" />
      <path d={arcPath(c, 84, angle(0), angle(max))} fill="none" stroke="var(--gauge-track)" strokeWidth={8} strokeLinecap="round" />
      {redFrom !== undefined && (
        <path d={arcPath(c, 84, angle(redFrom), angle(max))} fill="none" stroke="var(--destructive)" strokeWidth={8} strokeLinecap="round" />
      )}
      <path
        d={arcPath(c, 84, angle(0), Math.max(angle(0) + 0.01, needle))}
        fill="none"
        stroke={redFrom !== undefined && value >= redFrom ? "var(--destructive)" : "var(--primary)"}
        strokeWidth={8}
        strokeLinecap="round"
        opacity={0.9}
      />
      {ticks.map((v) => {
        const a = angle(v);
        const p1 = polar(c, 72, a);
        const p2 = polar(c, 78, a);
        const pl = polar(c, 60, a);
        return (
          <g key={v}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--gauge-tick)" strokeWidth={1.6} />
            <text x={pl.x} y={pl.y} fill="var(--gauge-tick)" fontSize={9} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-display)">
              {Math.round(v / labelDivisor)}
            </text>
          </g>
        );
      })}
      <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "100px 100px", transition: "transform 90ms linear" }}>
        <line x1={c} y1={c + 12} x2={c} y2={c - 78} stroke="var(--primary-glow)" strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={c} cy={c} r={7} fill="var(--card)" stroke="var(--primary)" strokeWidth={2} />
      <text x={c} y={c + 78} fill="var(--muted-foreground)" fontSize={9} textAnchor="middle" fontFamily="var(--font-display)" letterSpacing="0.15em">
        {unit}
      </text>
      {children}
    </svg>
  );
}

// ---------- Minimap ----------
const MAP_SIZE = 156;
const MAP_SCALE = MAP_SIZE / 260;

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    let raf = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
      ctx.save();
      ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
      ctx.rotate(telemetry.yaw - Math.PI);
      ctx.scale(MAP_SCALE, MAP_SCALE);
      ctx.translate(-telemetry.x, -telemetry.z);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(-WORLD_HALF, -WORLD_HALF, WORLD_HALF * 2, WORLD_HALF * 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(-CITY_HALF, -CITY_HALF, CITY_HALF * 2, CITY_HALF * 2);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,138,50,0.95)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      trackSamples.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.z) : ctx.lineTo(s.x, s.z)));
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 9;
      ctx.beginPath();
      connectorSamples.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.z) : ctx.lineTo(s.x, s.z)));
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MAP_SIZE / 2, MAP_SIZE / 2 - 8);
      ctx.lineTo(MAP_SIZE / 2 + 5.5, MAP_SIZE / 2 + 6);
      ctx.lineTo(MAP_SIZE / 2, MAP_SIZE / 2 + 3);
      ctx.lineTo(MAP_SIZE / 2 - 5.5, MAP_SIZE / 2 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ width: MAP_SIZE, height: MAP_SIZE }}
      className="glass rounded-full border-2 border-primary/40 shadow-neon"
      aria-label="Mini-map"
    />
  );
}

// ---------- Controls hint ----------
function keyFor(bindings: Record<Action, string[]>, a: Action): string {
  return (bindings[a] ?? []).slice(0, 2).map(keyLabel).join(" / ");
}

function Chip({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <kbd className="rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 font-display text-[0.65rem] text-foreground">{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}

function ControlsHint({ mode }: { mode: "automatic" | "semi" | "manual" }) {
  const t = useT();
  const bindings = useGame((s) => s.settings.bindings);
  return (
    <div className="glass-soft hidden rounded-xl p-3 md:block">
      <div className="mb-2 font-display text-[0.65rem] tracking-[0.2em] text-primary">{t("controlsTitle").toUpperCase()}</div>
      <div className="flex flex-col gap-1.5">
        <Chip keys={`${keyFor(bindings, "throttle")} · ${keyFor(bindings, "brake")}`} label={t("hintDrive")} />
        <Chip keys={`${keyFor(bindings, "left")} · ${keyFor(bindings, "right")}`} label={t("hintSteer")} />
        <Chip keys={keyFor(bindings, "handbrake")} label={t("hintHandbrake")} />
        {mode !== "automatic" && <Chip keys={`${keyFor(bindings, "shiftDown")} · ${keyFor(bindings, "shiftUp")}`} label={t("hintShift")} />}
        {mode === "manual" && <Chip keys={keyFor(bindings, "clutch")} label={t("hintClutch")} />}
        {mode !== "automatic" && <Chip keys={`${keyFor(bindings, "gearR")} · ${keyFor(bindings, "gearN")} · 1-6`} label={t("hintGears")} />}
        <Chip keys={keyFor(bindings, "camera")} label={t("hintCamera")} />
        <Chip keys={keyFor(bindings, "transmission")} label={t("hintTransmission")} />
        <Chip keys={bindings.pause.slice(0, 1).map(keyLabel).join("")} label={t("hintPause")} />
      </div>
    </div>
  );
}

// ---------- HUD ----------
function gearLabel(gear: number, t: (k: StringKey) => string): string {
  if (gear < 0) return t("reverse");
  if (gear === 0) return t("neutral");
  return String(gear);
}

function speedMax(spec: CarSpec): number {
  return Math.ceil(spec.stats.topSpeed / 40) * 40 + 40;
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="glass flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:border-primary/60 hover:text-primary"
    >
      {children}
    </button>
  );
}

export function Hud() {
  const t = useT();
  const tel = useTelemetry(30);
  const settings = useGame((s) => s.settings);
  const setScreen = useGame((s) => s.setScreen);
  const setSetting = useGame((s) => s.setSetting);
  const cycleCamera = useGame((s) => s.cycleCamera);
  const setSettingsOpen = useGame((s) => s.setSettingsOpen);
  const spec = CARS[settings.carId];
  const rpmMax = Math.ceil(spec.maxRpm / 1000) * 1000;
  const manual = settings.transmission === "manual";
  const speedGaugeMax = speedMax(spec);
  const modeLabel = t(settings.transmission);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-4 top-4 flex flex-col gap-3">
        <div className="glass-soft rounded-xl px-3 py-2">
          <div className="font-display text-[0.6rem] tracking-[0.2em] text-muted-foreground">{t("mode").toUpperCase()}</div>
          <div className="font-display text-sm text-primary">{modeLabel}</div>
        </div>
        <ControlsHint mode={settings.transmission} />
      </div>

      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-3">
        <Minimap />
        <div className="flex gap-2">
          <IconButton onClick={cycleCamera} label={t("camera")}>
            <Camera size={18} />
          </IconButton>
          <IconButton onClick={() => setSetting("muted", !settings.muted)} label={t("mute")}>
            {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          <IconButton onClick={() => setSettingsOpen(true)} label={t("settings")}>
            <SettingsIcon size={18} />
          </IconButton>
          <IconButton onClick={() => setScreen("paused")} label={t("paused")}>
            <Pause size={18} />
          </IconButton>
        </div>
      </div>

      <div className="absolute left-1/2 top-6 flex -translate-x-1/2 flex-col items-center gap-2">
        {tel.stalled && (
          <div className="animate-shake rounded-xl border border-destructive/60 bg-destructive/25 px-5 py-2 text-center backdrop-blur">
            <div className="font-display text-lg tracking-widest text-destructive-foreground">{t("stalled")}</div>
            <div className="text-sm text-muted-foreground">{t("stalledHint")}</div>
          </div>
        )}
        {!tel.stalled && tel.wheelspin && <div className="font-display text-sm tracking-widest text-warning animate-pulse-glow">{t("wheelspin")}</div>}
        {!tel.stalled && !tel.wheelspin && tel.drifting && <div className="font-display text-sm tracking-widest text-primary animate-pulse-glow">{t("drift")}</div>}
      </div>

      <div className="absolute inset-x-0 bottom-3 flex items-end justify-center gap-3 px-2 sm:gap-6">
        <div className="aspect-square w-[clamp(120px,21vw,220px)]">
          <Gauge value={tel.rpm} max={rpmMax} step={1000} labelDivisor={1000} redFrom={spec.redline} unit={`x1000 ${t("rpm")}`}>
            <text x={100} y={146} fill={tel.limiter ? "var(--destructive)" : "var(--foreground)"} fontSize={44} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={900}>
              {gearLabel(tel.gear, t)}
            </text>
          </Gauge>
        </div>

        {manual && (
          <div className="mb-2 flex h-[clamp(90px,14vw,150px)] flex-col items-center gap-1">
            <div className="relative w-4 flex-1 overflow-hidden rounded-full border border-border bg-secondary/60">
              <div
                className="absolute inset-x-0 bottom-0 rounded-full bg-primary shadow-neon transition-[height] duration-75"
                style={{ height: `${Math.round(tel.clutchPedal * 100)}%` }}
              />
            </div>
            <div className="font-display text-[0.55rem] tracking-[0.15em] text-muted-foreground">{t("clutch").slice(0, 3).toUpperCase()}</div>
          </div>
        )}

        <div className="aspect-square w-[clamp(120px,21vw,220px)]">
          <Gauge value={tel.speedKmh} max={speedGaugeMax} step={40} unit={t("kmh").toUpperCase()}>
            <text x={100} y={144} fill="var(--foreground)" fontSize={34} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={700}>
              {Math.round(tel.speedKmh)}
            </text>
          </Gauge>
        </div>
      </div>
    </div>
  );
}
