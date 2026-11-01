// Touch (and keyboard) controls for walking around.
//
//   Drag on the left    a thumb joystick appears where your finger lands; push
//                       it a little to stroll, further to jog.
//   Drag on the right   turn the camera around the traveler (look around).
//                       Both thumbs work at the same time ("twin-stick").
//   Quick tap           walk to that spot (or to the thing you tapped).
//   Mouse               same as touch: drag on the left half to walk, on the
//                       right half (or with the right button anywhere) to look.
//   Pinch               two fingers on the same side zoom the camera in and out.
//   Mouse wheel         zoom in and out.
//   Keyboard            WASD or arrow keys to walk, Q / R to turn the camera,
//                       + / - to zoom, E / Space / Enter for the action button.

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

/** Where on the screen a finger counts as a joystick finger instead of a camera finger. */
const STICK_SIDE = 0.5;
/** How fast Q / R turn the camera, in radians per second. */
const KEY_TURN = 1.8;

/** How fast + / - zoom: the camera distance changes by this factor per second. */
const KEY_ZOOM = 1.8;

type Role = "stick" | "look" | "pinch";
interface Finger {
  id: number;
  role: Role;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  t: number;
  dragging: boolean;
}

export class Controls {
  /** Where the stick (or keys) point, as screen right (x) and screen down (y), each -1 to 1. */
  readonly move = { x: 0, y: 0 };
  /** How far the camera fingers have dragged since the last takeLook(), in pixels. */
  private look = { x: 0, y: 0 };
  /** How much to multiply the camera distance by since the last takeZoom(): below 1 is closer. */
  private zoom = 1;
  enabled = true;

  private base = el("div", "stick-base");
  private knob = el("div", "stick-knob");
  private actionBtn = el("button", "action-btn");
  private fingers = new Map<number, Finger>();
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
    // the right mouse button turns the camera, so keep the menu out of the way
    on(surface, "contextmenu", (e) => e.preventDefault());
    on(surface, "wheel", (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      // trackpads send small steps, mouse wheels big ones; both feel fine this way
      const lines = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoom *= Math.exp(Math.max(-200, Math.min(200, lines)) * 0.0015);
    });
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

  /**
   * How far to turn the camera since last asked: x is a left-right drag and y an
   * up-down drag, in pixels. Q / R count as a steady drag. Call once a frame.
   */
  takeLook(dt: number): { x: number; y: number } {
    const out = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    if (this.enabled) {
      const turn = (this.keys.has("r") ? 1 : 0) - (this.keys.has("q") ? 1 : 0);
      // in "pixels", to match a finger: about 230 px of drag per radian
      out.x += turn * KEY_TURN * dt * 230;
    }
    return out;
  }

  /** How much to scale the camera distance since last asked (1 = no change). Call once a frame. */
  takeZoom(dt: number): number {
    let out = this.zoom;
    this.zoom = 1;
    if (this.enabled) {
      const k = this.keys;
      const dir = (k.has("-") || k.has("_") ? 1 : 0) - (k.has("=") || k.has("+") ? 1 : 0);
      out *= Math.pow(KEY_ZOOM, dir * dt);
    }
    return out;
  }

  /** True while a finger or key is steering. */
  get steering() {
    return this.move.x !== 0 || this.move.y !== 0;
  }

  /** Let go of everything (e.g. when the journal opens). */
  release() {
    this.fingers.clear();
    this.look.x = this.look.y = 0;
    this.zoom = 1;
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
    if (!this.enabled) return;
    e.preventDefault();
    const left = e.clientX < window.innerWidth * STICK_SIDE;
    const role: Role = e.pointerType === "mouse" && e.button !== 0 ? "look" : left ? "stick" : "look";
    const { clientX: x, clientY: y } = e;
    // A second finger on the same side as another one turns the pair into a pinch.
    for (const f of this.fingers.values()) {
      if (f.role === "pinch") return; // already pinching: ignore extra fingers
      if (f.role !== role) continue;
      if (e.pointerType === "mouse") return;
      if (f.role === "stick") this.stopStick();
      f.role = "pinch";
      f.dragging = true;
      this.fingers.set(e.pointerId, { id: e.pointerId, role: "pinch", x, y, lastX: x, lastY: y, t: performance.now(), dragging: true });
      return;
    }
    this.fingers.set(e.pointerId, { id: e.pointerId, role, x, y, lastX: x, lastY: y, t: performance.now(), dragging: false });
  }

  private moveTo(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    const dist = Math.hypot(dx, dy);
    if (!f.dragging && dist > TAP_SLOP) {
      f.dragging = true;
      // start turning from here, so the camera doesn't jump by the slop
      f.lastX = e.clientX;
      f.lastY = e.clientY;
      if (f.role === "stick") {
        this.base.style.left = `${f.x}px`;
        this.base.style.top = `${f.y}px`;
        this.base.classList.add("in");
      }
    }
    if (f.role === "pinch") {
      const other = [...this.fingers.values()].find((o) => o !== f && o.role === "pinch");
      const before = other ? Math.hypot(f.lastX - other.lastX, f.lastY - other.lastY) : 0;
      f.lastX = e.clientX;
      f.lastY = e.clientY;
      if (!other) return;
      const after = Math.hypot(f.lastX - other.lastX, f.lastY - other.lastY);
      // fingers spreading apart bring the camera closer
      if (before > 20 && after > 20) this.zoom *= before / after;
      return;
    }
    if (!f.dragging) return;
    if (f.role === "look") {
      this.look.x += e.clientX - f.lastX;
      this.look.y += e.clientY - f.lastY;
      f.lastX = e.clientX;
      f.lastY = e.clientY;
      return;
    }
    const k = Math.min(dist, STICK_RADIUS) / (dist || 1);
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    this.stick.x = (dx * k) / STICK_RADIUS;
    this.stick.y = (dy * k) / STICK_RADIUS;
    this.update();
  }

  private up(e: PointerEvent, cancelled = false) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    this.fingers.delete(e.pointerId);
    const wasTap = !f.dragging && performance.now() - f.t < TAP_TIME;
    if (f.role === "stick") this.stopStick();
    const leftClick = e.pointerType !== "mouse" || e.button === 0;
    if (wasTap && leftClick && !cancelled && this.enabled) this.events.onTap(f.x, f.y);
  }

  private stopStick() {
    this.stick.x = this.stick.y = 0;
    this.knob.style.transform = "";
    this.base.classList.remove("in");
    this.update();
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
