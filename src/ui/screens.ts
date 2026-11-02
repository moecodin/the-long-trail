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

// Each page is a painting of the game's own 3D world (Quaternius and KayKit
// models, all CC0), made by tools/render-page-art.mjs from sandbox/page-art.
const PAGE_ART = `${import.meta.env.BASE_URL}pages/`;
const PAGES = [
  { text: "Every so often, the lantern on the Summit lights itself.", art: "page-1.jpg", alt: "A lantern glowing on top of a snowy mountain at night" },
  { text: "Nobody knows why.", art: "page-2.jpg", alt: "A cottage with a lit window under the moon, the Summit lantern glowing far away" },
  { text: "Those who walk to it come back... different. More themselves.", art: "page-3.jpg", alt: "A traveler on a stone path through a meadow at dawn, walking toward the Summit" },
];
// Start loading the paintings early so the first page never opens blank.
const preloaded = PAGES.map((p) => {
  const img = new Image();
  img.src = PAGE_ART + p.art;
  return img;
});

/** Della's old journal turns its own pages. Tap to turn sooner. */
export async function storybook(wait: (s: number) => Promise<void>): Promise<void> {
  const node = el("div", "overlay storybook", `<div class="book"><div class="page"></div></div><p class="tap-hint">tap to turn the page</p>`);
  show(node);
  const page = node.querySelector(".page") as HTMLElement;
  try {
    for (let i = 0; i < PAGES.length; i++) {
      page.classList.remove("turned");
      await preloaded[i].decode().catch(() => {});
      page.innerHTML = `<div class="art"><img src="${PAGE_ART + PAGES[i].art}" alt="${PAGES[i].alt}"></div><p class="narration">${PAGES[i].text}</p>`;
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

// ---------- Della's table: pick a keepsake ----------

export interface KeepsakeChoice {
  id: string;
  name: string;
  line: string;
  /** A small ink drawing (SVG markup on a 32 by 32 grid). */
  art: string;
}

/** Three things on Della's table; tap one to take it. */
export function pickKeepsake(choices: KeepsakeChoice[]): Promise<string> {
  const node = el(
    "div",
    "overlay pick-card",
    `<div class="pick-inner">
      <p class="kicker">Della's table</p>
      <h2>Take one thing to remember Lowmeadow by</h2>
      <div class="pick-row">${choices
        .map(
          (c) => `<button class="pick-opt" data-id="${escapeHtml(c.id)}">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${c.art}</svg>
            <span class="pick-name">${escapeHtml(c.name)}</span>
            <span class="pick-line">${escapeHtml(c.line)}</span>
          </button>`,
        )
        .join("")}</div>
    </div>`,
  );
  node.addEventListener("pointerup", (e) => e.stopPropagation());
  show(node);
  return new Promise((resolve) => {
    node.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".pick-opt");
      if (!b) return;
      node.querySelectorAll(".pick-opt").forEach((o) => o.classList.toggle("chosen", o === b));
      setTimeout(() => {
        void hide(node, 500);
        resolve(b.dataset.id!);
      }, 450);
    });
  });
}

// ---------- the journal's first page: a line to your future self ----------

/** Write one line for whoever you'll be at the Summit. Suggestions fill the box; you can change them. */
export function writeFirstLine(name: string, suggestions: string[]): Promise<string> {
  const node = el(
    "div",
    "overlay first-page",
    `<form class="first-inner">
      <p class="kicker">The first page of Della's journal</p>
      <h2>Write a line to the ${escapeHtml(name)} who reaches the Summit</h2>
      <div class="first-sugs">${suggestions.map((s) => `<button type="button" class="first-sug">${escapeHtml(s)}</button>`).join("")}</div>
      <input name="line" maxlength="140" autocomplete="off" enterkeyhint="done" placeholder="Dear me at the Summit…">
      <div class="first-actions"><button class="wood-btn confirm" type="submit">Write it</button><button class="first-later" type="button">Not now</button></div>
    </form>`,
  );
  node.addEventListener("pointerup", (e) => e.stopPropagation());
  show(node);
  const input = node.querySelector("input")!;
  node.querySelectorAll<HTMLButtonElement>(".first-sug").forEach((b) => b.addEventListener("click", () => (input.value = b.textContent ?? "")));
  // typing on a phone: keep the game's keys out of it
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return new Promise((resolve) => {
    const done = (line: string) => {
      input.blur();
      void hide(node, 600);
      resolve(line.replace(/\s+/g, " ").trim());
    };
    node.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      done(input.value);
    });
    node.querySelector(".first-later")!.addEventListener("click", () => done(""));
  });
}

// ---------- end card ----------

/** A short title card between scenes, like a page in a storybook. Tap or wait to go on. */
export function chapterCard(kicker: string, line: string): Promise<void> {
  const node = el("div", "overlay chapter-card", `<p class="kicker">${escapeHtml(kicker)}</p><p class="chapter-line">${escapeHtml(line)}</p>`);
  show(node);
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      void hide(node, 900).then(resolve);
    };
    setTimeout(go, 4200);
    node.addEventListener("pointerup", go);
  });
}

/**
 * How to walk, shown when you arrive at camp. Returns a function that hides it
 * (called the first time you move). It also fades by itself after a while.
 */
export function campHint(firstTime: boolean): () => void {
  const node = el(
    "div",
    "camp-hint",
    `<span><b>Drag left</b> to walk</span><span><b>Drag right</b> to look around</span><span><b>Pinch</b> to zoom</span><span><b>Tap</b> a spot to walk there</span>`,
  );
  document.body.appendChild(node);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("in")));
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    node.classList.remove("in");
    setTimeout(() => node.remove(), 800);
  };
  setTimeout(close, firstTime ? 14000 : 7000);
  return close;
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
