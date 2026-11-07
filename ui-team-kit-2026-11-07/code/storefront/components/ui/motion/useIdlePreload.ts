"use client";

import { useCallback, useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/lib/motion/useMotionTransition";

/** Wait this long after hydration before the browser is even asked for idle time. */
const SETTLE_MS = 1000;
/** …and take the slot anyway after this much more, on a page that never goes idle. */
const IDLE_DEADLINE_MS = 1000;

/**
 * WHEN A LAYOUT-LEVEL OVERLAY'S ANIMATED MODULE SHOULD BE MOUNTED.
 *
 * The header drawer, the account dropdown and the added-to-cart bar sit in the
 * LAYOUT, so anything they import statically is in the first-load JavaScript
 * of every page — and Motion's render core (`m`, `AnimatePresence`) is ~18 KB
 * gzipped that a browse page never needs until one of them opens. Each overlay
 * therefore keeps its animated layer in its own module behind `React.lazy` and
 * draws a plain-element copy of itself while that module is on its way (see
 * `MobileMenuDrawer.tsx` for the pattern).
 *
 * This hook decides when the lazy layer is MOUNTED, which is also what starts
 * its download:
 *   - after hydration, once the page has settled and the browser is idle;
 *   - on the first pointer-enter / touch / focus of the control that opens the
 *     overlay (`arm`), which is earlier than a tap's click by a few hundred ms;
 *   - the moment the overlay is wanted (`wanted`), so a first open never waits.
 *
 * UNDER REDUCED MOTION IT NEVER MOUNTS (`still`): the overlay would not animate
 * anyway, so its plain copy IS the whole experience and Motion is never
 * downloaded for it.
 *
 * AND IT STAYS TRUE. A lazy layer that unmounted when `wanted` went false
 * would take its `AnimatePresence` with it and the exit would never play;
 * once mounted it is kept mounted for the life of the page.
 */
export function useIdlePreload(wanted: boolean = false): { mounted: boolean; arm: () => void; still: boolean } {
  const still = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const arm = useCallback(() => {
    if (!still) setMounted(true);
  }, [still]);

  // Own state, set while rendering: React re-renders this component at once
  // and no extra commit is painted.
  if (wanted && !mounted && !still) setMounted(true);

  useEffect(() => {
    if (still) return;
    let idle: number | undefined;
    const settle = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => setMounted(true), { timeout: IDLE_DEADLINE_MS });
      } else {
        setMounted(true);
      }
    }, SETTLE_MS);

    return () => {
      window.clearTimeout(settle);
      if (idle !== undefined) window.cancelIdleCallback(idle);
    };
  }, [still]);

  return { mounted: mounted && !still, arm, still };
}
