"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { usePrefersReducedMotion } from "@/lib/motion/useMotionTransition";
import { loaderPoolFor, pickLoader, type LoaderVariant } from "@/lib/navigation/page-loader";
import { useNavigationWait, type NavigationWait } from "@/lib/navigation/useNavigationWait";

import { LoaderMark } from "./loader/LoaderMark";

/** A page that arrives sooner never shows it; the line at the top covers that wait. */
export const SHOW_AFTER_MS = 600;
/** From the navigation's start: past this the loader admits it is slow («Page Loader», slowAfter 5 s). */
export const SLOW_AFTER_MS = 5_000;
const MESSAGE_EVERY_MS = 2_600;

/**
 * THE FULL-SCREEN LOADER FOR A SLOW PAGE (Claude Design «Loader Concepts»,
 * 2026-10-08). Same start and end as the line (`useNavigationWait`); it shows
 * only when the page has kept the customer waiting `SHOW_AFTER_MS`, only on
 * the browse and account pages (`loaderPoolFor`), and with a loader picked
 * at random for every wait. Gone the moment the new page commits.
 *
 * CLIENT-ONLY ON PURPOSE, not `loading.tsx`: a loading boundary streams the
 * response, so its 200 is sent before the page can call `notFound()` — a
 * missing product would answer 200 (Next docs, «loading.js › Status Codes»;
 * HANDBOOK §5: a 404 is a real 404). This touches no status, no cache and no
 * server HTML: it renders nothing until a navigation starts in the browser.
 *
 * Decorates; nothing waits on it (HANDBOOK «Motion»). Wrap in `<Suspense>`:
 * it reads the search params.
 */
export function PageLoader({ locale }: { locale: Locale }) {
  const waiting = useNavigationWait();
  const [shown, setShown] = useState<{ wait: NavigationWait; variant: LoaderVariant } | null>(null);

  useEffect(() => {
    if (!waiting) return;
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const variant = pickLoader(loaderPoolFor(waiting.target, theme));
    if (!variant) return;
    const timer = window.setTimeout(() => setShown({ wait: waiting, variant }), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  // Derived, not reset by an effect: the frame the page commits, it is gone.
  const variant = shown !== null && shown.wait === waiting ? shown.variant : null;
  if (variant === null) return null;
  return <LoaderScreen variant={variant} locale={locale} />;
}

function LoaderScreen({ variant, locale }: { variant: LoaderVariant; locale: Locale }) {
  const m = messagesFor(locale).pageLoader;
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const [slow, setSlow] = useState(false);
  const screen = useRef<HTMLDivElement>(null);

  // INTO THE TOP LAYER before the first paint, so an open sheet (search,
  // country — `showModal()` dialogs no z-index can cover) cannot sit on top
  // of it. A browser without popovers keeps it as a fixed z-90 layer.
  useLayoutEffect(() => {
    try {
      screen.current?.showPopover?.();
    } catch {
      // Already shown or not supported: the fixed layer still stands.
    }
  }, []);

  // The words turn over with the mark; under reduced motion they stand still too.
  useEffect(() => {
    if (reduced) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), MESSAGE_EVERY_MS);
    return () => window.clearInterval(interval);
  }, [reduced]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS - SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const message = m.messages[tick % m.messages.length];
  const slowLine = slow ? <p className="cq-fade-in max-w-[240px] text-center text-[13px] text-pretty text-[var(--color-ink-subtle)]">{m.slow}</p> : null;

  return (
    <div ref={screen} popover="manual" className="cq-page-loader" data-variant={variant}>
      {/* What a screen reader hears: one steady line, not every rotating message. */}
      <p role="status" className="sr-only">
        {slow ? m.slow : m.label}
      </p>

      {variant === "skeleton" ? (
        <SkeletonScreen />
      ) : (
        <div className={`relative flex h-full flex-col items-center justify-center gap-6 px-4 ${variant === "battery-fill" ? "cq-loader-battery" : variant === "pixel-charge" ? "cq-loader-pixel" : `cq-loader-thunder ${variant === "thunder-light" ? "cq-loader-thunder-light" : ""}`}`}>
          {variant === "thunder-dark" ? <div className="cq-loader-sky" aria-hidden /> : null}
          {variant === "thunder-light" ? <div className="cq-loader-sky cq-loader-sky-light" aria-hidden /> : null}

          <div className={`relative flex aspect-[100/144] ${variant === "pixel-charge" ? "w-[84px]" : "w-[96px]"}`}>
            <LoaderMark motion={variant === "battery-fill" ? "battery" : variant === "pixel-charge" ? "pixel" : "thunder"} />
          </div>

          {variant === "pixel-charge" ? <div className="cq-loader-bar -mt-1 h-1 w-[120px]" aria-hidden /> : null}

          {variant === "battery-fill" ? (
            <div aria-hidden className="relative flex flex-col items-center gap-1 text-center">
              <span className="text-[16px] font-bold text-[var(--color-ink)]">{m.batteryTitle}</span>
              <span className="text-[14px]">{m.batterySubtitle}</span>
            </div>
          ) : (
            <div aria-hidden className="relative flex items-baseline text-[16px] font-medium">
              <span>{message}</span>
              <Dots />
            </div>
          )}

          {slowLine}
        </div>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex">
      <span className="cq-loader-dot">.</span>
      <span className="cq-loader-dot">.</span>
      <span className="cq-loader-dot">.</span>
    </span>
  );
}

/** 1d: the shape of a catalogue page — shown only where the page really is a grid (`loaderPoolFor`). */
function SkeletonScreen() {
  return (
    <div aria-hidden className="flex h-full flex-col">
      <div className="cq-loader-bar h-[3px] shrink-0 rounded-none" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4">
        <div className="flex items-center gap-3 py-3.5">
          <div className="flex aspect-[100/144] w-[22px]">
            <LoaderMark motion="still" />
          </div>
          <div className="cq-skeleton h-9 flex-1 rounded-[12px]" />
          <div className="size-9 rounded-[12px] bg-[var(--color-chip)]" />
        </div>
        <div className="cq-skeleton h-[150px] rounded-[16px] lg:h-[280px]" />
        <div className="flex gap-2">
          <div className="h-[30px] w-[72px] rounded-full bg-[var(--color-chip)]" />
          <div className="h-[30px] w-[56px] rounded-full bg-[var(--color-chip)]" />
          <div className="h-[30px] w-[80px] rounded-full bg-[var(--color-chip)]" />
        </div>
        <div className="h-[18px] w-[140px] rounded-[6px] bg-[var(--color-chip)]" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <div key={card} className="flex flex-col gap-2">
              <div className="cq-skeleton aspect-square rounded-[16px]" />
              <div className="h-3 w-4/5 rounded-[4px] bg-[var(--color-chip)]" />
              <div className="h-3 w-[45%] rounded-[4px] bg-[var(--color-chip)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
