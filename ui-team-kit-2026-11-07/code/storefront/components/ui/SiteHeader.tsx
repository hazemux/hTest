import { SearchDropdown } from "@/components/search/SearchDropdown";
import Image from "next/image";
import Link from "next/link";

import { listMenus } from "@/lib/api/client";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/catalog/tags";
import type { Locale } from "@/lib/i18n/locales";
import { isExternal, menuHref } from "@/lib/catalog/menu-href";
import { categoryLanding } from "@/lib/catalog/queries";
import { tabIcon } from "@/lib/catalog/nav-tab";
import { messagesFor } from "@/lib/i18n/messages";

import { HeaderCartLink } from "@/components/cart/CartBadge";
import { NavRail } from "./NavRail";
import { CountryPill } from "./header/CountryPill";
import { AccountMenuSlot, PhoneAccountSlot, RewardsChipSlot } from "./header/HeaderSlots";

type MenuItem = {
  label: Record<string, string>;
  type: string;
  target: string;
};

/**
 * Header, built to the desktop comps (Figma 4317:45255) — and still fed by the
 * ADMIN rather than by this file.
 *
 * The comp draws five fixed tabs. They are NOT hardcoded here: menus are rows
 * the owner edits (CC3), so adding a link stays a save in the panel and never
 * a deploy. The design supplies the SHAPE of the row; the admin supplies its
 * contents, and an empty menu renders no row rather than a fallback set of
 * invented links.
 *
 * THE CART IS THE ONE THING THE COMP DRAWS THAT NOTHING SERVES. It renders
 * from a prop nobody passes, so it does not appear: a basket that cannot hold
 * anything is worse than an honest gap, and checkout is one item per order by
 * design. The markup is written and correct for the day it ships.
 *
 * THE REWARDS CHIP (ADR 0043, Claude Design `SiteHeader`) replaced the old
 * points pill. A member's chip shows their available Charger Points and, on
 * desktop, what they are worth — the SERVER's figure from `GET /wallet`, in
 * the browsing currency; a guest's says what the programme is, never «0».
 * It opens the rewards panel: a dropdown anchored to the chip on desktop, a
 * bottom sheet on the phone (a modal, so it never sits over the support chat
 * in a corner). The panel's data loads when it opens (`RewardsChip`); the
 * header's one wallet read (`headerViewer`) is all the chip needs.
 *
 * A SIGNED-IN CUSTOMER WHOSE WALLET COULD NOT BE READ GETS NO CHIP — not the
 * guest pitch, and not a zero standing in for a balance nobody read.
 *
 * THIS HEADER IS SHARED BY EVERY VISITOR (ADR 0046 §1): it takes the locale
 * and nothing else. What is the visitor's — the drawer and account menu, the
 * rewards chip, the VIP row, the basket count and the country pill — is drawn
 * by slots that stream in their own Suspense boundaries
 * (`header/HeaderSlots.tsx`, the basket's `HeaderCartLink` in
 * `cart/CartBadge.tsx`, and the country pill's `header/CountryPill.tsx`),
 * each with a fallback the size of what lands in it.
 *
 * THE ACCOUNT CONTROL IS THE MENU behind the `6627:13305` trigger, its panel
 * Claude Design «AccountMenu» / «AccountMenuGuest» (2026-10). It still does
 * the job the plain link did — greet a signed-in customer by name, offer a
 * guest the way in — and adds the cards, tiles and rows the design puts
 * behind it. It renders only the rows whose routes exist;
 * `lib/account/menu.ts` is where that is decided, and is the file to edit
 * when a route arrives.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  let header: MenuItem[] = [];
  // Where a category row lands — never its short path's redirect (`lib/catalog/landing.ts`).
  const landingRead = categoryLanding(locale);
  try {
    const menus = await listMenus({
      locale,
      next: { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["menu"] },
    });
    header = (menus.data?.header ?? []) as MenuItem[];
  } catch {
    // The navigation is not worth a 500. If the API is briefly unreachable the
    // page still renders with its logo and switchers, and the customer can
    // still use a link they already have.
    header = [];
  }

  const landing = await landingRead;

  return (
    <header className="bg-[var(--color-surface)]">
      <div className="mx-auto w-full max-w-[1248px] px-6">
        {/* THE PHONE'S HEADER — Figma `6847:97681`. Three things and no more:
            the logo, the hamburger, and the country pill.

            DOM ORDER IS LOGO+MENU FIRST, PILL SECOND, and that is the opposite
            of the Figma export's order — deliberately. The comp is authored as
            a left-to-right frame, so its first child sits on the LEFT of the
            rendered Arabic screen: the country pill. Under `dir=rtl` a first
            child sits on the RIGHT, so porting the export's order verbatim
            would mirror the header away from the comp it came from. What the
            designer drew for Arabic is pill-left, logo-right; this order is
            what produces that, and English mirrors it for free.

            The TabBar's docblock records the opposite case — there the export
            order and the RTL rendering agreed. They do not always, so each
            frame is checked against its own rendered PNG rather than against a
            rule of thumb.

            NO SEARCH BAR HERE. The comp puts it on the HOME page, below this
            row and above the hero, and it is absent from the product and menu
            frames entirely — so it belongs to that page, not to the shared
            chrome. `components/home/HomeSearch.tsx`. */}
        <div className="flex items-center justify-between gap-4 py-4 lg:hidden">
          {/* MENU FIRST, then the logo — `6847:97688` puts the menu icon at the
              row's outer edge (x312 of 360 in the Arabic frame) with the logo
              8px inside it, so under `dir=rtl` the menu leads. Off the hub
              pages the same slot holds the back arrow (`PhoneNavControl`).

              `shrink-0`, here and on the link: the logo is an `<img>` under
              preflight's `max-width: 100%`, so a group allowed to shrink let
              the pill squeeze it to nothing (2026-10-11, 360px English). The
              logo keeps the comp's 108×36 and the pill side gives way
              (`CountrySwitcher`). */}
          <div className="flex shrink-0 items-center gap-2">
            <PhoneAccountSlot locale={locale} />
            <Link href={`/${locale}`} aria-label={m.common.storeName} className="shrink-0">
              {/* TWO EXPORTS, ONE OF THEM HIDDEN. The logo's wordmark is
                  near-black; on the dark theme's #212121 header it disappears
                  entirely. `-light` is the designer's own export for dark
                  grounds — a separate drawing, not a filter over this one — so
                  the choice is which file to show, and only CSS knows the
                  theme at paint time. `alt` sits on the visible one and the
                  hidden twin is `aria-hidden`, so a screen reader hears the
                  store's name once rather than twice. */}
              {/* The phone comp's logo is the WIDE lockup at 36px
                  (`6847:97689`, 108×36), not the stacked mark the desktop
                  header uses. */}
              <Image
                src="/brand/logo-chargerquick-wide.svg"
                alt={m.common.storeName}
                width={321}
                height={106}
                className="cq-light-theme-only h-9 w-auto"
              />
              <Image
                src="/brand/logo-chargerquick-wide-light.svg"
                alt=""
                aria-hidden
                width={321}
                height={106}
                className="cq-dark-theme-only h-9 w-auto"
              />
            </Link>
          </div>

          {/* The rest of the row: the chip and the basket keep their size, and
              the country pill takes what is left (`flex-1` inside). */}
          <div className="flex flex-1 items-center justify-end gap-2">
            {/* The rewards chip, compact — its panel is the phone's bottom sheet. */}
            <RewardsChipSlot locale={locale} variant="compact" />
            <CountryPill locale={locale} />
            {/* THE BASKET, ON THE PAGES WITHOUT A TAB BAR ONLY. The phone's
                tab bar owns the cart everywhere else; the product page gives
                the bar's place to its buy bar («Product Page Mobile»), and
                draws the basket here instead — globals.css shows this link
                exactly when `[data-buy-bar]` hides the tab bar, so the two
                never appear together and the basket never disappears. */}
            <HeaderCartLink locale={locale} variant="phone" />
          </div>
        </div>

        {/* Row one. DOM order logo → search → account → country, which under
            `dir=rtl` on <html> puts the logo on the RIGHT exactly as drawn and
            mirrors correctly for English without a conditional.

            IT WRAPS, and it has to. Everything after the search box is
            `shrink-0`, so on a 360px phone the row used to run off the side of
            the screen and take the page's horizontal scroll with it — the
            greeting and the points pill, added when accounts shipped, are what
            tipped it over. `flex-wrap` plus a search box that may drop to its
            own line keeps the controls reachable at 360px without a breakpoint
            conditional deciding which of them a phone is allowed to have. */}
        {/* `6883:34338`: the row starts 16px under the announcement bar and is
            96px tall (the logo's own height); the rail follows 24px below.
            `lg:min-h-[66.5px]` is the rewards chip's 50.5px box plus this
            row's `pt-4` (the height is the border box): a member whose wallet
            could not be read gets no chip, and the row must not lose height
            when that answer streams in, whatever the logo does. */}
        <div className="hidden flex-wrap items-center gap-x-4 gap-y-3 pt-4 lg:flex lg:min-h-[66.5px]">
          <Link href={`/${locale}`} className="shrink-0" aria-label={m.common.storeName}>
            {/* The dark twin, as in the phone header above. */}
            <Image
              src="/brand/logo-chargerquick.svg"
              alt={m.common.storeName}
              width={86}
              height={96}
              // 48px on a phone, full size from `lg`. At 86x96 this ate a
              // third of a 360px header and pushed the switchers onto a third
              // row; the mobile comp's nav row carries no logo block at all,
              // so shrinking it is the smallest change that respects both the
              // comp's proportions and the home affordance.
              className="cq-light-theme-only h-12 w-auto lg:h-24"
            />
            {/* The SAME stacked mark with a white wordmark — it was the wide
                lockup, a different shape, so the dark header's logo was
                three times wider than the light one's. */}
            <Image
              src="/brand/logo-chargerquick-mark-light.svg"
              alt=""
              aria-hidden
              width={86}
              height={96}
              className="cq-dark-theme-only h-12 w-auto lg:h-24"
            />
          </Link>

          {/* The comp shows static placeholder text; this is a real control, and
              since ADR 0027 it answers while the customer types. It is still a
              plain GET form to the results page (`SearchDropdown` draws it), so
              it works before the script loads. `order-last basis-full` below
              `sm` puts the search on its own line under the controls; from
              `sm` it returns to the middle of the row, as the desktop comp
              draws it. */}
          <SearchDropdown locale={locale} className="order-last basis-full sm:order-none sm:flex-1 sm:basis-auto" />

          {/* WHERE THE ACCOUNT LINK WAS. The comp (`6627:13305`) puts a menu
              trigger here — "القائمة و تسجيل الدخول" — and the panel behind it
              carries the account rows, so the single link this replaces is now
              one card inside it. Everything that decides WHAT the panel shows
              lives in `AccountMenu` and `lib/account/menu.ts`; the header
              passes display facts only (the name, the frame, the level and the
              formatted points), and never the session. */}
          <AccountMenuSlot locale={locale} />

          {/* THE REWARDS CHIP where the wallet pill was (`6883:34351`) — the
              balance and its worth, opening the rewards dropdown under it. */}
          <RewardsChipSlot locale={locale} variant="desktop" />

          {/* ALWAYS RENDERED NOW. This sat behind `cartCount !== undefined`
              with nothing on earth passing the prop — the comp drew a cart and
              the markup was correct and dead, which is this codebase's most
              familiar failure. The cart exists, so the control does. An empty
              cart still shows: a customer looking for their basket needs to
              find it and be told it is empty, not find nothing at all. */}
          {/* DESKTOP ONLY. The mobile comp's header carries the logo, the
              menu and a country pill — nothing else — because the bottom tab
              bar already owns the cart. Two cart controls on one phone screen
              is one more than the design draws. */}
          <HeaderCartLink locale={locale} variant="desktop" />

          {/* THE COUNTRY PILL, as the desktop comp draws it (`6883:34340`) —
              the same control the phone header carries, at the desktop size.
              It replaced a currency dropdown and a language dropdown that the
              comp never drew: picking a country sets the currency
              (`/api/preferences`), which is the override a customer abroad
              needs, and language lives in the account menu's own row. */}
          <CountryPill locale={locale} size="lg" />
        </div>

        {/* Row two: the tab rail — Figma "Navbar" (`6883:34451`). Desktop
            only: the phone comp (`6847:97392`) has no rail, and the bottom tab
            bar is the phone's navigation. `NavRail` decides the current tab
            from the live URL; see its docblock for why that cannot happen
            here. */}
        {header.length > 0 ? (
          <NavRail
            locale={locale}
            items={header.map((item) => {
              const href = menuHref(item, locale, landing);
              return {
                key: `${item.type}:${item.target}`,
                href,
                label: item.label[locale] ?? item.label.en ?? "",
                icon: tabIcon(item),
                /* The HOME row is seeded as an `external_url` so it cannot be
                   unpublished like a content page — but its target is `/`,
                   which is this site. The new-tab treatment is for links that
                   actually LEAVE. */
                leaves: isExternal(item) && !href.startsWith("/"),
              };
            })}
          />
        ) : null}
      </div>
    </header>
  );
}
