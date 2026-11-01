// The satchel journal button. It sits in the corner of every screen, even the
// intro, because logging always comes first. For now it opens a placeholder
// page; the real journal (meals, water, weigh-ins) arrives in Milestone 2.

import { el, escapeHtml } from "./dom";

const SATCHEL_ICON = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M20 22 Q20 8 32 8 Q44 8 44 22" fill="none" stroke="#5a3a22" stroke-width="4" stroke-linecap="round"/>
  <rect x="10" y="20" width="44" height="34" rx="8" fill="#a8743c" stroke="#5a3a22" stroke-width="3"/>
  <path d="M10 28 Q32 40 54 28 L54 22 Q54 20 52 20 L12 20 Q10 20 10 22 Z" fill="#8a5a2c" stroke="#5a3a22" stroke-width="3" stroke-linejoin="round"/>
  <rect x="28" y="30" width="8" height="9" rx="2" fill="#e3c06a" stroke="#5a3a22" stroke-width="2"/>
  <path d="M18 46 h10 M18 50 h16" stroke="#e8d2a8" stroke-width="2" stroke-linecap="round"/>
</svg>`;

const SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

export interface SatchelOptions {
  onOpen(): void;
  onClose(): void;
  onToggleSound(): boolean;
  muted: boolean;
  onReplayIntro(): void;
  /** Go back to the mirror to pick a different traveler or name. */
  onChangeTraveler(): void;
  travelerName(): string | null;
}

export function mountSatchel(opts: SatchelOptions): void {
  const bar = el("div", "corner-bar");
  const sound = el("button", "round-btn sound-btn", opts.muted ? SOUND_OFF : SOUND_ON);
  sound.setAttribute("aria-label", "Sound on or off");
  const satchel = el("button", "satchel-btn", SATCHEL_ICON);
  satchel.setAttribute("aria-label", "Open your satchel journal");
  bar.append(sound, satchel);
  document.body.appendChild(bar);

  sound.addEventListener("click", (e) => {
    e.stopPropagation();
    const muted = opts.onToggleSound();
    sound.innerHTML = muted ? SOUND_OFF : SOUND_ON;
  });

  satchel.addEventListener("click", (e) => {
    e.stopPropagation();
    open();
  });

  function open() {
    opts.onOpen();
    const name = opts.travelerName();
    const panel = el(
      "div",
      "journal-panel",
      `<div class="journal-page">
        <div class="ribbon"></div>
        <h2>${name ? `${escapeHtml(name)}'s journal` : "Your journal"}</h2>
        <p class="hand">The pages are still blank.</p>
        <p>This satchel is where logging will live: meals, water, weigh-ins and resting at camp, one tap from anywhere in the game, even in the middle of the intro.</p>
        <p class="muted">Coming in Milestone 2 (the tracker).</p>
        <div class="journal-actions">
          ${name ? `<button class="text-btn change">Change traveler</button><button class="text-btn replay">Replay intro</button>` : ""}
          <button class="wood-btn close">Close journal</button>
        </div>
      </div>`,
    );
    panel.addEventListener("pointerup", (e) => e.stopPropagation());
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("in"));
    const close = () => {
      panel.classList.remove("in");
      setTimeout(() => panel.remove(), 300);
      opts.onClose();
    };
    panel.querySelector(".close")!.addEventListener("click", close);
    panel.querySelector(".change")?.addEventListener("click", () => {
      close();
      opts.onChangeTraveler();
    });
    panel.querySelector(".replay")?.addEventListener("click", () => {
      close();
      opts.onReplayIntro();
    });
  }
}
