"use client";

import { useLayoutEffect, useRef } from "react";

import { useMotionTransition } from "@/lib/motion/useMotionTransition";

/**
 * A box whose height EASES to its new content when — and only when —
 * `animateKey` changes (another payment method, another region's packages).
 * Between key changes it is plain `height: auto`: Tap's card iframe resizing
 * itself, or a validation row appearing, moves the page as it always did,
 * with no animation trailing every resize.
 *
 * The old content is already gone when this runs (nothing is retained for an
 * exit — HANDBOOK «Motion», rule 8); only the box's height travels from what
 * it was to what the new content needs. Driven by the Web Animations API
 * directly — the engine Motion itself uses — so a change costs no React
 * re-render. `overflow: clip` holds only while the height moves, so focus
 * rings and popovers are never clipped at rest. Instant under reduced motion
 * and on the first render (the server's HTML is the final state).
 */
export function AutoHeight({
  animateKey,
  className,
  children,
}: {
  animateKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);
  const firstKey = useRef(animateKey);
  const transition = useMotionTransition("base");

  // The content's height as last laid out — read when the key changes, by
  // which time the DOM already holds the NEW content.
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    lastHeight.current = element.getBoundingClientRect().height;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) lastHeight.current = entry.contentRect.height;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (animateKey === firstKey.current) return;
    firstKey.current = animateKey;
    const box = outer.current;
    const content = inner.current;
    if (!box || !content || typeof box.animate !== "function") return;

    // Mid-way through a previous change, start from where the box is NOW.
    const from = running.current ? box.getBoundingClientRect().height : lastHeight.current;
    running.current?.cancel();
    running.current = null;
    const to = content.getBoundingClientRect().height;
    lastHeight.current = to;
    if (from === null || Math.abs(from - to) < 1 || transition.duration === 0) return;

    box.style.overflow = "clip";
    const animation = box.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: transition.duration * 1000,
      easing: "ease" in transition ? `cubic-bezier(${transition.ease.join(",")})` : "linear",
    });
    running.current = animation;
    const settle = () => {
      if (running.current !== animation) return;
      running.current = null;
      box.style.overflow = "";
    };
    animation.addEventListener("finish", settle);
    animation.addEventListener("cancel", settle);
  }, [animateKey, transition]);

  return (
    // `data-auto-height`: the browser journeys read this box's running
    // animations to prove reduced motion lands in one frame.
    <div ref={outer} className={className} data-auto-height="">
      <div ref={inner}>{children}</div>
    </div>
  );
}
