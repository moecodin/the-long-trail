// The 2D screens of the intro: the title, the storybook pages, the mirror
// where you pick and name your traveler, dialogue lines and the closing card.

import { el, escapeHtml, hide, show } from "./dom";
import { TRAVELERS, portraitSVG, STAGE_NAMES, type Traveler } from "../travelers";
import type { TravelerId } from "../save";

// ---------- title ----------

export function titleScreen(returningName: string | null): Promise<"begin" | "replay"> {
  const node = el(
    "div",
    "overlay title-screen",
    `<h1 class="title">The Long Trail</h1>
     ${returningName ? `<p class="welcome">Welcome back, ${escapeHtml(returningName)}.</p>` : ""}
     <button class="tap-begin">Tap to begin</button>
     ${returningName ? `<button class="text-btn replay">Replay intro</button>` : ""}`,
  );
  show(node);
  return new Promise((resolve) => {
    node.querySelector(".tap-begin")!.addEventListener("click", () => {
      void hide(node, 900);
      resolve("begin");
    });
    node.querySelector(".replay")?.addEventListener("click", () => {
      void hide(node, 900);
      resolve("replay");
    });
  });
}

// ---------- storybook ----------

const INK = `filter="url(#sketchy)" fill="none" stroke="#3b2a1e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
const SKETCH_DEFS = `<defs><filter id="sketchy"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></defs>`;

const PAGES = [
  {
    text: "Every so often, the lantern on the Summit lights itself.",
    art: `<svg viewBox="0 0 240 150">${SKETCH_DEFS}<g ${INK}>
      <path d="M10 140 L70 70 L95 95 L130 30 L165 80 L190 60 L232 140"/>
      <path d="M118 52 L130 30 L142 52 Q130 46 118 52"/>
      <path d="M126 22 h8 v-8 h-8 z M130 14 v-4"/>
      <path d="M118 16 l-8 -6 M142 16 l8 -6 M130 4 v-3 M114 26 h-8 M146 26 h8" stroke-width="1.6"/>
      <path d="M30 140 Q60 120 80 128 T140 132 T220 140" stroke-width="1.4"/></g></svg>`,
  },
  {
    text: "Nobody knows why.",
    art: `<svg viewBox="0 0 240 150">${SKETCH_DEFS}<g ${INK}>
      <path d="M40 130 Q40 80 70 80 Q100 80 100 130 Z"/><path d="M62 130 v-18 h16 v18"/><path d="M55 80 L70 58 L85 80"/>
      <path d="M140 132 h80 M150 132 v-30 h20 v30 M160 102 v-10"/>
      <path d="M176 40 a14 14 0 1 0 10 24 a11 11 0 1 1 -10 -24"/>
      <path d="M40 30 l3 6 l6 1 l-5 4 l1 6 l-5 -3 l-5 3 l1 -6 l-5 -4 l6 -1 z M110 20 l2 4 l4 1 l-3 3 l1 4 l-4 -2 l-4 2 l1 -4 l-3 -3 l4 -1 z" stroke-width="1.4"/></g></svg>`,
  },
  {
    text: "Those who walk to it come back... different. More themselves.",
    art: `<svg viewBox="0 0 240 150">${SKETCH_DEFS}<g ${INK}>
      <path d="M20 145 Q80 120 70 95 Q60 70 120 62 Q180 54 170 34 Q164 20 190 12"/>
      <path d="M40 145 Q100 124 92 96 Q84 76 130 70 Q196 62 186 34 Q182 22 198 14" stroke-width="1.4"/>
      <circle cx="96" cy="112" r="5"/><path d="M96 117 v14 M96 122 l-6 5 M96 122 l7 3 M96 131 l-5 9 M96 131 l5 9 M103 125 l4 -16"/>
      <path d="M193 6 h6 v6 h-6 z"/></g></svg>`,
  },
];

/** Della's old journal turns its own pages. Tap to turn sooner. */
export async function storybook(wait: (s: number) => Promise<void>): Promise<void> {
  const node = el("div", "overlay storybook", `<div class="book"><div class="page"></div></div><p class="tap-hint">tap to turn the page</p>`);
  show(node);
  const page = node.querySelector(".page") as HTMLElement;
  try {
    for (let i = 0; i < PAGES.length; i++) {
      page.classList.remove("turned");
      page.innerHTML = `<div class="art">${PAGES[i].art}</div><p class="narration">${PAGES[i].text}</p>`;
      await new Promise((r) => requestAnimationFrame(r));
      page.classList.add("open");
      await Promise.race([wait(i === PAGES.length - 1 ? 6.5 : 5), tapOn(node)]);
      page.classList.add("turned");
      page.classList.remove("open");
      await wait(0.7);
    }
  } finally {
    await hide(node, 800);
  }
}

const tapOn = (node: HTMLElement) =>
  new Promise<void>((r) => node.addEventListener("pointerup", () => r(), { once: true }));

// ---------- the mirror: pick and name your traveler ----------

export interface CreationResult {
  id: TravelerId;
  name: string;
}

export function creationScreen(current: CreationResult | null, stage: number): Promise<CreationResult> {
  let chosen: Traveler = TRAVELERS.find((t) => t.id === current?.id) ?? TRAVELERS[0];
  let previewStage = stage;

  const node = el(
    "div",
    "overlay creation",
    `<div class="mirror-card">
      <div class="mirror-side">
        <div class="mirror-frame"><div class="mirror-glass stage-${stage}"></div><div class="mirror-mist"></div></div>
        <p class="stage-label"></p>
        <button class="text-btn focus-peek" type="button">See how it comes into focus</button>
      </div>
      <div class="choose-side">
        <p class="kicker">The old mirror by the door</p>
        <h2>Who's looking back?</h2>
        <div class="picker" role="radiogroup" aria-label="Pick your traveler">
          ${TRAVELERS.map(
            (t) => `<button class="pick" role="radio" data-id="${t.id}" type="button">
               <span class="thumb">${portraitSVG(t)}</span><span class="pick-label">${t.label}</span></button>`,
          ).join("")}
        </div>
        <form class="name-form" autocomplete="off">
          <label for="traveler-name">Name your traveler</label>
          <input id="traveler-name" name="name" maxlength="16" placeholder="Type a name" enterkeyhint="done" autocapitalize="words" spellcheck="false" />
          <p class="name-hint">&nbsp;</p>
          <button class="wood-btn confirm" type="submit">This is me</button>
        </form>
      </div>
    </div>`,
  );
  // Taps inside the card shouldn't fall through to anything behind it.
  node.addEventListener("pointerup", (e) => e.stopPropagation());
  show(node);

  const glass = node.querySelector(".mirror-glass") as HTMLElement;
  const label = node.querySelector(".stage-label") as HTMLElement;
  const input = node.querySelector("input") as HTMLInputElement;
  const hint = node.querySelector(".name-hint") as HTMLElement;
  const picks = [...node.querySelectorAll<HTMLButtonElement>(".pick")];
  input.value = current?.name ?? "";

  const render = () => {
    glass.innerHTML = portraitSVG(chosen);
    glass.className = `mirror-glass stage-${previewStage}`;
    node.querySelector(".mirror-mist")!.classList.toggle("clear", previewStage > 1);
    label.textContent = previewStage === stage ? "Not quite finished being drawn yet." : STAGE_NAMES[previewStage];
    for (const p of picks) p.setAttribute("aria-checked", String(p.dataset.id === chosen.id));
  };
  render();

  for (const p of picks)
    p.addEventListener("click", () => {
      chosen = TRAVELERS.find((t) => t.id === p.dataset.id)!;
      previewStage = stage;
      render();
    });

  // A little preview of how the portrait clears up over the four acts.
  let peeking = false;
  node.querySelector(".focus-peek")!.addEventListener("click", async () => {
    if (peeking) return;
    peeking = true;
    for (const s of [2, 3, 4]) {
      previewStage = s;
      render();
      await new Promise((r) => setTimeout(r, 1300));
    }
    await new Promise((r) => setTimeout(r, 900));
    previewStage = stage;
    render();
    peeking = false;
  });

  return new Promise((resolve) => {
    node.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = input.value.replace(/\s+/g, " ").trim();
      if (!name) {
        hint.textContent = "Your traveler needs a name.";
        input.focus();
        return;
      }
      input.blur();
      void hide(node, 700);
      resolve({ id: chosen.id, name });
    });
  });
}

// ---------- dialogue ----------

/** Show a line of dialogue. Resolves on a tap (after a short moment so it isn't skipped by accident). */
export async function say(speaker: string, line: string): Promise<void> {
  const node = el("div", "overlay dialogue", `<div class="speech"><p class="speaker">${escapeHtml(speaker)}</p><p class="line">${escapeHtml(line)}</p><span class="more">▼</span></div>`);
  show(node);
  await new Promise((r) => setTimeout(r, 450));
  await tapOn(node);
  await hide(node, 250);
}

// ---------- end card ----------

export function endCard(name: string, traveler: Traveler): Promise<"replay" | "change"> {
  const node = el(
    "div",
    "overlay end-card",
    `<div class="end-inner">
      <div class="end-portrait"><div class="stage-1">${portraitSVG(traveler)}</div></div>
      <div class="end-text">
        <p class="kicker">The Lantern Wakes</p>
        <h2>${escapeHtml(name)}'s trail begins at dusk.</h2>
        <p>That's the end of the intro for now. Walking around camp comes next, in Milestone 1.</p>
        <div class="end-actions">
          <button class="text-btn change">Change traveler</button>
          <button class="wood-btn replay">Replay intro</button>
        </div>
      </div>
    </div>`,
  );
  node.addEventListener("pointerup", (e) => e.stopPropagation());
  show(node);
  return new Promise((resolve) => {
    node.querySelector(".replay")!.addEventListener("click", () => {
      void hide(node);
      resolve("replay");
    });
    node.querySelector(".change")!.addEventListener("click", () => {
      void hide(node);
      resolve("change");
    });
  });
}

export function skipButton(onSkip: () => void): HTMLElement {
  const b = el("button", "skip-btn", "Skip intro");
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onSkip();
  });
  document.body.appendChild(b);
  return b;
}
