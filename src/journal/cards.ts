// Trail cards, drawn in the frame from Quaternius' 3D Card Kit. The satchel's
// Cards page shows the album, and the journal shows a recipe's card on its page.

import { escapeHtml as esc } from "../ui/dom";
import { cardArt } from "./doodles";
import { KIND_LABEL, type CardKind, type Recipe } from "./recipes";

/** The trail card frame and back (see tools/render-card-frames.mjs). */
const CARD_IMG = `${import.meta.env.BASE_URL}cards/`;

export interface CardOpts {
  /** The bigger card on the right-hand page. */
  big?: boolean;
  /** Just a picture, not a button. */
  still?: boolean;
  picked?: boolean;
  /** A face-down card still out on the trail. */
  waiting?: { kind: CardKind; hint: string };
  /** Which waiting card this is. */
  n?: number;
}

/** One trail card. Recipes are the only cards so far. */
export function trailCard(r: Recipe | null, opts: CardOpts = {}) {
  const cls = `tc ${r ? "recipe" : "back"}${opts.big ? " big" : ""}`;
  const label = r ? `${esc(r.name)} recipe card` : `A ${KIND_LABEL[opts.waiting!.kind].toLowerCase()} card still out on the trail`;
  // the album's cards are buttons; a card shown on its own is just a picture
  const open = opts.still
    ? `<div class="${cls}" role="img" aria-label="${label}">`
    : `<button class="${cls}" data-act="pick-card" data-id="${r ? r.id : `waiting-${opts.n}`}" aria-pressed="${!!opts.picked}" aria-label="${label}">`;
  const close = opts.still ? "</div>" : "</button>";
  if (!r) return `${open}<img src="${CARD_IMG}back.png" alt="" draggable="false">${close}`;
  return `${open}
    <span class="tc-window">
      <span class="tc-kind">Recipe</span>
      ${cardArt(r.id)}
      <span class="tc-name">${esc(r.name)}</span>
      ${opts.big ? `<span class="tc-line">${esc(r.line)}</span>` : ""}
    </span>
    <img class="tc-frame" src="${CARD_IMG}frame.png" alt="" draggable="false">${close}`;
}
