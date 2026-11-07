"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";

import type { Locale } from "@/lib/i18n/locales";

type SheetProps = { locale: Locale; open: boolean; onClose: () => void; initialQuery?: string };

/**
 * The phone search bar's client part, kept tiny: the sheet (panel, hooks,
 * recents) is imported on the first pointerdown or focus, so catalogue pages
 * ship no search code until someone reaches for it (spec §9).
 *
 * THE TAP ANSWERS AT ONCE, whether or not the sheet has arrived: the bar
 * dims under the finger (`active:`), and when a tap finds the sheet still
 * downloading for more than 150 ms the bar keeps a quiet pulse
 * (`data-loading`) until the sheet opens — CSS only, nothing to read, so
 * nothing to translate. Opening itself never waits on the pulse.
 */
export function SearchTrigger({ locale, initialQuery, className, children }: { locale: Locale; initialQuery?: string; className: string; children: React.ReactNode }) {
  const [Sheet, setSheet] = useState<ComponentType<SheetProps> | null>(null);
  const [open, setOpen] = useState(false);
  // A tap landed before the sheet had arrived, and the 150 ms grace is up.
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);

  const load = useCallback(() => {
    if (!Sheet) void import("./SearchSheet").then((mod) => setSheet(() => mod.default));
  }, [Sheet]);

  // Fetch the sheet while the page idles, so a tap finds it already loaded and
  // can open AND focus it inside the gesture — the only way iOS raises the
  // keyboard. The pointer/focus loads below remain as the fallback.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (id: number) => void });
    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(load);
      return () => idle.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(load, 300);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    if (!waiting || Sheet) return;
    const id = window.setTimeout(() => setSlow(true), 150);
    return () => window.clearTimeout(id);
  }, [waiting, Sheet]);

  const loading = waiting && slow && !Sheet;

  return (
    <>
      <button
        type="button"
        onPointerDown={load}
        onFocus={load}
        onClick={() => {
          if (!Sheet) setWaiting(true);
          setOpen(true);
        }}
        data-loading={loading ? "" : undefined}
        className={`${className} transition-opacity active:opacity-70 data-[loading]:opacity-70 data-[loading]:motion-safe:animate-pulse`}
      >
        {children}
      </button>
      {Sheet ? <Sheet locale={locale} open={open} onClose={() => setOpen(false)} initialQuery={initialQuery} /> : null}
    </>
  );
}
