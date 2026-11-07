"use client";

import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "cq-cart-figure-";

/** The last figure shown for each id in this tab — a tap re-renders the page in place. */
const shown = new Map<string, string>();

function changedSince(id: string, value: string): boolean {
  // This tab's memory first, then what this browser last showed (a form post
  // that reloaded the whole document).
  let previous = shown.get(id) ?? null;
  try {
    if (previous === null) previous = window.sessionStorage.getItem(STORAGE_PREFIX + id);
    window.sessionStorage.setItem(STORAGE_PREFIX + id, value);
  } catch {
    // Blocked storage: no memory across a reload, so no wash — never a wrong one.
  }
  shown.set(id, value);
  return previous !== null && previous !== value;
}

/**
 * A figure on the basket that is washed once when it CHANGES — the total
 * after a quantity step, a coupon or a removal.
 *
 * The page is server-rendered again after every action, so "changed" cannot
 * be known from the render: it is the figure this browser LAST SHOWED
 * (`changedSince`) compared with the one now. Never on a first visit, never
 * when the figure is the same after the action. Keyed by the formatted value
 * so a quick second change restarts the wash rather than queueing; the class
 * is added in an effect, so the server's HTML is the final state and nothing
 * animates before hydration. The `id` should carry the locale: the formatted
 * string differs between «ar» and «en», and switching language is not a re-price.
 * Decoration only — it gates nothing, and blocked
 * storage just means no wash.
 */
export function ChangedFigure({ id, value, className, dir }: { id: string; value: string; className?: string; dir?: "ltr" | "rtl" }) {
  return <Figure key={value} id={id} value={value} className={className} dir={dir} />;
}

function Figure({ id, value, className, dir }: { id: string; value: string; className?: string; dir?: "ltr" | "rtl" }) {
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (changedSince(id, value)) box.current?.classList.add("cq-changed");
  }, [id, value]);

  return (
    <span ref={box} dir={dir} className={className}>
      {value}
    </span>
  );
}
