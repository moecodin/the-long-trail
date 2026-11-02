// Trail cards, drawn in the frame from Quaternius' 3D Card Kit. The satchel's
// Cards page shows the album, and the journal shows a recipe's card on its page.

import { escapeHtml as esc } from "../ui/dom";
import { cardArt } from "./doodles";
import { KIND_LABEL, type CardKind, type Recipe, type TrailCardFace } from "./recipes";

/** The trail card frame and back (see tools/render-card-frames.mjs). */
const CARD_IMG = `${import.meta.env.BASE_URL}cards/`;

/** A card's face: a recipe, or a place or critter card. */
export type CardFace = Recipe | TrailCardFace;

const kindOf = (c: CardFace): CardKind => ("kind" in c ? c.kind : "recipe");

export interface CardOpts {
  /** The bigger card on the right-hand page. */
  big?: boolean;
  /** Just a picture, not a button. */
  still?: boolean;
  picked?: boolean;
  /** A face-down card still out on the trail. */
  waiting?: { kind: CardKind; hint: string };
  /** The album id of a face-down card (it's a button too). */
  waitingId?: string;
}

/** One trail card, face up (c) or face down (null, with opts.waiting). */
export function trailCard(c: CardFace | null, opts: CardOpts = {}) {
  const kind = c ? kindOf(c) : opts.waiting!.kind;
  const cls = `tc ${c ? kind : "back"}${opts.big ? " big" : ""}`;
  const label = c ? `${esc(c.name)} ${KIND_LABEL[kind].toLowerCase()} card` : `A ${KIND_LABEL[kind].toLowerCase()} card still out on the trail`;
  // the album's cards are buttons; a card shown on its own is just a picture
  const open = opts.still
    ? `<div class="${cls}" role="img" aria-label="${label}">`
    : `<button class="${cls}" data-act="pick-card" data-id="${c ? c.id : opts.waitingId}" aria-pressed="${!!opts.picked}" aria-label="${label}">`;
  const close = opts.still ? "</div>" : "</button>";
  if (!c) return `${open}<img src="${CARD_IMG}back.png" alt="" draggable="false">${close}`;
  return `${open}
    <span class="tc-window">
      <span class="tc-kind">${KIND_LABEL[kind]}</span>
      ${cardArt(c.id)}
      <span class="tc-name">${esc(c.name)}</span>
      ${opts.big ? `<span class="tc-line">${esc(c.line)}</span>` : ""}
    </span>
    <img class="tc-frame" src="${CARD_IMG}frame.png" alt="" draggable="false">${close}`;
}
