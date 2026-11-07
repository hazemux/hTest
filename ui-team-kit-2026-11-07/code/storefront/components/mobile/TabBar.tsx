"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { accountHref, authHref } from "@/lib/account/auth-href";
import { isCurrentTab } from "@/lib/catalog/nav-tab";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The mobile bottom tab bar — Figma `6847:98186`.
 *
 * MOBILE ONLY (`lg:hidden`) and FIXED. Desktop keeps the header rail; this is
 * the phone's primary navigation, and in a mobile-majority market it is the
 * most-touched control in the storefront.
 *
 * THE PLATE IS AN EXPORTED SVG, not a CSS shape. The comp's bar is a rectangle
 * with a circular notch bitten out of the top-centre for the floating home
 * button — a border-radius cannot describe that, and an approximation would
 * show as a seam against the button sitting in it. How it is SIZED is the
 * subtle part, and is explained where it happens below.
 *
 * EVERY DESTINATION EXISTS. Five slots, five live routes — checked when this
 * was written, and the rule if that ever changes is the account menu's
 * (`lib/account/menu.ts`): a row whose route does not exist is not drawn.
 */

interface Slot {
  key: "cart" | "orders" | "favourites" | "account";
  icon: string;
  href: (locale: Locale) => string;
}

/**
 * In the comp's reading order — and under `dir=rtl` the FIRST child sits on
 * the right, which is exactly how the comp reads. No conditional mirroring.
 */
const START_SLOTS: readonly Slot[] = [
  { key: "cart", icon: "cart", href: (l) => `/${l}/cart` },
  { key: "orders", icon: "orders", href: (l) => `/${l}/account/orders` },
];

const END_SLOTS: readonly Slot[] = [
  { key: "favourites", icon: "favourites", href: (l) => `/${l}/account/favourites` },
  // `profile`, not `account`: the exported asset is `icon-tab-profile.svg` and
  // always has been. `icon` names the FILE and `key` names the dictionary
  // entry, and the two happen to agree for every other slot — so this one slot
  // has been requesting `/brand/icon-tab-account.svg` and getting a 404 on
  // every mobile page view, with an empty space above the label where the icon
  // belongs.
  { key: "account", icon: "profile", href: (l) => `/${l}/account` },
];

/**
 * The ONE lit tab: of every slot whose link contains the current path, the
 * most specific. «طلباتي» (`/account/orders`) and «المفضلة»
 * (`/account/favourites`) sit under «حسابي» (`/account`), and a prefix test on
 * its own lit both at once.
 */
export function currentTabKey(path: string, locale: Locale): string | null {
  let best: { key: string; length: number } | null = null;
  for (const slot of [...START_SLOTS, ...END_SLOTS]) {
    const href = slot.href(locale);
    if (isCurrentTab(path, href, locale) && (!best || href.length > best.length)) {
      best = { key: slot.key, length: href.length };
    }
  }
  return best?.key ?? null;
}

/**
 * Hide on the way down, return on the way up — the standard phone pattern the
 * owner asked for (2026-09-29). Scrolling down means reading, and the bar is
 * 90px of a 800px screen; scrolling up means looking for somewhere to go.
 *
 * A DEAD ZONE of a few pixels, so the bar does not flicker on the jitter of a
 * finger resting on the glass, and it never hides within the first screenful
 * — at the top of a page there is nothing to make room for. Every navigation
 * brings it back: a new page starts with its navigation showing.
 */
