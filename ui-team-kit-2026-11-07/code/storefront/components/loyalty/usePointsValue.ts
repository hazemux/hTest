"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import type { Money } from "@/lib/loyalty/types";

/** How long the number must sit still before the server is asked (a thumb on ± fires many). */
export const POINTS_VALUE_DEBOUNCE_MS = 250;

/**
 * What `pts` points are worth — the SERVER's figure (`GET /loyalty/points-value`
 * through our public, cached route `app/api/loyalty/points-value`), never a
 * multiplication in the browser (HANDBOOK §1).
 *
 * Debounced, answered from memory for a number already asked, and only the
 * newest answer lands: a slow reply for an earlier number never overwrites a
 * later one. While the next answer is due, `settling` is true and the last
 * figure is the caller's to dim — it belongs to the previous number.
 */
export function usePointsValue(locale: Locale, pts: number | null): { value: Money | null; settling: boolean; failed: boolean } {
  const [answer, setAnswer] = useState<{ pts: number; value: Money | null; failed: boolean } | null>(null);
  const known = useRef(new Map<number, Money>());
  const ticket = useRef(0);

  useEffect(() => {
    if (pts === null) return;
    const remembered = known.current.get(pts);
    const mine = ++ticket.current;
    if (remembered) {
      // Already asked: answered at once, still through a timer so no state is
      // set synchronously inside the effect.
      const now = window.setTimeout(() => {
        if (mine === ticket.current) setAnswer({ pts, value: remembered, failed: false });
      }, 0);
      return () => window.clearTimeout(now);
    }
    const timer = window.setTimeout(async () => {
      let value: Money | null = null;
      try {
        const response = await fetch(`/api/loyalty/points-value?pts=${pts}&locale=${locale}`, { headers: { Accept: "application/json" } });
        if (response.ok) {
          const body = (await response.json()) as { value?: Money | null };
          value = body.value ?? null;
        }
      } catch {
        value = null;
      }
      if (value) known.current.set(pts, value);
      if (mine === ticket.current) setAnswer({ pts, value, failed: value === null });
    }, POINTS_VALUE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [locale, pts]);

  if (pts === null) return { value: null, settling: false, failed: false };
  const current = answer?.pts === pts;
  return { value: answer?.value ?? null, settling: !current, failed: current && answer.failed };
}
