"use client";

import { useEffect, useRef, useState } from "react";

import { prefersLessMotion } from "@/lib/celebrate/once";

import { TIER_ARTWORK } from "./art";
import { TierMark } from "./parts";

/**
 * A badge that lands as a spinning coin first (`lib/celebrate/coin.ts`,
 * `CELEBRATIONS_ENABLED`): `rim` names the rim's colour (a level code — the
 * coin reads that level's token), `art` goes on its faces, and `children` —
 * the badge at rest — is in the page the whole time, invisible while the coin
 * flies and shown in its place after. A coin that cannot play (no WebGL,
 * reduced motion, a failed chunk) leaves exactly the badge.
 */
export function LandingCoin({ rim, art, size, children }: { rim: string; art: string | null; size: number; children: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [flying, setFlying] = useState(true);

  useEffect(() => {
    const target = canvas.current;
    if (!target || prefersLessMotion()) {
      setFlying(false);
      return;
    }
    let stop: () => void = () => undefined;
    let cancelled = false;
    void import("@/lib/celebrate/coin")
      .then((coin) => {
        if (!cancelled) stop = coin.playTierCoin(target, size, rim, art, () => setFlying(false));
      })
      .catch(() => setFlying(false));
    return () => {
      cancelled = true;
      stop();
    };
  }, [rim, art, size]);

  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className={flying ? "invisible" : "block"}>{children}</span>
      {flying ? <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" /> : null}
    </span>
  );
}

/** The level-up toast's badge: the new level's mark on a coin in its colour. */
export function TierCoin({ code, size }: { code: string; size: number }) {
  return (
    <LandingCoin rim={code} art={TIER_ARTWORK[code] ?? null} size={size}>
      <TierMark code={code} size={size} />
    </LandingCoin>
  );
}
