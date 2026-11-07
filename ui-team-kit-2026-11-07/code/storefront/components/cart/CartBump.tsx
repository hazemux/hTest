"use client";

import { useEffect, useRef } from "react";

const LAST_SEEN = "cq-cart-count";

/**
 * One decision per count for the whole page: the header's basket and the buy
 * bar's both bump, and the first to read storage must not make the second
 * see "no change".
 */
let settled: { count: number; previous: number | null } | null = null;

function previousCount(count: number): number | null {
  if (settled?.count === count) return settled.previous;
  let previous: number | null = null;
  try {
    const stored = window.sessionStorage.getItem(LAST_SEEN);
    previous = stored === null ? null : Number(stored);
    window.sessionStorage.setItem(LAST_SEEN, String(count));
  } catch {
    previous = null;
  }
  settled = { count, previous };
  return previous;
}

/**
 * The basket glyph and its count, bumped when the count GROWS — the moment
 * «أضف للسلة» lands a line. Compared with the last count this browser showed
 * (session storage), not with the first render: adding redirects back to the
 * page, which mounts the bar afresh with the new count already in it. Not on
 * a first visit, nor when the count drops. `prefers-reduced-motion` turns the
 * motion off (globals.css); storage that is blocked just means no bump.
 *
 * `null` IS "NOT KNOWN YET" — the shared shell's basket, before the visitor's
 * count streams in (`CartBadge.tsx`). Same box, and it neither reads nor
 * writes the last count: recording a «0» there would make the real count
 * that replaces it look like a line just added, and bump on every page.
 */
export function CartBump({ count, children }: { count: number | null; children: React.ReactNode }) {
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (count === null) return;
    const previous = previousCount(count);
    const element = box.current;
    if (!element || previous === null || !(count > previous)) return;
    // Restart the animation even if the class is still on from a quick
    // second add: drop it, force a style read, put it back.
    element.classList.remove("cq-cart-bump");
    void element.offsetWidth;
    element.classList.add("cq-cart-bump");
  }, [count]);

  return (
    <span ref={box} className="relative grid place-items-center">
      {children}
    </span>
  );
}
