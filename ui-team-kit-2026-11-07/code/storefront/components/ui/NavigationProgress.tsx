"use client";

import { useSyncExternalStore } from "react";

import { useNavigationWait } from "@/lib/navigation/useNavigationWait";

function noSubscription(): () => void {
  return () => undefined;
}

/**
 * THE LINE AT THE TOP OF THE SCREEN WHILE A PAGE IS ON ITS WAY. When it
 * starts and ends is `useNavigationWait` (shared with `PageLoader`). The
 * 150 ms before it shows is CSS (`.cq-nav-progress`), so a cached or
 * prefetched page never flashes it.
 *
 * Renders `aria-hidden`: the browser and the page announce navigation
 * themselves. Wrap in `<Suspense>`: it reads the search params.
 *
 * IT CAN ONLY SHOW ONCE IT IS HYDRATED, and its boundary hydrates late: on a
 * slow device a link elsewhere is hydrated and tapped first, and React then
 * finishes the navigation before this boundary (CI run 38325222024; ~2 s
 * after load at 6× CPU throttling). A start announced meanwhile is picked up
 * when it does hydrate, if the page has not arrived yet (`useNavigationWait`).
 * `data-hydrated` says it is listening — what a journey waits for before it
 * taps (`e2e/journeys/motion.spec.ts`).
 */
export function NavigationProgress() {
  const waiting = useNavigationWait();
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div className="cq-nav-progress" aria-hidden data-active={waiting !== null || undefined} data-hydrated={hydrated || undefined} />
  );
}
