"use client";

import Image from "next/image";
import Link from "next/link";
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { signOut } from "@/lib/account/actions";
import { renderableColumns, type AccountMenuItemKey } from "@/lib/account/menu";
import { NO_COUNTS, readMenuCounts, type MenuCounts } from "@/lib/account/menu-counts";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { NO_FRAME, type AvatarFrame } from "@/lib/loyalty/frame";
import { AvatarRing } from "@/components/loyalty/vip/AvatarRing";
import { VipChip } from "@/components/loyalty/vip/VipChip";

import { useIdlePreload } from "./motion/useIdlePreload";
import { AuthLink } from "./AuthLink";
import { LocaleSegment } from "./PreferenceSwitchers";
import { ThemeSwitch } from "./ThemeToggle";

/**
 * The animated layer (Motion's presence wrapper and `m` elements) is its own
 * chunk, so the layout that renders this menu on every page does not ship
 * Motion's render core up front. See `AccountMenuDropdown.tsx`.
 *
 * A chunk that fails to load (a flaky connection, a tab left open across a
 * deploy) must not take the page down with it: the animation is decoration,
 * so the menu then simply stays on its plain-element copy.
 */
const AccountMenuDropdown = lazy(() => import("./AccountMenuDropdown").catch(() => ({ default: PlainAccountMenuDropdown })));

/**
 * What the points card shows — every figure the SERVER's, already formatted
 * by the layout (`SiteHeader`, from its one `GET /wallet` read): the
 * available display points, their unit agreed with the number, and what they
 * are worth (`points.available_value` through `formatWorth`). Nothing here is
 * computed in the browser (HANDBOOK §1).
 */
export type AccountMenuPoints = { available: string; unit: string; worth: string };

/** The four tiles, in the board's reading order, each a row of `lib/account/menu.ts`. */
const TILES: readonly { key: AccountMenuItemKey; icon: string; count: keyof MenuCounts | null }[] = [
  { key: "orders", icon: "orders", count: "activeOrders" },
  { key: "savedAccounts", icon: "saved-accounts", count: "savedAccounts" },
  { key: "favourites", icon: "favourites", count: "favourites" },
  { key: "categories", icon: "categories", count: null },
];

/**
 * The header's account menu on DESKTOP — Claude Design «AccountMenu» and
 * «AccountMenuGuest» (owner-approved, 2026-10), replacing the two-column
 * Figma panel (`4317:33481` / `4317:33440`). The trigger is unchanged
 * (`6627:13305`). The phone has its own drawer (`MobileMenu`).
 *
 * SIGNED IN, top to bottom: who (the character in its tier frame, the name,
 * the level, «حسابي»); the points card (balance, its server-stated worth,
 * «النقاط»); four tiles — orders, saved accounts, favourites, categories —
 * with a small figure where one is cheaply known; then the settings row, the
 * language segment, the dark-mode switch, and sign-out in red.
 *
 * GUEST: the welcome card with «تسجيل الدخول» and «إنشاء حساب», the
 * categories row, the language segment and the dark-mode switch. The board
 * also draws «تتبّع طلب»; there is no such page, so — owner — it is not drawn.
 *
 * NOTHING SECRET CROSSES THIS BOUNDARY. It receives a BOOLEAN, a DISPLAY
 * NAME and display strings, never the session cookie and never a bearer
 * token — those are read only in Server Components, Server Actions and our
 * route handlers (`lib/account/session.ts`). Sign-out is the existing
 * `signOut` Server Action called through a plain `<form action={…}>`;
 * importing it here ships a reference to the server, not the module, which
 * is exactly why that action returns no value. The tile figures come from
 * our own `/api/account/menu-counts`, which reads the cookie itself.
 * `npm run scan:bundle` greps the built bundles for `cq_session` and
 * `bearerToken` and is the tripwire.
 *
 * EVERY CARD, TILE AND ROW IS A ROW OF `lib/account/menu.ts`, and is drawn
 * only while that row has a route — the same rule the phone drawer keeps.
 *
 * NO JAVASCRIPT, NO MENU — stated rather than hidden. Everything else in this
 * header works without hydration (the switchers are plain forms by policy,
 * §4), and a disclosure with `aria-expanded`, Escape-to-close and a focus loop
 * genuinely needs a client. The cost is that a guest whose script has not run
 * yet cannot reach sign-in from here, so a `<noscript>` link does — it covers
 * JavaScript being off or blocked, not the pre-hydration second, and that
 * residual gap is the owner's call rather than something to paper over.
 */
