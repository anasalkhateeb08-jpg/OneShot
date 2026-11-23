import { RIFLE } from "@oneshot/shared";
import type { ClientInput, InputClass, Posture } from "@oneshot/shared";
import type { InputSource } from "./InputSource";

/** Radians of view rotation per pixel of mouse movement (adjustable in settings later). */
const DEFAULT_SENSITIVITY = 0.0022;
const PITCH_LIMIT = 1.45;
const MAX_ZERO_INDEX = RIFLE.zeroing.length - 1;

/**
 * Keyboard and mouse controls (master section 2), the first InputSource (add-on A1).
 * Uses physical key codes (KeyW, KeyA...) so it works with any keyboard language.
 *
 *   W A S D move | mouse look | right mouse scope (hold) | Shift hold breath
 *   C crouch | Z prone | X stand | mouse wheel or Q / E zeroing
 *   Click the game to capture the mouse; Esc releases it.
 */
export class KeyboardMouseInput implements InputSource {
  readonly kind: InputClass = "mouseKeyboard";
  sensitivity = DEFAULT_SENSITIVITY;

  private readonly keys = new Set<string>();
  private seq = 0;
  private yaw: number;
  private pitch = 0;
  private posture: Posture = "stand";
  private scoped = false;
  private zeroIndex: 0 | 1 | 2 | 3 = 0;
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly element: HTMLElement,
    initialYaw: number,
  ) {
    this.yaw = initialYaw;
    this.listen(window, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, "keyup", (e) => this.keys.delete((e as KeyboardEvent).code));
    this.listen(window, "blur", () => this.releaseAll());
    this.listen(document, "mousemove", (e) => this.onMouseMove(e as MouseEvent));
    this.listen(element, "mousedown", (e) => this.onMouseDown(e as MouseEvent));
    this.listen(window, "mouseup", (e) => {
      if ((e as MouseEvent).button === 2) this.scoped = false;
    });
    this.listen(element, "contextmenu", (e) => e.preventDefault());
    this.listen(element, "wheel", (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(document, "pointerlockchange", () => {
      if (!this.isLocked()) this.releaseAll();
    });
  }

  /** True while the mouse is captured by the game. */
  isLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  poll(dtSeconds: number): ClientInput {
    this.seq += 1;
    const k = this.keys;
    const moveX = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const moveZ = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    return {
      seq: this.seq,
      dt: dtSeconds,
      moveX,
      moveZ,
      yaw: this.yaw,
      pitch: this.pitch,
      posture: this.posture,
      scoped: this.scoped,
      holdBreath: k.has("ShiftLeft") || k.has("ShiftRight"),
      zeroIndex: this.zeroIndex,
    };
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.keys.clear();
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.disposers.push(() => target.removeEventListener(type, handler, options));
  }

  private releaseAll(): void {
    this.keys.clear();
    this.scoped = false;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isLocked()) return;
    this.keys.add(e.code);
    switch (e.code) {
      case "KeyC":
        this.posture = "crouch";
        break;
      case "KeyZ":
        this.posture = "prone";
        break;
      case "KeyX":
        this.posture = "stand";
        break;
      case "KeyQ":
        this.changeZero(-1);
        break;
      case "KeyE":
        this.changeZero(1);
        break;
      default:
        break;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isLocked()) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
    const twoPi = Math.PI * 2;
    if (this.yaw > Math.PI) this.yaw -= twoPi;
    if (this.yaw < -Math.PI) this.yaw += twoPi;
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.isLocked()) {
      void this.element.requestPointerLock();
      return;
    }
    if (e.button === 2) this.scoped = true;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isLocked()) return;
    e.preventDefault();
    this.changeZero(e.deltaY < 0 ? 1 : -1);
  }

  private changeZero(delta: number): void {
    const next = Math.min(MAX_ZERO_INDEX, Math.max(0, this.zeroIndex + delta));
    this.zeroIndex = next as 0 | 1 | 2 | 3;
  }
}
