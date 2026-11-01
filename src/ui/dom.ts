// Small helpers for building the HTML overlays that sit on top of the 3D world.

export const ui = () => document.getElementById("ui")!;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

/** Fade an overlay in. */
export function show(node: HTMLElement): HTMLElement {
  ui().appendChild(node);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add("in")));
  return node;
}

/** Fade an overlay out and remove it. */
export function hide(node: HTMLElement, ms = 600): Promise<void> {
  node.classList.remove("in");
  return new Promise((r) =>
    setTimeout(() => {
      node.remove();
      r();
    }, ms),
  );
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Resolve on the next tap on the element (or anywhere if no element). */
export function nextTap(target: HTMLElement | Document = document): Promise<void> {
  return new Promise((resolve) => target.addEventListener("pointerup", () => resolve(), { once: true }));
}
