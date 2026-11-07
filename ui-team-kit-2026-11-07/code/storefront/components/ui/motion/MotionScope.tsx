"use client";

import { LazyMotion } from "motion/react";

const loadFeatures = () => import("./features").then((module) => module.default);

/**
 * WHERE MOTION'S `m` MAY RENDER (ADR 0041, HANDBOOK «Motion»). Wrapped around
 * each presence site — the component that renders `m`, not the layout — so a
 * page that never animates presence or height ships none of Motion's render
 * core: measured 2026-10-07, a layout-wide provider put ~11 KB gzipped of it
 * into every page's first load. Nested scopes share the one features chunk,
 * fetched after hydration; `strict` throws if a full `motion.*` component
 * slips in. Until the features arrive an `m` element renders in its final
 * state — the server's HTML — so nothing waits on them.
 *
 * No `MotionConfig`: every transition comes from `useMotionTransition()`,
 * which is instant under reduced motion (Motion's own `reducedMotion="user"`
 * still fades opacity).
 */
export function MotionScope({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
