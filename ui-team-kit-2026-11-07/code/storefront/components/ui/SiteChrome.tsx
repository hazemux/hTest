"use client";

import { usePathname } from "next/navigation";

/**
 * The sign-in screens, and «استعادة كلمة السر» from the same comp section,
 * which the comps draw without any site chrome — and the page inside the app
 * preview's phone frame (`preview/home/frame`, Plan 4b), because the customer
 * app has no website header, footer or tab bar to preview.
 */
const STANDALONE = /^\/(ar|en)\/(account\/(sign-(in|up)|password\/forgot)|preview\/home\/frame)(\/|$)/;

/**
 * The checkouts — the basket's and a single item's — which the checkout
 * redesign (2026-09-30, «Checkout Mobile») draws on the phone with only a back
 * arrow and the title: no navbar and no tab bar, so the one pay button can sit
 * at the very bottom of the screen. The desktop keeps the site header.
 *
 * The order's page and the payment result («Order Details Mobile», «Payment
 * Result Mobile») are drawn the same way: their own bar — back and the
 * invoice, or the logo and close — and no tab bar; so is the profile form
 * («Profile Mobile»), whose «حفظ التغيير» sits where the tab bar would.
 */
const FOCUSED_ON_PHONE = /^\/(ar|en)\/(cart\/checkout|checkout\/[^/]+|order-status\/[^/]+|payment\/return|account\/profile)\/?$/;

/** «Search Mobile» R1: the results page's own header replaces the site header on the phone. */
const HEADERLESS_ON_PHONE = /^\/(ar|en)\/search\/?$/;

/**
 * The pages whose phone header keeps the HAMBURGER: the home page and the
 * places the drawer and the tab bar lead to — the hubs a customer navigates
 * FROM. Every other page (a product, a deep category, an information page,
 * an account sub-screen) draws the back arrow in the menu's place
 * (`PhoneNavControl`): there the customer arrived from somewhere and the way
 * out they reach for is back, not a site map.
 *
 * AN ALLOW-LIST OF HUBS, not a list of arrow pages, so a page added later
 * gets the arrow by default — the side that still always works (Back is
 * never a dead control, the drawer's rows are one tap from any hub).
 */
const MENU_ON_PHONE = /^\/(ar|en)(\/(categories|cart|preview\/home|account(\/(orders|favourites|points|saved-accounts|settings|vip))?))?\/?$/;

export function hasMenuOnPhone(path: string): boolean {
  return MENU_ON_PHONE.test(path.split("?")[0] ?? "");
}

export function isStandalonePath(path: string): boolean {
  return STANDALONE.test(path.split("?")[0] ?? "");
}

export function isFocusedOnPhone(path: string): boolean {
  return FOCUSED_ON_PHONE.test(path.split("?")[0] ?? "");
}

/**
 * The announcement, header, footer and tab bar — shown on every page except the
 * standalone sign-in screens (`6507:13689` / `6847:78138`), and hidden below
 * `lg` on the checkouts.
 *
 * DECIDED FROM THE LIVE URL, not in the layout. The layout used to test the
 * path it was rendered with (a request header the proxy set, gone since the
 * shell is shared — ADR 0046 §1), and a layout does not re-render on a
 * client navigation: a customer who opened sign-in and tapped the logo got a
 * home page with NO header and NO tab bar — the chrome stayed switched off for
 * the page they had landed on. The chrome is still rendered by the server (it
 * is passed in as children); this only decides whether it is drawn.
 */
export function SiteChrome({ children, header = false }: { children: React.ReactNode; header?: boolean }) {
  const path = usePathname() ?? "";
  if (isStandalonePath(path)) return null;
  // The results page draws its own phone header (back + the query), so the
  // SITE header — the first SiteChrome in the layout, passed `header` — goes
  // away below `lg` there. The footer and tab bar sit in a second SiteChrome
  // and stay.
  if (header && HEADERLESS_ON_PHONE.test(path.split("?")[0] ?? "")) return <div className="contents max-lg:hidden">{children}</div>;
  // `contents` from `lg`: the wrapper draws no box, so the header's sticky
  // positioning and the body's flex column behave exactly as without it.
  if (isFocusedOnPhone(path)) return <div className="contents max-lg:hidden">{children}</div>;
  return children;
}
