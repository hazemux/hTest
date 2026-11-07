"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BannerSlot } from "@/lib/content/banners";

import { ThemeImage } from "./ThemeImage";

/**
 * Every banner the storefront draws — a single banner is a slider of one
 * slide, with no controls. Each slide is already resolved on the server to
 * its pictures for the page's language in both themes (`placementBanners`);
 * `ThemeImage` shows the one the theme script chose (ADR 0046 §4). This
 * component never chooses a picture, it only moves between slides.
 *
 * ONE FRAME FOR EVERY SCREEN: 1200 × 488 (the owner, 2026-09-28), scaled down
 * with the page and never reshaped — the desktop size is never used on a
 * phone, only the shape — so what staff upload at 2400 × 976 is what the
 * customer sees. `object-cover` trims an upload of another shape.
 * No per-device settings — the owner asked for none.
 *
 * A SCROLL-SNAP TRACK, not transforms. Swiping is the browser's own, it works
 * before hydration, and the arrows only ever scroll the track to a slide.
 * Which slide is current is READ BACK from the scroll position, so a swipe,
 * an arrow and the autoplay all agree without a second source of truth.
 * No dots and no pause button under the banner (the owner, 2026-09-28).
 *
 * RIGHT TO LEFT without special cases: a slide is scrolled to by the gap
 * between its edge and the track's (`getBoundingClientRect`), which is the
 * right distance in either direction — `scrollLeft` alone is negative in RTL.
 *
 * AUTOPLAY, AND THE WAYS IT STOPS (WCAG 2.2.2): hovering or focusing the
 * slider holds it; touching, swiping or clicking it stops it for good (with
 * the pause button gone, that is how a phone reader stops it); a hidden tab;
 * and a reader who asked the system for reduced motion, for whom it never
 * starts.
 */

const AUTOPLAY_MS = 6000;

/** Where a slider sits and the shape of its plate. */
export type BannerFrame = {
  /** The box around it: the page column, or nothing when the caller already is one. */
  wrapper: string;
  /** The plate's corners. */
  rounded: string;
  /** Every slide's aspect ratio. */
  aspect: string;
  /** `sizes` for the slide pictures. */
  sizes: string;
};

const HOME_FRAME: BannerFrame = {
  wrapper: "mx-auto w-full max-w-[1248px] px-6",
  rounded: "rounded-[16px] lg:rounded-[32px]",
  aspect: "aspect-[1200/488]",
  sizes: "(min-width: 1248px) 1200px, 100vw",
};

export type BannerSliderLabels = {
  region: string;
  previous: string;
  next: string;
};

export function BannerSlider({
  slides,
  labels,
  className = "mt-4 lg:mt-12",
  lcp = false,
  frame = HOME_FRAME,
}: {
  slides: BannerSlot[];
  labels: BannerSliderLabels;
  /** The space above it — the only thing that differs by where it sits. */
  className?: string;
  /** This slider is the page's LCP: its first picture is preloaded at high priority. Only a banner at the top of the page. */
  lcp?: boolean;
  /**
   * The slot's own shape. The home page's 1200 × 488 by default; a category's
   * own banners keep the category comp's plate (`CategoryBanner`), so a
   * slider never changes the shape of the page it sits on.
   */
  frame?: BannerFrame;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [held, setHeld] = useState({ hover: false, focus: false });
  const [reduced, setReduced] = useState(false);
  const many = slides.length > 1;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      if (query.matches) setPlaying(false);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  /*
   * WHERE A BUTTON SENT THE TRACK, until it arrives. A smooth scroll passes
   * over the slides in between, and a second click before it lands must
   * count from the slide it is heading to — not from one it is passing (two
   * quick "previous" from slide 2 must reach 3, not 1 twice).
   */
  const heading = useRef<{ index: number; until: number } | null>(null);

  const goTo = useCallback(
    (index: number) => {
      const el = track.current;
      const slide = el?.children[index] as HTMLElement | undefined;
      if (!el || !slide) return;
      heading.current = { index, until: Date.now() + 1000 };
      setCurrent(index);
      const distance = slide.getBoundingClientRect().left - el.getBoundingClientRect().left;
      el.scrollBy({ left: distance, behavior: reduced ? "auto" : "smooth" });
    },
    [reduced],
  );

  function onScroll() {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.min(Math.max(Math.round(Math.abs(el.scrollLeft) / el.clientWidth), 0), slides.length - 1);
    const target = heading.current;
    if (target && Date.now() < target.until && index !== target.index) return;
    heading.current = null;
    setCurrent(index);
  }

  // The admin can remove a slide while this one is on screen (a refresh
  // re-renders the list): never point past the end.
  const shown = Math.min(current, slides.length - 1);

  useEffect(() => {
    if (!many || !playing || held.hover || held.focus) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") goTo((shown + 1) % slides.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [many, playing, held, shown, slides.length, goTo]);

  if (slides.length === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.region}
      className={`${frame.wrapper} ${className}`}
      onPointerDown={() => setPlaying(false)}
      onMouseEnter={() => setHeld((h) => ({ ...h, hover: true }))}
      onMouseLeave={() => setHeld((h) => ({ ...h, hover: false }))}
      onFocus={() => setHeld((h) => ({ ...h, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHeld((h) => ({ ...h, focus: false }));
        }
      }}
    >
      <div className={`relative overflow-hidden ${frame.rounded}`}>
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, index) => (
            <div
              key={slide.key}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${slides.length}`}
              // Off-screen slides leave the tab order and the accessibility
              // tree: the arrows are how a keyboard reaches them.
              inert={index !== shown}
              className={`relative w-full shrink-0 snap-start snap-always ${frame.aspect}`}
            >
              <Link
                href={slide.href}
                {...(slide.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                // The picture carries the words; the slide's name is what a
                // screen reader says for the link.
                aria-label={slide.headline || undefined}
                className="absolute inset-0 block"
              >
                {/* Only a top banner's first slide is above the fold on arrival. */}
                <ThemeImage images={slide.images} sizes={frame.sizes} lcp={lcp && index === 0} />
              </Link>
            </div>
          ))}
        </div>

        {many ? (
          <>
            <Arrow label={labels.previous} side="start" onClick={() => goTo((shown - 1 + slides.length) % slides.length)} />
            <Arrow label={labels.next} side="end" onClick={() => goTo((shown + 1) % slides.length)} />
          </>
        ) : null}
      </div>

    </section>
  );
}

/**
 * Previous at the START edge and next at the END, pointing outward — so in
 * Arabic "previous" sits on the right and points right. Desktop only: on a
 * phone the track is swiped.
 */
function Arrow({ label, side, onClick }: { label: string; side: "start" | "end"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-[var(--color-surface)]/85 text-[var(--color-ink)] shadow-sm transition hover:bg-[var(--color-surface)] lg:grid ${
        side === "start" ? "start-4" : "end-4"
      }`}
    >
      <span
        aria-hidden
        className={`block size-5 bg-current [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${
          side === "start" ? "rotate-90 rtl:-rotate-90" : "-rotate-90 rtl:rotate-90"
        }`}
      />
    </button>
  );
}
