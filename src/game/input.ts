export type Action =
  | "throttle"
  | "brake"
  | "left"
  | "right"
  | "handbrake"
  | "clutch"
  | "shiftUp"
  | "shiftDown"
  | "camera"
  | "pause"
  | "mute"
  | "transmission"
  | "launch"
  | "gearR"
  | "gearN"
  | "gear1"
  | "gear2"
  | "gear3"
  | "gear4"
  | "gear5"
  | "gear6";

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  handbrake: ["Space"],
  clutch: ["ShiftLeft", "ShiftRight"],
  shiftUp: ["KeyE"],
  shiftDown: ["KeyQ"],
  camera: ["KeyC"],
  pause: ["Escape", "KeyP"],
  mute: ["KeyM"],
  transmission: ["KeyT"],
  launch: ["KeyL"],
  gearR: ["KeyR"],
  gearN: ["KeyN", "Digit0"],
  gear1: ["Digit1"],
  gear2: ["Digit2"],
  gear3: ["Digit3"],
  gear4: ["Digit4"],
  gear5: ["Digit5"],
  gear6: ["Digit6"],
};

export const REBINDABLE: Action[] = [
  "throttle",
  "brake",
  "left",
  "right",
  "handbrake",
  "clutch",
  "shiftUp",
  "shiftDown",
  "camera",
  "transmission",
  "launch",
  "mute",
  "gearR",
  "gearN",
  "gear1",
  "gear2",
  "gear3",
  "gear4",
  "gear5",
  "gear6",
];

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ShiftLeft: "L-Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "L-Ctrl",
    ControlRight: "R-Ctrl",
    Space: "Space",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
  };
  return map[code] ?? code;
}

class InputManager {
  private keys = new Set<string>();
  private pressedQueue: string[] = [];
  private touchHeld = new Map<Action, boolean>();
  private touchTaps: Action[] = [];
  bindings: Bindings = DEFAULT_BINDINGS;
  private attached = false;

  attach() {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.clear);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.clear);
  }

  private onDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if (!this.keys.has(e.code)) this.pressedQueue.push(e.code);
    this.keys.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
  };

  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  clear = () => {
    this.keys.clear();
    this.pressedQueue.length = 0;
    this.touchHeld.clear();
    this.touchTaps.length = 0;
  };

  held(action: Action): boolean {
    if (this.touchHeld.get(action)) return true;
    const codes = this.bindings[action];
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Consume a press edge for an action (keyboard or touch tap). */
  pressed(action: Action): boolean {
    const codes = this.bindings[action];
    let found = false;
    for (let i = this.pressedQueue.length - 1; i >= 0; i--) {
      if (codes.includes(this.pressedQueue[i])) {
        this.pressedQueue.splice(i, 1);
        found = true;
      }
    }
    const ti = this.touchTaps.indexOf(action);
    if (ti >= 0) {
      this.touchTaps.splice(ti, 1);
      found = true;
    }
    return found;
  }

  /** Drop stale press edges at the end of the frame. */
  endFrame() {
    this.pressedQueue.length = 0;
    this.touchTaps.length = 0;
  }

  setTouch(action: Action, down: boolean) {
    this.touchHeld.set(action, down);
  }

  tap(action: Action) {
    this.touchTaps.push(action);
  }
}

export const input = new InputManager();
