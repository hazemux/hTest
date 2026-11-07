"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ComponentProps, type MouseEvent } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { backFallback, previousEntryIsOurs, stampHistoryEntry } from "@/lib/navigation/history";

import { MobileMenu } from "./MobileMenu";
import { hasMenuOnPhone } from "./SiteChrome";

/**
 * The phone header's leading control: the hamburger on the hub pages, the
 * back arrow everywhere else (`hasMenuOnPhone`).
 *
 * DECIDED FROM THE LIVE URL. The header is rendered by the locale layout,
 * which does not re-render on a client navigation and, with the shell shared,
 * never knows the page at all — so the choice is made here, from
 * `usePathname()`, the same way `SiteChrome` and `ReturnPathInput` decide
 * theirs.
 */
export function PhoneNavControl(props: ComponentProps<typeof MobileMenu>) {
  const livePath = usePathname() ?? `/${props.locale}`;

  return hasMenuOnPhone(livePath) ? <MobileMenu {...props} /> : <BackArrow locale={props.locale} path={livePath} />;
}

/**
 * Positions every history entry for browsers without the Navigation API
 * (`lib/navigation/history.ts`). Keyed on the query too: a filter change is a
 * history entry of its own. Mounted once by the locale layout, OUTSIDE the
 * site chrome, so the sign-in screens — which draw no chrome — are counted
 * too. Wrap it in `<Suspense>`: it reads the search params.
 */
export function HistoryStamp() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();

  useEffect(() => {
    stampHistoryEntry();
  }, [pathname, search]);

  return null;
}

/**
 * Back, as the browser means it. A REAL LINK to the nearest hub, so it works
 * before the script loads and for a customer who landed here from outside;
 * once hydrated, a tap whose previous entry is a page of ours is
 * `history.back()` instead — the page they actually came from, with its
 * scroll and filters, and no new entry pushed on top.
 *
 * THE DESIGN SYSTEM'S BACK ARROW, the same `icon-chevron-start` the checkout,
 * search and sign-in bars draw: it points left as drawn, which is back in
 * English, and is mirrored to point right on the Arabic page. Its box is the
 * hamburger's own 24px, so the logo beside it does not move.
 */
export function BackArrow({ locale, path }: { locale: Locale; path: string }) {
  const m = messagesFor(locale);

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // A modified click (new tab, new window) is the browser's, not ours.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!previousEntryIsOurs()) return;
    event.preventDefault();
    window.history.back();
  }

  return (
    <Link href={backFallback(path)} onClick={onClick} aria-label={m.nav.back} className="flex size-6 shrink-0 items-center justify-center">
      <span
        aria-hidden
        className="block size-6 bg-[var(--color-ink)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5.5px_11.5px] rtl:-scale-x-100"
      />
    </Link>
  );
}
