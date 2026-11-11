import { useEffect, useState } from "react";

/**
 * The whole router.
 *
 * Two routes — the field, and one leaf's page — which is not enough to justify
 * a dependency. Real paths rather than a hash, because the hash is already
 * spoken for: the journey's anchors (`#research`, `#contact`) are fragments of
 * the field's own document, and a router that also owned the hash would have to
 * arbitrate between "scroll to the contact panel" and "open a page".
 *
 * A static host therefore needs a rewrite of unknown paths to `/index.html`.
 * Vite's dev server and `vite preview` do this by default; Netlify, Vercel and
 * GitHub Pages each want a line of config for it.
 */

export type Route =
  | { name: "field" }
  | { name: "leaf"; id: string }
  | { name: "bowling" };

const PREFIX = "/experience/";
export const BOWLING_PATH = "/groundhog-bowling";

export function parse(path: string): Route {
  if (path.replace(/\/$/, "") === BOWLING_PATH) return { name: "bowling" };
  if (path.startsWith(PREFIX)) {
    const id = path.slice(PREFIX.length).replace(/\/$/, "");
    if (id) return { name: "leaf", id };
  }
  return { name: "field" };
}

export function hrefFor(id: string): string {
  return `${PREFIX}${id}`;
}

/**
 * Where the field was left, so coming back from a leaf's page returns you to
 * the leaf rather than to the top of the document.
 *
 * Kept in memory rather than in `history.state`: the browser restores scroll on
 * a back navigation by itself, and this is only needed for the forward trip
 * home, where nothing has been restored because nothing was popped.
 */
let fieldScroll = 0;

export function navigate(path: string) {
  if (path === location.pathname) return;
  if (parse(location.pathname).name === "field") fieldScroll = window.scrollY;
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Where to put the reader when the field comes back. */
export function takeFieldScroll(): number {
  return fieldScroll;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname));

  useEffect(() => {
    const sync = () => setRoute(parse(location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return route;
}

/**
 * Click handler for an in-app link.
 *
 * Leaves modified clicks and anything but the primary button alone, so
 * cmd-click still opens a leaf in a new tab — the href on the anchor is real,
 * which is the whole reason for using paths.
 */
export function onNavigate(path: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };
}
