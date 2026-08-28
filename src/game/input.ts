const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "KeyT",
  "KeyG",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Minus",
  "Equal",
  "Escape",
]);

class Input {
  keys = new Set<string>();
  injected = new Set<string>();
  attached = false;
  panX = 0;
  panZ = 0;
  rotate = 0;
  zoom = 0;
  tilt = 0;

  has(code: string) {
    return this.keys.has(code) || this.injected.has(code);
  }

  attach() {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.onVis);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.clear);
    document.removeEventListener("visibilitychange", this.onVis);
    this.keys.clear();
  }

  private onDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    this.keys.add(e.code);
    if (GAME_CODES.has(e.code)) e.preventDefault();
  };

  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onVis = () => {
    if (document.hidden) this.keys.clear();
  };

  clear = () => {
    this.keys.clear();
  };

  setKeys(codes: string[]) {
    this.injected = new Set(codes);
  }

  sample() {
    let x = 0;
    let z = 0;
    if (this.has("KeyW") || this.has("ArrowUp")) z += 1;
    if (this.has("KeyS") || this.has("ArrowDown")) z -= 1;
    if (this.has("KeyD") || this.has("ArrowRight")) x += 1;
    if (this.has("KeyA") || this.has("ArrowLeft")) x -= 1;
    const m = Math.hypot(x, z);
    if (m > 1) {
      x /= m;
      z /= m;
    }
    this.panX = x;
    this.panZ = z;
    this.rotate = (this.has("KeyQ") ? 1 : 0) + (this.has("KeyE") ? -1 : 0);
    this.zoom = (this.has("KeyR") ? -1 : 0) + (this.has("KeyF") ? 1 : 0);
    this.tilt = (this.has("KeyT") ? 1 : 0) + (this.has("KeyG") ? -1 : 0);
  }
}

export const input = new Input();