export function AccountMenu({
  locale,
  signedIn,
  customerName,
  customerAvatar,
  avatarFrame = NO_FRAME,
  tierName = null,
  points = null,
}: {
  locale: Locale;
  /** Whether `GET /me` answered. Never derived from the name: an OTP sign-in has none. */
  signedIn?: boolean;
  /** The customer's own name, when they have set one. Often absent even when signed in. */
  customerName?: string;
  /** The customer's chosen character (`GET /me` avatar) — the same picture the phone drawer shows. */
  customerAvatar?: string | null;
  /** The tier frame and VIP halo the avatar wears (`frameOf`, from the layout's wallet read). */
  avatarFrame?: AvatarFrame;
  /** The level's name in the page's language (`GET /wallet` tier), or none. */
  tierName?: string | null;
  /** The points card's figures; null (a failed wallet read, a guest) draws no card — never «0». */
  points?: AccountMenuPoints | null;
}) {
  const m = messagesFor(locale);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<MenuCounts>(NO_COUNTS);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  // Mounting the lazy layer is what downloads it — see `useIdlePreload`.
  const { mounted, arm, still } = useIdlePreload(open);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }, [setOpen]);

  /**
   * Everything that closes or contains the open menu, listened for on the
   * DOCUMENT rather than on the wrapper.
   *
   * ON THE DOCUMENT BECAUSE FOCUS IS NOT GUARANTEED TO BE INSIDE. A React
   * `onKeyDown` on the wrapper only ever sees keys pressed while focus sits
   * within it — and Safari, which is most of this market's phones, does NOT
   * focus a `<button>` when it is clicked. Escape then did nothing at all,
   * which is how this was caught: opened with a click, pressed Escape, and the
   * panel stayed put with `document.activeElement` still on `<body>`.
   *
   * CLICKING AWAY CLOSES IT, and does NOT drag focus back to the trigger: the
   * customer has just pointed at something else, and stealing focus back would
   * fight the click they are in the middle of making. `pointerdown` rather than
   * `click` so the menu is gone before the thing underneath reacts.
   *
   * ESCAPE DOES RETURN FOCUS. Closing the panel while focus sat on a row inside
   * it would drop focus onto `<body>`, and the next Tab would restart from the
   * top of the page — a keyboard customer walks the whole header again to get
   * back to where they were.
   *
   * TAB STAYS INSIDE while the menu is open, in a loop that includes the
   * trigger, and pulls focus in if it was outside — so the panel cannot be left
   * open behind a cursor that has wandered into the page underneath. Escape, a
   * click away, or following a row all release it.
   */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }

      if (event.key !== "Tab") return;

      const root = wrapper.current;
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const active = document.activeElement;

      if (!root.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  /**
   * THE TILE FIGURES ARE READ WHEN THE MENU OPENS, never with the page: the
   * layout renders this menu on every page, and three account reads per page
   * view for a badge nobody opened would be the wrong trade. Read again on
   * every opening (an order placed since shows up), aborted when the menu
   * closes first, and any failure is simply no badge — the tiles work the
   * same without one.
   */
  useEffect(() => {
    if (!open || !signedIn) return;

    const controller = new AbortController();
    fetch(`/api/account/menu-counts?locale=${locale}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (body !== null) setCounts(readMenuCounts(body));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, signedIn, locale]);

  // Every destination comes from the menu model; a row it withholds is not drawn.
  const href = new Map(
    renderableColumns()
      .flat()
      .flatMap((item) => (item.kind === "link" && item.href ? [[item.key, item.href(locale)] as const] : [])),
  );
  const onNavigate = () => setOpen(false);
  const profileHref = href.get("profile");
  const pointsHref = href.get("wallet");
  const settingsHref = href.get("settings");
  const categoriesHref = href.get("categories");
  const tiles = TILES.flatMap((tile) => {
    const to = href.get(tile.key);
    return to ? [{ ...tile, href: to }] : [];
  });

  /*
   * THREE TRIGGER STATES, NOT TWO — the same trap the greeting had before this
   * menu existed. A signed-in customer very often has `name: null` (an OTP
   * sign-in registers an unseen number), and "hello" plus a fallback reads
   * "اهلا حسابي" — "hello my account". So a name is greeted, no name is not,
   * and a guest is told what the menu is for.
   */
  const triggerLabel = signedIn ? m.nav.menu.open : m.nav.menu.openGuest;

  const rowClass = "flex min-h-12 items-center gap-3 px-1.5 text-body-l font-semibold text-[var(--color-ink)]";

  /** «اللغة» with its segment, and «الوضع الليلي» with its switch — the same controls the phone drawer and the settings page use. */
  const preferences = (
    <>
      <div className={rowClass}>
        <InkGlyph src="/brand/icon-menu-language.svg" className="size-6 shrink-0" />
        <span className="flex-1">{m.nav.menu.language}</span>
        <LocaleSegment locale={locale} label={m.nav.menu.language} />
      </div>
      <div className={rowClass}>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width={24}
          height={24}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6 shrink-0"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        <span className="flex-1">{m.nav.theme.dark}</span>
        <ThemeSwitch label={m.nav.theme.dark} />
      </div>
    </>
  );

  // The dropdown's content is built once and handed to BOTH renderers below —
  // the animated layer and its plain-element stand-in — so they can never
  // differ. While it exits, the presence wrapper keeps showing the last content
  // it was given, so this being `null` once closed does not blank a leaving menu.
  const body = open ? (
    <>
        {/* THE POINTER SITS UNDER THE TRIGGER IN BOTH DIRECTIONS, and does so
            without a single left/right conditional: the box that holds this is
            exactly as wide as the trigger, and centring its children puts the
            arrow on the trigger's midpoint and hangs the wider card evenly
            either side of it. Mirroring is then the document's job, as §4
            requires. */}
        {/* A rotated square, half of it tucked under the card — which paints
            over it because it comes later, so no z-index is involved and the
            two are the same white with no seam. It carries no shadow of its
            own: the card's would then be drawn twice along the diagonal and
            read as an outline rather than a pointer. */}
        <span aria-hidden className="-mb-2 size-4 rotate-45 rounded-[2px] bg-[var(--color-surface-raised)]" />
        <div
          id={panelId}
          /* 400 wide as drawn, capped so a narrow window never gets a card
             wider than itself. */
          className="flex w-[400px] max-w-[calc(100vw-2rem)] flex-col gap-3.5 rounded-[16px] bg-[var(--color-surface-raised)] p-4 text-[var(--color-ink)] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {signedIn ? (
            <>
              {/* A labelled landmark, so the places are somewhere a screen
                  reader can jump TO. Labelled with the menu's own title
                  because the page already has a second nav — the tab rail.
                  The preferences and sign-out stay outside it: they are
                  settings and actions, not places. */}
              <nav aria-label={m.nav.menu.title} className="flex flex-col gap-3.5">
                {profileHref ? (
                  <Link
                    href={profileHref}
                    onClick={onNavigate}
                    className="flex items-center gap-3 rounded-[14px] bg-[var(--color-chip)] p-2.5 text-[var(--color-ink)]"
                  >
                    <AvatarRing size={56} shape="circle" tier={avatarFrame.tier} vip={avatarFrame.vip} src={customerAvatar} />
                    {/* NO NAME, NO STAND-IN. «حسابي» is already the link's
                        own words at the end; a name slot falling back to it
                        would read «حسابي … حسابي». The level carries the
                        card alone then (a member's frame already wears its
                        VIP pill, so no second chip stands in either). */}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {customerName ? (
                        <span className="flex min-w-0 items-center gap-1.5">
                          <b className="truncate text-body-l font-bold leading-[1.4]">{customerName}</b>
                          {avatarFrame.vip ? <VipChip /> : null}
                        </span>
                      ) : null}
                      {tierName ? <span className="text-caption font-bold text-[var(--color-ink-subtle)]">{tierName}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-body-s font-bold text-[var(--color-brand-500)]">
                      {m.nav.menu.items.profile}
                      <span
                        aria-hidden
                        className="block size-3 bg-current [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ltr:-scale-x-100"
                      />
                    </span>
                  </Link>
                ) : null}

                {points && pointsHref ? (
                  <Link
                    href={pointsHref}
                    onClick={onNavigate}
                    data-account-menu-points=""
                    className="flex items-center justify-between gap-3 rounded-[14px] bg-[var(--color-brand-500)] px-3.5 py-3 text-[var(--color-on-primary)]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Image src={CURRENCY_ICON} alt="" aria-hidden width={34} height={34} unoptimized className="size-[34px] shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <b className="text-heading-m font-bold leading-[1.3]">
                          <bdi dir="ltr">{points.available}</bdi> {points.unit}
                        </b>
                        <span className="text-caption font-medium">
                          {m.nav.menu.pointsWorth.split("{worth}")[0]}
                          <bdi>{points.worth}</bdi>
                          {m.nav.menu.pointsWorth.split("{worth}")[1]}
                        </span>
                      </span>
                    </span>
                    <span className="flex h-8 shrink-0 items-center rounded-full bg-[var(--color-on-primary)] px-3 text-body-s font-bold text-[var(--color-brand-500)]">
                      {m.account.points}
                    </span>
                  </Link>
                ) : null}

                {tiles.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-2.5">
                    {tiles.map((tile) => (
                      <li key={tile.key} className="flex">
                        <Tile
                          href={tile.href}
                          icon={tile.icon}
                          label={m.nav.menu.items[tile.key]}
                          badge={tile.count ? badgeFor(tile.count, counts[tile.count], m.nav.menu.activeOrders) : null}
                          onNavigate={onNavigate}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </nav>

              <div className="flex flex-col border-t border-[var(--color-line)] pt-1.5">
                {settingsHref ? (
                  <Link href={settingsHref} onClick={onNavigate} className={`${rowClass} hover:text-[var(--color-brand-500)]`}>
                    <InkGlyph src="/brand/icon-menu-settings.svg" className="size-6 shrink-0" />
                    <span className="flex-1">{m.nav.menu.items.settings}</span>
                  </Link>
                ) : null}
                {preferences}
              </div>

              {/* A POST, not a link — a GET that changes state is something a
                  prefetcher can fire on the customer's behalf — and red, as
                  the account page draws the same action. */}
              <form action={signOut} className="border-t border-[var(--color-line)] pt-1.5">
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="flex min-h-12 w-full items-center gap-3 px-1.5 text-start text-body-l font-semibold text-[var(--color-danger)]"
                >
                  <span
                    aria-hidden
                    className="block size-6 shrink-0 bg-current [mask-image:url(/brand/icon-account-logout.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
                  />
                  {m.account.signOut}
                </button>
              </form>
            </>
          ) : (
            <>
              <section className="flex flex-col gap-3 rounded-[14px] bg-[var(--color-primary-wash-lighter)] p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-heading-m font-bold leading-[1.4]">{m.nav.menu.guestTitle}</p>
                  <p className="text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)]">{m.nav.menu.welcomeLead}</p>
                </div>
                {/* Both carry this page as `?next=`: signing in brings the
                    customer back here, not to the account home. */}
                <div className="grid grid-cols-2 gap-2.5">
                  <AuthLink
                    locale={locale}
                    kind="sign-in"
                    onClick={onNavigate}
                    className="flex h-11 items-center justify-center rounded-[8px] bg-[var(--color-brand-500)] text-body-l font-semibold text-[var(--color-on-primary)]"
                  >
                    {m.account.signIn}
                  </AuthLink>
                  <AuthLink
                    locale={locale}
                    kind="sign-up"
                    onClick={onNavigate}
                    className="flex h-11 items-center justify-center rounded-[8px] text-body-l font-semibold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]"
                  >
                    {m.account.signUp}
                  </AuthLink>
                </div>
              </section>

              {categoriesHref ? (
                <nav aria-label={m.nav.menu.title} className="-mt-1.5">
                  <Link href={categoriesHref} onClick={onNavigate} className={`${rowClass} hover:text-[var(--color-brand-500)]`}>
                    <InkGlyph src="/brand/icon-menu-categories.svg" className="size-6 shrink-0" />
                    {m.nav.menu.items.categories}
                  </Link>
                </nav>
              ) : null}

              <div className="flex flex-col border-t border-[var(--color-line)] pt-1.5">{preferences}</div>
            </>
          )}
        </div>
    </>
  ) : null;

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
        onPointerEnter={arm}
        onTouchStart={arm}
        onFocus={arm}
        // `6883:34355`: the chevron, the greeting in Heading/Medium-M (18/1.4)
        // and a 40px avatar, 12px apart.
        className="flex items-center gap-3 text-start text-heading-m font-medium leading-[1.4] text-[var(--color-ink)] hover:text-[var(--color-brand-500)]"
      >
        <span className="flex items-center gap-1">
          <InkGlyph src="/brand/icon-chevron-down.svg" className={`size-6 transition-transform ${open ? "rotate-180" : ""}`} />
          {/* The customer's own name is written in their own script, so it
              inherits the page's direction rather than being forced either
              way. A name is greeted as the comp does («اهلا احمد»); without
              one the trigger says what it is. */}
          <span>{signedIn && customerName ? `${m.nav.greeting} ${customerName}` : triggerLabel}</span>
        </span>

        {/* THE AVATAR — 40px, round (the header's place is round), carrying
            the customer's chosen character: the SAME `GET /me` picture the
            phone drawer and the account page show, passed down by the layout,
            so choosing one on the profile shows it here on the next render.
            It wears the tier's metal frame and, for a VIP member, the halo
            and crest dot («VIP Experience» frames 3/8). Without a character,
            the ChargerQuick mark rather than a stock face that would belong
            to nobody. Decorative: the greeting beside it is the name. */}
        {signedIn ? <AvatarRing size={40} shape="circle" tier={avatarFrame.tier} vip={avatarFrame.vip} src={customerAvatar} /> : null}
      </button>

      {/* The way in when the script never ran. Not a duplicate control: it is
          removed from the DOM the moment JavaScript is available. */}
      {signedIn ? null : (
        <noscript>
          <Link
            href={`/${locale}/account/sign-in`}
            className="ms-2 text-body-l font-medium text-[var(--color-brand-500)] underline"
          >
            {m.account.signIn}
          </Link>
        </noscript>
      )}

      {/* Reduced motion: the plain copy is the whole menu; Motion is never fetched. */}
      {still ? (
        open ? <StaticDropdown>{body}</StaticDropdown> : null
      ) : mounted || open ? (
        <Suspense fallback={open ? <StaticDropdown>{body}</StaticDropdown> : null}>
          <AccountMenuDropdown open={open}>{body}</AccountMenuDropdown>
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * A tile's small figure: «2 قيد التنفيذ» on orders (the orders page's own
 * chip words, in the warning wash), the bare number elsewhere — a bare
 * figure needs no plural agreement, and the tile's label already says what
 * is counted. No figure, or none in progress: no badge.
 */
function badgeFor(kind: keyof MenuCounts, value: number | null, activeTemplate: string): ReactNode {
  if (value === null) return null;
  if (kind === "activeOrders") {
    if (value === 0) return null;
    const [before, after] = activeTemplate.split("{count}");
    return (
      <span className="rounded-full bg-[var(--color-warning-wash)] px-2 py-0.5 text-caption-xs font-extrabold leading-[1.5] text-[var(--color-warning-strong)]">
        {before}
        <bdi dir="ltr">{value}</bdi>
        {after}
      </span>
    );
  }
  return (
    <bdi dir="ltr" className="text-caption font-bold text-[var(--color-ink-subtle)]">
      {value}
    </bdi>
  );
}

/**
 * One tile: the glyph on its brand wash with the figure across from it, the
 * label under them. The label comes FIRST in the document and is moved under
 * the glyph by `order`, so a screen reader names the tile «طلباتي، 2 قيد
 * التنفيذ» — the place, then the figure — while the eye reads it as drawn.
 */
function Tile({
  href,
  icon,
  label,
  badge,
  onNavigate,
}: {
  href: string;
  icon: string;
  label: string;
  badge: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex w-full flex-col gap-2 rounded-[12px] p-3 text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors hover:bg-[var(--color-chip)]"
    >
      <span className="order-2 text-body-m font-semibold leading-[1.4]">{label}</span>
      <span className="order-1 flex min-h-9 items-center justify-between gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-wash-lighter)] text-[var(--color-brand-500)]">
          <span
            aria-hidden
            className="block size-[22px] bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
            style={{ maskImage: `url(/brand/icon-menu-${icon}.svg)`, WebkitMaskImage: `url(/brand/icon-menu-${icon}.svg)` }}
          />
        </span>
        {badge}
      </span>
    </Link>
  );
}

/**
 * THE DROPDOWN BEFORE ITS ANIMATED LAYER HAS ARRIVED — the same box as
 * `AccountMenuDropdown`'s `DropdownLayer`, a plain `<div>` with the same
 * classes. It is the `Suspense` fallback, drawn only while the menu is open,
 * so the trigger is answered at once even when the lazy module is still in
 * flight; the module is normally in place long before the first click (it
 * loads when the browser is idle and on the trigger's first hover, touch or
 * focus). No exit: closing while it still shows simply removes it, and when
 * the module lands this is replaced in place without animating
 * (`initial={false}`).
 *
 * Keep the classes in step with `AccountMenuDropdown.tsx` (a test compares them).
 */
function StaticDropdown({ children }: { children: ReactNode }) {
  return <div className="absolute top-full z-40 flex w-full flex-col items-center pt-2">{children}</div>;
}

/** What `AccountMenuDropdown` is when its chunk could not be loaded: the plain copy, no exit. */
function PlainAccountMenuDropdown({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <StaticDropdown>{children}</StaticDropdown> : null;
}

/**
 * A pack glyph painted in the menu's ink. The files are drawn in #212121 for
 * light grounds — exactly `--color-ink` there — and as `<img>`s they stayed
 * #212121 on the dark theme's card, near-invisible beside white labels.
 * Drawn as a mask they take `--color-ink` in both themes: unchanged in light,
 * white in dark. The ink, not `currentColor`, so a row's hover blue stays on
 * its label as before.
 */
function InkGlyph({ src, className }: { src: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`block bg-[var(--color-ink)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}
