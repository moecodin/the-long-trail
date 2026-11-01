// Touch (and keyboard) controls for walking around.
//
//   Drag anywhere   a thumb joystick appears where your finger lands; push it
//                   a little to stroll, further to jog.
//   Quick tap       walk to that spot (or to the thing you tapped).
//   Keyboard        WASD or arrow keys to walk, E / Space / Enter for the
//                   action button. Handy when testing on a computer.

import { el } from "../ui/dom";

/** How far (in screen pixels) the joystick knob can travel. */
const STICK_RADIUS = 56;
/** A touch that moves less than this and lifts quickly counts as a tap. */
const TAP_SLOP = 12;
const TAP_TIME = 350;

export interface ControlEvents {
  /** A quick tap at these screen coordinates. */
  onTap(x: number, y: number): void;
  /** The action button (or E / Space / Enter) was pressed. */
  onAction(): void;
}

export class Controls {
  /** Where the stick (or keys) point, as screen right (x) and screen down (y), each -1 to 1. */
  readonly move = { x: 0, y: 0 };
  enabled = true;

  private base = el("div", "stick-base");
  private knob = el("div", "stick-knob");
  private actionBtn = el("button", "action-btn");
  private pointer: { id: number; x: number; y: number; t: number; dragging: boolean } | null = null;
  private stick = { x: 0, y: 0 };
  private keys = new Set<string>();
  private cleanup: (() => void)[] = [];

  constructor(
    private surface: HTMLElement,
    private events: ControlEvents,
  ) {
    this.base.appendChild(this.knob);
    document.body.append(this.base, this.actionBtn);
    this.actionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.enabled) this.events.onAction();
    });
    this.actionBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

    const on = <K extends keyof WindowEventMap>(target: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener, { passive: false });
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    surface.classList.add("walk-surface");
    on(surface, "pointerdown", (e) => this.down(e));
    on(window, "pointermove", (e) => this.moveTo(e));
    on(window, "pointerup", (e) => this.up(e));
    on(window, "pointercancel", (e) => this.up(e, true));
    on(window, "keydown", (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (["e", " ", "enter"].includes(k)) {
        if (!e.repeat && this.actionBtn.classList.contains("in")) this.events.onAction();
        e.preventDefault();
        return;
      }
      this.keys.add(k);
      this.update();
    });
    on(window, "keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
      this.update();
    });
    on(window, "blur", () => {
      this.keys.clear();
      this.release();
    });
  }

  /** Show the action button with this label, or hide it (null). */
  setAction(label: string | null) {
    if (label) this.actionBtn.textContent = label;
    this.actionBtn.classList.toggle("in", !!label && this.enabled);
  }

  /** True while a finger or key is steering. */
  get steering() {
    return this.move.x !== 0 || this.move.y !== 0;
  }

  /** Let go of everything (e.g. when the journal opens). */
  release() {
    this.pointer = null;
    this.stick.x = this.stick.y = 0;
    this.base.classList.remove("in");
    this.update();
  }

  dispose() {
    for (const c of this.cleanup) c();
    this.surface.classList.remove("walk-surface");
    this.base.remove();
    this.actionBtn.remove();
  }

  private down(e: PointerEvent) {
    if (!this.enabled || this.pointer) return;
    e.preventDefault();
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dragging: false };
  }

  private moveTo(e: PointerEvent) {
    const p = this.pointer;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    const dist = Math.hypot(dx, dy);
    if (!p.dragging && dist > TAP_SLOP) {
      p.dragging = true;
      this.base.style.left = `${p.x}px`;
      this.base.style.top = `${p.y}px`;
      this.base.classList.add("in");
    }
    if (!p.dragging) return;
    const k = Math.min(dist, STICK_RADIUS) / (dist || 1);
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.stick.x = (dx * k) / STICK_RADIUS;
    this.stick.y = (dy * k) / STICK_RADIUS;
    this.update();
  }

  private up(e: PointerEvent, cancelled = false) {
    const p = this.pointer;
    if (!p || e.pointerId !== p.id) return;
    const wasTap = !p.dragging && performance.now() - p.t < TAP_TIME;
    this.release();
    if (wasTap && !cancelled && this.enabled) this.events.onTap(p.x, p.y);
  }

  private update() {
    const k = this.keys;
    let x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    let y = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    if (x || y) {
      // keys walk at a steady stroll; hold Shift to jog
      const len = Math.hypot(x, y);
      const speed = k.has("shift") ? 1 : 0.55;
      x = (x / len) * speed;
      y = (y / len) * speed;
    } else {
      x = this.stick.x;
      y = this.stick.y;
    }
    if (!this.enabled) x = y = 0;
    this.move.x = x;
    this.move.y = y;
  }
}
