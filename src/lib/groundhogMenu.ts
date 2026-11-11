/**
 * The little menu a click on the groundhog opens.
 *
 * The animal lives in the scene and the menu is DOM, over the page, so the two
 * meet here: the groundhog opens and closes it and, every frame while it is
 * open, writes where on screen its chest is straight onto the menu's element —
 * so the menu rides along with it without React hearing about every frame.
 */

export const groundhogMenu = {
  open: false,
  /** The menu's element, while it is mounted. */
  el: null as HTMLElement | null,
};

const listeners = new Set<() => void>();

function set(open: boolean) {
  if (groundhogMenu.open === open) return;
  groundhogMenu.open = open;
  for (const l of listeners) l();
}

export const openGroundhogMenu = () => set(true);
export const closeGroundhogMenu = () => set(false);

export function subscribeGroundhogMenu(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Put the menu's anchor at a point on screen, in CSS pixels. */
export function placeGroundhogMenu(x: number, y: number) {
  const el = groundhogMenu.el;
  if (!el) return;
  // Opens to the right of the animal, unless that would run off the screen.
  const flip = x > window.innerWidth - 300;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.dataset.side = flip ? "left" : "right";
  el.style.visibility = "visible";
}
