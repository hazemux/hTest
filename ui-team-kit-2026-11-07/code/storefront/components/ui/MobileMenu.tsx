"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";

import { signOut } from "@/lib/account/actions";
import { renderableColumns, type AccountMenuItemKey } from "@/lib/account/menu";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { pointsUnit } from "@/lib/i18n/points-plural";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { TRADE_LICENCE_NUMBER } from "@/lib/content/business";
import { NO_FRAME, type AvatarFrame } from "@/lib/loyalty/frame";
import { AvatarRing } from "@/components/loyalty/vip/AvatarRing";
import { VipChip } from "@/components/loyalty/vip/VipChip";
import { VipCrestMono } from "@/components/loyalty/vip/VipCrest";

import { useIdlePreload } from "./motion/useIdlePreload";
import { AuthLink } from "./AuthLink";
import { LocaleSegment } from "./PreferenceSwitchers";
import { ThemeSwitch } from "./ThemeToggle";

/**
 * The animated layer (Motion's presence wrapper and `m` elements) is its own
 * chunk, so the layout that renders this menu on every page does not ship
 * Motion's render core up front. See `MobileMenuDrawer.tsx`.
 *
 * A chunk that fails to load (a flaky connection, a tab left open across a
 * deploy) must not take the page down with it: the animation is decoration,
 * so the menu then simply stays on its plain-element copy.
 */
const MobileMenuDrawer = lazy(() => import("./MobileMenuDrawer").catch(() => ({ default: PlainMobileMenuDrawer })));

/**
 * The mobile drawer behind the hamburger — «Side Menu Mobile» (Claude Design,
 * 2026-09-30), replacing Figma `6847:85421`.
 *
 * A LIGHT SURFACE, 300 WIDE, IN THREE PARTS:
 *   - the top: the logo and a close button, then WHO — a signed-in customer's
 *     character, name and points, opening the account; a guest's short
 *     welcome with «تسجيل الدخول» and «إنشاء حساب جديد»;
 *   - two labelled groups of 40-tall rows, «تسوّق» and «حسابي», the page the
 *     customer is on lit;
 *   - a footer for PREFERENCES, not places: the language as an العربية /
 *     English segment, dark mode as a real switch, and sign-out in red.
 *
 * THE ROWS STILL COME FROM `lib/account/menu.ts` (`renderableColumns()`): a
 * row is drawn only when its route exists. The drawer only regroups them.
 * The account rows are a signed-in customer's; a guest sees the shop group.
 *
 * OPENS FROM THE START SIDE — the same side as the hamburger that summons it,
 * which is the right under `dir=rtl` and the left in English. Written with
 * logical properties (`start-0`, `rounded-e-[26px]`) so that mirroring is the
 * document's job and there is no direction conditional to get wrong.
 */
const SHOP_KEYS: readonly AccountMenuItemKey[] = ["categories", "favourites"];
const MINE_KEYS: readonly AccountMenuItemKey[] = ["orders", "wallet", "vip", "savedAccounts", "profile", "settings"];

