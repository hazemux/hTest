"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A long list drawn a batch at a time (owner, 2026-10-08: «the long pages
 * need suitable lazy loading») — a sector of 270 brands opens with its first
 * `batch` cards and adds the next batch as the customer nears the end, so the
 * phone neither lays out nor fetches artwork for cards nobody scrolled to.
 *
 * The cards are rendered on the server and handed in as children; only how
 * many are shown is decided here. A «show more» button sits under the list
 * as well — the way in for keyboards, and for a browser that never reports
 * the scroll — and disappears once everything is shown.
 */
export function RevealInBatches({
  children,
  batch,
  className,
  moreLabel,
}: {
  children: ReactNode;
  batch: number;
  className: string;
  moreLabel: string;
}) {
  const items = Children.toArray(children);
  const total = items.length;
  const [shown, setShown] = useState(batch);
  const sentinel = useRef<HTMLDivElement>(null);
  const remaining = total - shown;

  useEffect(() => {
    if (remaining <= 0) return;

    // Measured on scroll: when the end of the list comes within reach (well
    // before the last card, so the next ones are laid out by the time the
    // thumb gets there), the next batch is added. Checked once on mount too,
    // for a page opened already scrolled down.
    let frame = 0;
    const check = () => {
      frame = 0;
      const target = sentinel.current;
      if (target && target.getBoundingClientRect().top < window.innerHeight + 800) {
        setShown((count) => Math.min(count + batch, total));
      }
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    check();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [batch, total, remaining]);

  return (
    <>
      <ul className={className}>{items.slice(0, shown)}</ul>
      {/* Only while cards remain: a list that fits in one batch draws exactly as before. */}
      {remaining > 0 ? (
        <div ref={sentinel} className="mt-6 flex justify-center lg:mt-8">
          <button
            type="button"
            onClick={() => setShown((count) => Math.min(count + batch, total))}
            className="rounded-[12px] bg-[var(--color-secondary)] px-6 py-2.5 text-body-s font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-secondary-hover)]"
          >
            {moreLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
