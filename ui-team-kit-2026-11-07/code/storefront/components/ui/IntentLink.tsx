"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A `<Link>` THAT PREFETCHES ONLY WHEN THE VISITOR REACHES FOR IT (wave 2 of
 * the Next.js practices pass, 2026-11-02). For the long lists — the home's
 * tile rows, category and product grids, pack cards, the sector strip, the
 * search suggestions and the footer menus.
 *
 * WHY. A plain `<Link>` prefetches its route as soon as it scrolls into view
 * (production only; `prefetching.md`, "Prefetch scheduling"). Each is one
 * `?_rsc=` request per URL, and none is ever answered by a cache in front of
 * the server: the edge skips every request carrying router headers
 * (`lib/edge/eligibility.ts`) and the browser keeps no RSC answer
 * (`RSC_CACHE_CONTROL` in `next.config.ts`). A home page of tile rows sent the
 * origin a render per visible tile, per visitor — most of them never tapped.
 *
 * HOW: Next's documented hover pattern (`prefetching.md`, "Hover-triggered
 * prefetch") — `prefetch={false}` until intent, then `null` (the default),
 * which lets the visible link prefetch at once. The doc listens to
 * `onMouseEnter` only; most of this store's visitors are on phones, which
 * never hover, and `<Link>`'s own touch handler does nothing while prefetch is
 * off. So a touch and a keyboard focus count as intent too. A tap on a tile
 * nobody touched before waits one round trip; the progress line and the page
 * loader (`NavigationProgress`, `PageLoader`) already cover that wait.
 *
 * Primary navigation (the header, the tab bar, the rail, the menu drawer)
 * keeps plain `<Link>`: a handful of links, tapped often.
 *
 * WHEN PARTIAL PREFETCHING IS TURNED ON (off today, `lib/config/
 * cache-components.ts`; Next's next major forces it): the doc's version is
 * `prefetch={intent ? true : "auto"}` — `"auto"` keeps the shared App Shell
 * prefetched before intent. Change the one line below then.
 */
export function IntentLink({ onMouseEnter, onTouchStart, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