export function MobileMenu({
  locale,
  signedIn,
  customerName,
  customerAvatar = null,
  pointsBalance = null,
  avatarFrame = NO_FRAME,
  vipEnabled = false,
}: {
  locale: Locale;
  signedIn: boolean;
  customerName: string | null;
  /** The customer's character (`GET /me` avatar), when they chose one. */
  customerAvatar?: string | null;
  /** Their balance, already formatted by the layout. */
  pointsBalance?: string | null;
  /** The tier frame and VIP halo the 40 px avatar wears («VIP Experience» frame 11). */
  avatarFrame?: AvatarFrame;
  /**
   * The programme's `features.vip`: «عضوية VIP» is a row in «حسابي» only
   * then — never «قريباً» (owner). Not in `lib/account/menu.ts`, whose rows
   * are static; this one comes and goes with the dashboard switch.
   */
  vipEnabled?: boolean;
}) {
  const m = messagesFor(locale);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const livePath = usePathname();
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, [setOpen]);

  /**
   * Escape closes and returns focus; a pointer outside closes without
   * stealing it back. The same rules the account menu documents at length,
   * for the same reasons — Safari not focusing a clicked button being the one
   * that makes a wrapper-level handler useless on this market's phones.
   *
   * NO TAB TRAP HERE, unlike the desktop menu, and that is deliberate rather
   * than an omission: this panel covers the viewport, so there is nothing
   * behind it a wandering focus could reach and no ambiguity about what a
   * customer is interacting with. The backdrop below is `aria-hidden` and
   * takes no focus of its own.
   */
  useEffect(() => {
    if (!open) return;

    // OUTSIDE MEANS OUTSIDE THE PANEL. This used to test the component's own
    // wrapper — which contains the BACKDROP — so a tap on the dimmed area was
    // "inside" and the drawer stayed open, the dismiss area doing nothing.
    // The trigger is excluded so its own click can toggle without the
    // pointerdown closing and the click reopening.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };

    // The tab bar and the page's scroll give way to the drawer while it is
    // open (globals.css, `data-drawer`). An attribute on <html> rather than
    // shared state, because the tab bar is a different tree of the layout.
    const root = document.documentElement;
    root.dataset.drawer = "open";

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      delete root.dataset.drawer;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  // A navigation the drawer did not start — the browser's back button, a
  // link inside a row's own page — still closes it; it must never survive
  // onto the next page half-open.
  const [openedOn, setOpenedOn] = useState(livePath);
  if (openedOn !== livePath) {
    setOpenedOn(livePath);
    if (open) setOpen(false);
  }

  // Mounting the lazy layer is what downloads it — see `useIdlePreload`.
  const { mounted, arm, still } = useIdlePreload(open);

  const rows = new Map(
    renderableColumns()
      .flat()
      .flatMap((item) => (item.kind === "link" && item.href ? [[item.key, item.href(locale)] as const] : [])),
  );
  if (vipEnabled) rows.set("vip", `/${locale}/account/vip`);
  const group = (keys: readonly AccountMenuItemKey[]) =>
    keys.flatMap((key) => (rows.has(key) ? [{ key, href: rows.get(key)! }] : []));
  const contactHref = `/${locale}/contact-us`;
  const groups = [
    { title: m.nav.menu.shop, items: group(SHOP_KEYS) },
    ...(signedIn ? [{ title: m.nav.menu.mine, items: group(MINE_KEYS) }] : []),
  ].filter((each) => each.items.length > 0);
  // The most specific row that contains the page — «طلباتي» on an order, not «حسابي».
  const here = livePath ?? `/${locale}`;
  const lit = [...rows.values()]
    .filter((href) => here === href || here.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const icon: Partial<Record<AccountMenuItemKey, string>> = { wallet: "points", savedAccounts: "saved-accounts" };

  // The drawer's content is built once and handed to BOTH renderers below — the
  // animated layer and its plain-element stand-in — so they can never differ.
  // While it exits, the presence wrapper keeps showing the last content it was
  // given, so this being `null` once closed does not blank a leaving drawer.
  const body = open ? (
    <>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <Link href={`/${locale}`} onClick={() => close(false)} aria-label={m.common.storeName}>
            <Image src="/brand/logo-chargerquick-wide.svg" alt="" width={321} height={106} className="cq-light-theme-only h-8 w-auto" />
            <Image src="/brand/logo-chargerquick-wide-light.svg" alt="" width={321} height={106} className="cq-dark-theme-only h-8 w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label={m.nav.menu.close}
            className="grid size-[34px] place-items-center rounded-full bg-[var(--color-chip)]"
          >
            <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          </button>
        </div>

        {signedIn ? (
          <Link
            href={`/${locale}/account`}
            onClick={() => close(false)}
            className="flex items-center gap-2.5 rounded-[14px] bg-[var(--color-chip)] p-2.5 text-[var(--color-ink)]"
          >
            {/* The character in its tier frame (+ the VIP halo and crest dot);
                no character chosen: the ChargerQuick mark on the brand wash. */}
            <AvatarRing size={40} tier={avatarFrame.tier} vip={avatarFrame.vip} src={customerAvatar} />
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-body-m font-bold leading-[1.4]">{customerName ?? m.nav.menu.mine}</span>
                {avatarFrame.vip ? <VipChip /> : null}
              </span>
              {pointsBalance ? (
                <span className="flex items-center gap-1 text-caption font-bold text-[var(--color-ink-subtle)]">
                  <Image src={CURRENCY_ICON} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5" />
                  <bdi dir="ltr">{pointsBalance}</bdi> {pointsUnit(locale, pointsBalance)}
                </span>
              ) : null}
            </span>
            <Chevron />
          </Link>
        ) : (
          <div className="flex flex-col gap-2 rounded-[14px] bg-[var(--color-chip)] p-3">
            <p className="text-body-m font-bold leading-[1.4]">{m.nav.menu.guestTitle}</p>
            <p className="text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.nav.menu.guestLead}</p>
            {/* Both carry this page as `?next=`: signing in brings the
                customer back here, not to the account home. */}
            <AuthLink
              locale={locale}
              kind="sign-in"
              onClick={() => close(false)}
              className="flex h-10 items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-cta)]"
            >
              {m.account.signIn}
            </AuthLink>
            <AuthLink locale={locale} kind="sign-up" onClick={() => close(false)} className="self-center text-caption font-bold text-[var(--color-ink)]">
              {m.nav.menu.createAccountRow}
            </AuthLink>
          </div>
        )}

        {groups.map((each) => (
          <div key={each.title} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-caption font-bold tracking-[0.2px] text-[var(--color-ink-subtle)]">{each.title}</p>
            <ul className="flex flex-col gap-0.5">
              {each.items.map((item) => {
                const current = item.href === lit;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => close(false)}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-[10px] px-2.5 ${
                        current
                          ? "bg-[var(--color-primary-wash-lighter)] text-[var(--color-brand-500)]"
                          : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
                      }`}
                    >
                      {item.key === "wallet" ? (
                        <Image src={CURRENCY_ICON} alt="" aria-hidden width={20} height={20} unoptimized className="size-5 shrink-0" />
                      ) : item.key === "vip" ? (
                        <VipCrestMono className="size-5 bg-current" />
                      ) : (
                        <MenuGlyph src={`/brand/icon-menu-${icon[item.key] ?? item.key}.svg`} />
                      )}
                      <span className="flex-1 text-body-s font-bold">{m.nav.menu.items[item.key]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* «المساعدة» — the way to a person, for guests and customers
            alike. */}
        <div className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-caption font-bold tracking-[0.2px] text-[var(--color-ink-subtle)]">{m.nav.menu.help}</p>
          <Link
            href={contactHref}
            onClick={() => close(false)}
            aria-current={here === contactHref ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-[10px] px-2.5 ${
              here === contactHref
                ? "bg-[var(--color-primary-wash-lighter)] text-[var(--color-brand-500)]"
                : "text-[var(--color-ink)] hover:bg-[var(--color-chip)]"
            }`}
          >
            <MenuGlyph src="/brand/icon-security-phone.svg" />
            <span className="flex-1 text-body-s font-bold">{m.footer.contact}</span>
          </Link>
        </div>

        {/* THE TRADE LICENCE — the store's verification, as a quiet
            badge rather than a row: it is a fact about the business,
            not a place to go. */}
        <div className="flex items-center gap-2.5 rounded-[12px] border border-[var(--color-line)] px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-success-subtlest)] text-[var(--color-success)]">
            <span aria-hidden className="block size-[18px] bg-current [mask-image:url(/brand/icon-shield-tick.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-caption font-bold text-[var(--color-ink)]">
              {m.nav.menu.licenceTitle} · {m.common.storeName}
            </span>
            <span className="text-caption font-bold text-[var(--color-ink-subtle)]">
              {m.nav.menu.licenceNumber.split("{number}")[0]}
              <bdi dir="ltr">{TRADE_LICENCE_NUMBER}</bdi>
              {m.nav.menu.licenceNumber.split("{number}")[1]}
            </span>
          </span>
        </div>
      </div>

      {/* PREFERENCES — not places. */}
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3 shadow-[0_-1px_0_var(--color-line)]">
        <div className="flex items-center gap-2.5">
          <MenuGlyph src="/brand/icon-menu-language.svg" />
          <span className="flex-1 text-body-s font-bold">{m.nav.menu.language}</span>
          <LocaleSegment locale={locale} label={m.nav.menu.language} />
        </div>
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="block size-5 shrink-0 rounded-full shadow-[inset_-6px_-2px_0_0_var(--color-ink)]" />
          <span className="flex-1 text-body-s font-bold">{m.nav.theme.dark}</span>
          <ThemeSwitch label={m.nav.theme.dark} />
        </div>
        {signedIn ? (
          // A FORM, not a link: signing out revokes the token this
          // request presented, and a GET that changes state can be
          // fired by any image tag on any page.
          <form action={signOut} className="pt-1">
            <input type="hidden" name="locale" value={locale} />
            <button type="submit" className="flex items-center gap-2.5 text-body-s font-bold text-[var(--color-danger)]">
              <span aria-hidden className="block size-5 bg-current [mask-image:url(/brand/icon-account-logout.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.account.signOut}
            </button>
          </form>
        ) : null}
      </div>
    </>
  ) : null;

  return (
    <div>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        onPointerEnter={arm}
        onTouchStart={arm}
        onFocus={arm}
        className="flex size-6 shrink-0 items-center justify-center"
      >
        <span className="sr-only">{signedIn ? m.nav.menu.open : m.nav.menu.openGuest}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-6 text-[var(--color-ink)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* The way in when the script never ran — a drawer that needs hydration
          is a customer with no navigation at all until the bundle lands. */}
      <noscript>
        <Link
          href={signedIn ? `/${locale}/account` : `/${locale}/account/sign-in`}
          className="ms-2 text-body-s font-semibold text-[var(--color-brand-500)] underline"
        >
          {signedIn ? m.nav.menu.open : m.account.signIn}
        </Link>
      </noscript>

      {/* Reduced motion: the plain copy is the whole drawer; Motion is never fetched. */}
      {still ? (
        open ? (
          <StaticDrawer panelRef={panel} panelId={panelId} label={m.nav.menu.open} onDismiss={() => close(false)}>
            {body}
          </StaticDrawer>
        ) : null
      ) : mounted || open ? (
        <Suspense
          fallback={
            open ? (
              <StaticDrawer panelRef={panel} panelId={panelId} label={m.nav.menu.open} onDismiss={() => close(false)}>
                {body}
              </StaticDrawer>
            ) : null
          }
        >
          <MobileMenuDrawer open={open} panelRef={panel} panelId={panelId} label={m.nav.menu.open} onDismiss={() => close(false)}>
            {body}
          </MobileMenuDrawer>
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * THE DRAWER BEFORE ITS ANIMATED LAYER HAS ARRIVED — the same two layers as
 * `MobileMenuDrawer`'s `DrawerLayer`, in plain elements with the same classes
 * and no motion. It is the `Suspense` fallback, drawn only while the drawer is
 * open, so a tap on the hamburger is answered at once even when the lazy
 * module is still in flight; the module is normally in place long before the
 * first tap (it loads when the browser is idle and on the hamburger's first
 * hover, touch or focus).
 *
 * It carries the same ref, id and label, so the outside-pointer test, the
 * scroll lock and `aria-controls` work identically in both. It has no exit:
 * closing while it is still showing simply removes it. When the module lands
 * this is replaced in place — the animated layer renders its final state
 * first (`initial={false}`), so nothing re-animates.
 *
 * Keep the classes in step with `MobileMenuDrawer.tsx` (a test compares them).
 */
function StaticDrawer({
  panelRef,
  panelId,
  label,
  onDismiss,
  children,
}: {
  panelRef: Ref<HTMLElement>;
  panelId: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div aria-hidden onClick={onDismiss} className="fixed inset-0 z-[60] bg-[var(--color-backdrop)] backdrop-blur-[8px]" />
      <nav
        ref={panelRef}
        id={panelId}
        aria-label={label}
        className="fixed bottom-0 start-0 top-0 z-[61] flex w-[300px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-e-[26px] bg-[var(--background)] text-[var(--color-ink)] shadow-xl"
      >
        {children}
      </nav>
    </>
  );
}

/** What `MobileMenuDrawer` is when its chunk could not be loaded: the plain copy, no exit. */
function PlainMobileMenuDrawer({
  open,
  ...layer
}: {
  open: boolean;
  panelRef: Ref<HTMLElement>;
  panelId: string;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  return open ? <StaticDrawer {...layer} /> : null;
}

/** A 20px menu glyph, painted in the row's own colour (the pack ships one). */
function MenuGlyph({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-5 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}

function Chevron() {
  return (
    <span
      aria-hidden
      className="block size-3.5 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100"
    />
  );
}
