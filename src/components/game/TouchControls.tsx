import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { input, type Action } from "../../game/input";
import { useGame } from "../../game/store";
import { useT } from "./useT";

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

interface HoldProps {
  action: Action;
  className?: string;
  label: string;
  children: ReactNode;
}

function HoldButton({ action, className = "", label, children }: HoldProps) {
  const [pressed, setPressed] = useState(false);
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    input.setTouch(action, true);
    setPressed(true);
  };
  const up = () => {
    input.setTouch(action, false);
    setPressed(false);
  };
  return (
    <button
      type="button"
      aria-label={label}
      data-pressed={pressed}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-btn ${className}`}
    >
      {children}
    </button>
  );
}

function TapButton({ action, className = "", label, children }: HoldProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        input.tap(action);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`touch-btn ${className}`}
    >
      {children}
    </button>
  );
}

export function TouchControls() {
  const t = useT();
  const pref = useGame((s) => s.settings.touchControls);
  const mode = useGame((s) => s.settings.transmission);
  const coarse = useCoarsePointer();
  const visible = pref === "on" || (pref === "auto" && coarse);
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-3 pb-6">
      <div className="pointer-events-auto flex gap-3">
        <HoldButton action="left" label={t("left")} className="h-20 w-20">
          <ArrowLeft size={30} />
        </HoldButton>
        <HoldButton action="right" label={t("right")} className="h-20 w-20">
          <ArrowRight size={30} />
        </HoldButton>
      </div>

      <div className="pointer-events-auto mb-24 flex flex-col items-center gap-2">
        <TapButton action="camera" label={t("cameraKey")} className="h-11 w-11">
          <Camera size={18} />
        </TapButton>
        <HoldButton action="handbrake" label={t("handbrake")} className="h-12 w-16 text-[0.6rem]">
          HB
        </HoldButton>
        {mode === "manual" && (
          <HoldButton action="clutch" label={t("clutch")} className="h-14 w-16 text-xs">
            CLU
          </HoldButton>
        )}
        {mode !== "manual" && (
          <TapButton action="launch" label={t("launchKey")} className="h-11 w-16 text-[0.6rem]">
            LC
          </TapButton>
        )}
        {mode !== "automatic" && (
          <div className="flex gap-2">
            <TapButton action="shiftDown" label={t("shiftDown")} className="h-12 w-12">
              <ChevronDown size={22} />
            </TapButton>
            <TapButton action="shiftUp" label={t("shiftUp")} className="h-12 w-12">
              <ChevronUp size={22} />
            </TapButton>
          </div>
        )}
      </div>

      <div className="pointer-events-auto flex flex-col gap-3">
        <HoldButton action="throttle" label={t("throttle")} className="h-24 w-20">
          <ArrowUp size={30} />
        </HoldButton>
        <HoldButton action="brake" label={t("brake")} className="h-20 w-20">
          <ArrowDown size={30} />
        </HoldButton>
      </div>
    </div>
  );
}
