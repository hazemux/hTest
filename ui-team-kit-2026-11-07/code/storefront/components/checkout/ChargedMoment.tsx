"use client";

import { useEffect, useRef, useState } from "react";

import { playOnce, prefersLessMotion } from "@/lib/celebrate/once";

/**
 * The paid order's «تم الشحن» moment over the result's green disc
 * (`lib/celebrate/charged.ts`). Rendered ONLY in the captured branch of the
 * payment result — the server's word, never the browser's (HANDBOOK
 * «Motion») — and only with `CELEBRATIONS_ENABLED`. Once per order in this
 * browser; nothing under reduced motion. The canvas is decoration: hidden from
 * assistive technology, takes no pointer, takes no space.
 */
export function ChargedMoment({ orderId }: { orderId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Out of the page once played — a spent canvas showed as a white block on
  // Android when the customer came back (`playCharged`).
  const [done, setDone] = useState(false);

  useEffect(() => {
    const target = canvas.current;
    if (!target || prefersLessMotion()) return;
    return playOnce(`charged:${orderId}`, () =>
      import("@/lib/celebrate/charged").then((moment) => () => moment.playCharged(target, () => setDone(true))),
    );
  }, [orderId]);

  if (done) return null;

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="pointer-events-none absolute start-1/2 top-1/2 size-[300px] -translate-y-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2"
    />
  );
}

/**
 * Fetches the moment's chunk while the result still says «we are confirming»,
 * so it is cached when the captured result arrives. Draws nothing.
 */
export function WarmChargedMoment() {
  useEffect(() => {
    if (prefersLessMotion()) return;
    void import("@/lib/celebrate/charged").catch(() => undefined);
  }, []);
  return null;
}