export function useHideOnScroll(resetKey: string): boolean {
  const [hidden, setHidden] = useState(false);

  // A new page starts with the bar showing (React's "adjust state while
  // rendering" pattern — no effect needed to reset on a changed key).
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setHidden(false);
  }

  useEffect(() => {
    let last = window.scrollY;

    // Straight from the event, no requestAnimationFrame gate: browsers already
    // deliver scroll at most once a frame, and setting the same boolean again
    // is a no-op React skips.
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      if (Math.abs(delta) < 8) return;
      setHidden(delta > 0 && y > 80);
      last = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return hidden;
}

/**
 * `cartCount` and `signedIn` are the visitor's (`TabBarForVisitor`). Left
 * out — the shared shell's bar, before the visitor's streams in — the basket
 * shows no count and «حسابي» takes the one link true for a guest and a member
 * alike (`accountHref`): never a member sent to sign in.
 */
export function TabBar({ locale, cartCount = 0, signedIn }: { locale: Locale; cartCount?: number; signedIn?: boolean }) {
  const m = messagesFor(locale);
  // THE LIVE PATH, not a prop from the layout. The layout does not re-render
  // on a client-side navigation, so a path it passed down was the page the
  // customer LANDED on — the bar kept «الرئيسية» lit on every page reached
  // from home, and lit nothing on home when they came back to it.
  const path = usePathname() ?? `/${locale}`;
  const hidden = useHideOnScroll(path);

  // What sits above the bar (the checkout's pinned pay button) follows it
  // down — globals.css, `data-tabbar`. An attribute rather than shared state:
  // the button is in a different tree of the layout.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tabbar = hidden ? "hidden" : "shown";
    return () => {
      delete root.dataset.tabbar;
    };
  }, [hidden]);
  const lit = currentTabKey(path, locale);
  const home = `/${locale}`;
  const homeCurrent = isCurrentTab(path, "/", locale);

  return (
    <nav
      aria-label={m.tabBar.aria}
      // `cq-tab-bar`: globals.css removes it while the drawer is open — the
      // drawer covers the screen, and the bar sitting on top of its backdrop
      // was a second, live navigation over a modal one.
      className={`cq-tab-bar fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out motion-reduce:transition-none lg:hidden ${
        // The plate's height AND the home button's overhang above it — the
        // button sits ~42% of its size above the plate, and `translate-y-full`
        // alone left an 18px blue sliver on screen.
        hidden ? "translate-y-[calc(100%+32px)]" : "translate-y-0"
      }`}
    >
      {/* EVERYTHING HERE SCALES IN `vw`, and it has to.

          The plate is a 360x71 SVG with a circular notch bitten out of its top
          edge. Stretched to a 390px phone (the inline <svg> uses
          `preserveAspectRatio="none"`), the notch would become an ELLIPSE
          while the 44px button stayed a circle — a white crescent
          showed around it. Scaling both from the same viewport unit keeps the
          notch circular and the button inside it at every width. */}
      <div className="relative w-full">
        <div className="relative aspect-[360/71] w-full">
          {/* THE PLATE IS AN INLINE <svg> (2026-10-11). As an <img> it was the
              category page's LCP element; as a CSS background it was still an
              LCP candidate (Chrome counts background images) and was fetched
              only after the CSS, so the bar showed without its plate for
              ~0.8 s. Inline shapes are not LCP candidates and cost no request.
              The <svg> is `preserveAspectRatio="none"` on a 360x71 viewBox,
              and its box keeps the 360/71 ratio (`aspect-[360/71]`), so the
              notch stays circular as the rest of this bar scales in `vw`.
              Path from Figma 6847:98186, with the one fixed fill both themes
              showed. */}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 360 71"
            preserveAspectRatio="none"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 h-full w-full"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M150.376 20.9664C142.356 11.0086 132.314 0 119.528 0L2 0C1.05719 0 0.585786 0 0.292893 0.292893C0 0.585786 0 1.05719 0 2V69C0 69.9428 0 70.4142 0.292893 70.7071C0.585786 71 1.05719 71 2.00001 71H358C358.943 71 359.414 71 359.707 70.7071C360 70.4142 360 69.9428 360 69V2C360 1.05719 360 0.585786 359.707 0.292893C359.414 0 358.943 0 358 0L240.473 0C227.687 0 217.645 11.0086 209.625 20.9664C202.722 29.5366 192.018 35.039 180 35.039C167.983 35.039 157.278 29.5366 150.376 20.9664Z"
              fill="#007BBF"
            />
          </svg>

          {/* Centred ON the plate's top edge, where the notch is cut.

              `left-1/2`, NOT `start-1/2`: under RTL `start-1/2` resolves to
              `right: 50%` and the `-translate-x-1/2` then pushes the button
              further from centre instead of back to it. */}
          <Link
            href={home}
            aria-current={homeCurrent ? "page" : undefined}
            className={`absolute left-1/2 top-0 flex aspect-square w-[12.2vw] max-w-[52px] -translate-x-1/2 -translate-y-[42%] items-center justify-center rounded-full bg-[var(--color-brand-500)] transition-transform active:scale-95 ${
              homeCurrent ? "text-[var(--color-secondary)]" : "text-[var(--color-on-primary)]"
            }`}
          >
            {/* `6847:98186`: the Outline home in white, the Bold home in the
                secondary yellow when home is the page. */}
            <TabGlyph name="home" current={homeCurrent} className="w-[7vw] max-w-[28px]" />
            <span className="sr-only">{m.tabBar.home}</span>
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[62%] items-center px-2">
        {START_SLOTS.map((slot) => (
          <TabSlot key={slot.key} slot={slot} locale={locale} current={lit === slot.key} count={slot.key === "cart" ? cartCount : 0} />
        ))}

        {/* The home LABEL, under the floating button — one control, drawn in
            two pieces by the comp. */}
        <span
          className={`flex-1 text-center text-caption leading-[1.5] ${
            homeCurrent ? "text-[var(--color-secondary)]" : "text-[var(--color-on-primary)]"
          }`}
        >
          {m.tabBar.home}
        </span>

        {END_SLOTS.map((slot) => (
          <TabSlot
            key={slot.key}
            slot={slot}
            locale={locale}
            current={lit === slot.key}
            // A GUEST's «حسابي» is the way in: sign-in, coming back to this
            // page afterwards rather than to the account home. A member, or
            // not known yet: the account, carrying this page (`accountSlotHref`).
            hrefOverride={slot.key === "account" ? accountSlotHref(locale, signedIn, path) : undefined}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * A member's «حسابي» and the not-yet-known one are the same link — the
 * account, carrying this page: a member's account page ignores `next`, and
 * one whose session has expired is sent to sign in and back here. Only a
 * known guest goes straight to sign-in.
 */
function accountSlotHref(locale: Locale, signedIn: boolean | undefined, path: string): string {
  return signedIn === false ? authHref(locale, "sign-in", path) : accountHref(locale, path);
}

/**
 * A tab's glyph, as a MASK filled with the label's colour.
 *
 * The comp's active tab (`6847:94924` basket, `6847:92118` orders,
 * `6847:89691` favourites, `6847:91146` account, `6847:98186` home) is the
 * pack's BOLD glyph in `secondary-main`; the others are its OUTLINE glyph in
 * white. Two files per tab, one weight each — and the colour comes from
 * `currentColor`, so the dark theme's lifted yellow applies without a third.
 */
function TabGlyph({ name, current, className = "size-6" }: { name: string; current: boolean; className?: string }) {
  const src = `url(/brand/icon-tab-${name}${current ? "-active" : ""}.svg)`;
  return (
    <span
      aria-hidden
      className={`block aspect-square shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
      style={{ maskImage: src, WebkitMaskImage: src }}
    />
  );
}

/**
 * One tab. The basket's carries its count («Tab Bar», 2026-09-30): the
 * danger red with a ring in the bar's own blue, «9+» past nine.
 */
function TabSlot({
  slot,
  locale,
  current,
  count = 0,
  hrefOverride,
}: {
  slot: Slot;
  locale: Locale;
  current: boolean;
  count?: number;
  hrefOverride?: string;
}) {
  const m = messagesFor(locale);
  const href = hrefOverride ?? slot.href(locale);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      // `secondary-main` for the current tab, white for the rest — tokens, not
      // literals, because the dark theme redefines both.
      // `active:` press, the cards' own: a subtle shrink under the finger.
      className={`flex flex-1 flex-col items-center gap-1 transition-transform active:scale-95 ${
        current ? "text-[var(--color-secondary)]" : "text-[var(--color-on-primary)]"
      }`}
    >
      <span className="relative">
        <TabGlyph name={slot.icon} current={current} />
        {count > 0 ? (
          <span
            dir="ltr"
            aria-label={m.tabBar.cartCount.replace("{count}", String(count))}
            className="absolute -end-[9px] -top-1.5 h-[18px] min-w-[18px] rounded-full bg-[var(--color-danger)] px-[5px] text-center text-caption-xs font-bold leading-[18px] text-[var(--color-on-primary)] shadow-[0_0_0_2px_var(--color-brand-500)]"
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </span>
      <span className="text-caption leading-[1.5]">{m.tabBar[slot.key]}</span>
    </Link>
  );
}
