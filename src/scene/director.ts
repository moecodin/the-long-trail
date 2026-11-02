// A tiny "film director" for scripted scenes. It keeps its own clock, which
// stops while the journal or satchel is open, so the intro pauses and picks up
// right where it was. Skipping makes every pending wait throw Skip, which
// ends the scene straight away.

import * as THREE from "three";

export class Skip extends Error {}

interface Waiter {
  until: number;
  resolve: () => void;
  reject: (e: unknown) => void;
}

interface Tween {
  start: number;
  duration: number;
  step: (t: number) => void;
  resolve: () => void;
  reject: (e: unknown) => void;
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Director {
  time = 0;
  paused = false;
  private waiters: Waiter[] = [];
  private tweens: Tween[] = [];
  private skipping = false;

  /** Advance the clock. Called once per frame. */
  update(dt: number): void {
    if (this.paused) return;
    this.time += dt;
    for (const tw of [...this.tweens]) {
      const t = Math.min(1, (this.time - tw.start) / tw.duration);
      tw.step(t);
      if (t >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.resolve();
      }
    }
    for (const w of [...this.waiters]) {
      if (this.time >= w.until) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  }

  wait(seconds: number): Promise<void> {
    if (this.skipping) return Promise.reject(new Skip());
    return new Promise((resolve, reject) => this.waiters.push({ until: this.time + seconds, resolve, reject }));
  }

  /** Run step(t) every frame with t going 0 to 1 (eased) over the duration. */
  tween(duration: number, step: (t: number) => void, easing = ease): Promise<void> {
    if (this.skipping) return Promise.reject(new Skip());
    return new Promise((resolve, reject) =>
      this.tweens.push({ start: this.time, duration: Math.max(0.001, duration), step: (t) => step(easing(t)), resolve, reject }),
    );
  }

  /** Glide the camera to a new spot while looking at a target. */
  moveCamera(camera: THREE.PerspectiveCamera, look: THREE.Vector3, toPos: THREE.Vector3, toLook: THREE.Vector3, duration: number) {
    const fromPos = camera.position.clone();
    const fromLook = look.clone();
    return this.tween(duration, (t) => {
      camera.position.lerpVectors(fromPos, toPos, t);
      look.lerpVectors(fromLook, toLook, t);
      camera.lookAt(look);
    });
  }

  /** End whatever scene is running. */
  skip(): void {
    this.skipping = true;
    for (const w of this.waiters.splice(0)) w.reject(new Skip());
    for (const tw of this.tweens.splice(0)) tw.reject(new Skip());
  }

  /** Ready for the next scene after a skip. */
  reset(): void {
    this.skipping = false;
  }
}
