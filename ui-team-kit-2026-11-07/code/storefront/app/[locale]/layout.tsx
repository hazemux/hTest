import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { SiteFooter } from "@/components/ui/SiteFooter";
import { AccountDeletedSheet } from "@/components/account/AccountDeletedSheet";
import { TabBarForVisitor } from "@/components/mobile/TabBarForVisitor";
import { AnnouncementSlot } from "@/components/ui/AnnouncementSlot";
import { LOCALE_FOLLOW_SCRIPT } from "@/lib/navigation/locale-follow";
import { RouteLocaleProvider } from "@/components/ui/LocaleFromRoute";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { PageLoader } from "@/components/ui/PageLoader";
import { HistoryStamp } from "@/components/ui/PhoneNavControl";
import { SiteChrome } from "@/components/ui/SiteChrome";
import { StatusBannerSlot } from "@/components/ui/StatusBannerSlot";
import { ThemeFromCookie } from "@/components/ui/ThemeFromCookie";
import { SupportChat } from "@/components/ui/SupportChat";
import { ToastHost } from "@/components/ui/ToastHost";
import { SignedInHosts } from "@/components/account/SignedInHosts";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { DIRECTIONS, LOCALES, isLocale } from "@/lib/i18n/locales";
import { THEME_SCRIPT } from "@/lib/theme/script";
import { THEME_GROUND } from "@/lib/theme/theme";
import { BUY_GUIDE_SCRIPT } from "@/lib/catalog/buy-guide";
import { CLOSED_BAR_SCRIPT } from "@/lib/content/closed-bar-script";
import { portalScript, portalTransitionEnabled } from "@/lib/portal/boot";
import { PORTAL_CANVAS_ID } from "@/lib/portal/state";
import { messagesFor } from "@/lib/i18n/messages";
import { siteOpenGraph } from "@/lib/seo/metadata";
import { isIndexable, siteUrl } from "@/lib/seo/site";

import "../globals.css";

/**
 * The root layout, and it lives under [locale] on purpose.
 *
 * `dir` and `lang` are set on <html> itself, so direction is STRUCTURAL. Every
 * component below inherits it and none of them need to know which language
 * they are in — which is what stops RTL becoming a pile of conditional
 * margins added one bug report at a time.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Next 16: params is async-only. Reading it synchronously no longer works.
  const { locale } = await props.params;

  if (!isLocale(locale)) return {};

  const m = messagesFor(locale);

  return {
    // Every relative canonical, hreflang and Open Graph URL resolves against
    // the ONE public origin (lib/seo/site.ts).
    metadataBase: siteUrl(),
    title: { default: m.common.storeName, template: `%s · ${m.common.storeName}` },
    description: m.common.tagline,
    // NO `alternates` here. Next replaces `alternates` wholesale per segment,
    // so a layout's hreflang became EVERY page's: each product, category and
    // FAQ page told search engines its translations were the two home pages.
    // Each indexable page now sets its own (localizedAlternates).
    //
    // Anything but production is noindex, whatever the page says — a staging
    // copy of the store must never compete with the real one.
    ...(isIndexable() ? {} : { robots: { index: false, follow: false } }),
    // The share card's defaults — the bilingual default card, so a link
    // pasted into WhatsApp or X shows the store, not a blank tile. Next merges
    // `openGraph` and `twitter` shallowly, so every page builds its own ON
    // these (`pageMetadata`, lib/seo/metadata.ts) rather than replacing them.
    openGraph: siteOpenGraph(locale),
    twitter: { card: "summary_large_image", images: siteOpenGraph(locale).images },
    // The store speaks both languages itself. A browser's own translation
    // rewrites the text nodes React owns, and React then crashes on them:
    // removeChild errors and stack overflows, once on checkout (owner,
    // 2026-10-29; GitHub #477, #497, #522, #523).
    other: { google: "notranslate" },
  };
}

export default async function LocaleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  // A path like /de reaches here because the proxy only redirects paths that
  // do not already start with a locale. Without this it would render with an
  // undefined dictionary rather than a 404.
  if (!isLocale(locale)) notFound();

  /*
   * NO PATH IS READ HERE. The switchers post the current path back so a
   * customer lands where they were, and they take it from the browser
   * (`ReturnPathInput`): the shell is shared (ADR 0046 §1), so the server
   * cannot know the page. The sign-in screens stand alone — no announcement,
   * header, footer or tab bar — decided by `SiteChrome` from the live URL;
   * see its docblock.
   *
   * NO ACCOUNT IS READ HERE EITHER. Who is looking — the greeting, the
   * rewards chip, the VIP row, the review prompt and the tier-up toast — is
   * read once per request by `headerViewer` inside the slots that draw it,
   * each its own Suspense boundary (ADR 0046 §2), so the frame around them
   * never waits for the account API.
   *
   * NOR THE CART. The basket counts — the header's, the tab bar's — are each
   * their own boundary (`components/cart/CartBadge.tsx`, `TabBarForVisitor`).
   *
   * NOR THE COUNTRY OR THE DISMISSED BAR. The country pill streams in its own
   * boundary (`header/CountryPill.tsx`); the announcement's rows are shared
   * and only the visitor's dismissal streams (`AnnouncementSlot`). This
   * layout reads no cookie, no header and no clock.
   */
  return (
    // `data-theme` comes from THEME_SCRIPT before the first paint, not from
    // the server: the shell is shared (ADR 0046 §4; `lib/theme/script.ts`).
    // suppressHydrationWarning because the attribute the script wrote is not
    // in React's payload.
    // translate="no": no browser translation, see generateMetadata.
    <html
      lang={locale}
      dir={DIRECTIONS[locale]}
      translate="no"
      className="h-full antialiased notranslate"
      suppressHydrationWarning
    >
      <head>
        {/* ANDROID (2026-11-03): `only light` forbids Chrome's «dark theme
            for sites» and Samsung Internet's dark mode to darken the light
            theme — they did, and the dark-mode switch looked like it did
            nothing. The store's own dark theme overrides it on <html>
            (`color-scheme: dark`, globals.css). `theme-color` paints the
            address bar the store's ground; THEME_SCRIPT and ThemeToggle set
            it per theme, so it is BEFORE them. */}
        <meta name="color-scheme" content="only light" />
        <meta name="theme-color" content={THEME_GROUND.light} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* «كيف تشحن؟» already closed or a purchase made in this browser:
            hidden before paint, never popping in late (`lib/catalog/buy-guide.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: BUY_GUIDE_SCRIPT }} />
        {/* The bar this visitor closed, stamped before paint so the shared
            announcement copies swap without moving (`AnnouncementSlot`). */}
        <script dangerouslySetInnerHTML={{ __html: CLOSED_BAR_SCRIPT }} />
        {/* The portal language transition (UI team, 2026-11-03), OFF unless
            PORTAL_TRANSITION_ENABLED was "true" at build: it must run before
            the first render, when `pagereveal` fires (`lib/portal/boot.ts`). */}
        {portalTransitionEnabled() ? <script dangerouslySetInnerHTML={{ __html: portalScript() }} /> : null}
      </head>
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        {/* FIRST, before anything paints: Back into a page in the other
            language becomes that page in the tab's language, with no flash
            of the old one (`lib/navigation/locale-follow.ts`). */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_FOLLOW_SCRIPT }} />
        {/* The portal transition's ring, hidden until a switch reveals
            through it — first in <body> so it is parsed before the first
            render (`lib/portal/boot.ts`). Only with the flag. */}
        {portalTransitionEnabled() ? (
          <canvas id={PORTAL_CANVAS_ID} className="cq-portal-ring" aria-hidden style={{ display: "none" }} suppressHydrationWarning />
        ) : null}
        {/* The theme where THEME_SCRIPT never ran — a 404 is drawn on the
            client — and only when nothing set it (`ThemeFromCookie`). */}
        <ThemeFromCookie />
        {/* The incident status banner staff switch on (owner, 2026-10-13):
            shared, in the shell, on EVERY page — outside `SiteChrome`, which
            hides the header on phone checkout, where a payment notice matters
            most (`StatusBannerSlot`). Nothing when it is off. */}
        <StatusBannerSlot locale={locale} />
        <SiteChrome header>
        {/* The bars staff publish are shared; whether this visitor closed
            one streams in its own boundary (`AnnouncementSlot`). */}
        <AnnouncementSlot locale={locale} />
        {/* Shared by every visitor; its personal parts stream in their own
            boundaries (`SiteHeader`, `header/HeaderSlots.tsx`). */}
        <SiteHeader locale={locale} />
        <AccountDeletedSheet locale={locale} />
        </SiteChrome>
        {/* The route's language for the one file Next gives no params, the
            404 (`LocaleFromRoute`): from these prebuilt params, in the shell. */}
        <RouteLocaleProvider locale={locale}>{props.children}</RouteLocaleProvider>

        {/* Alerts (`lib/notifications`): fixed, so where it sits in the tree
            does not matter — but it must NOT sit inside `SiteChrome`, which
            hides its children on phone checkout and on the sign-in pages. */}
        <ToastHost locale={locale} />

        {/* «تحدث معنا» — Crisp live chat, OFF without
            NEXT_PUBLIC_CRISP_WEBSITE_ID (`SupportChat`). Outside `SiteChrome`
            for the same reason: it is wanted on the phone's checkout. */}
        <SupportChat locale={locale} />

        {/* «قيم طلبك» on return (ADR 0042) and «وصلت إلى مستوى …» — only for
            a signed-in visitor, decided per request; nothing to draw until
            then, so no fallback. */}
        <Suspense fallback={null}>
          <SignedInHosts locale={locale} />
        </Suspense>

        {/* Counts history entries for the phone's back arrow on browsers
            without the Navigation API — every page, chrome or not. */}
        <Suspense fallback={null}>
          <HistoryStamp />
        </Suspense>

        {/* The line under way while a page loads (`NavigationProgress`),
            and the full-screen loader when a browse or account page is slow
            (`PageLoader`); both read the search params, so they sit in their
            own Suspense. */}
        <Suspense fallback={null}>
          <NavigationProgress />
          <PageLoader locale={locale} />
        </Suspense>

        <SiteChrome>
          <SiteFooter locale={locale} />

          {/* The mobile tab bar is FIXED, so it sits outside the document flow
              and would otherwise cover the last rows of every page. This
              spacer gives it room — on mobile only, since the bar is
              `lg:hidden`. The bar's height is proportional (71/360 of the
              viewport width = 19.72vw), so the clearance is too, plus a little
              breathing room. Without it the footer's last row is unreachable.
              PAINTED IN THE FOOTER'S GROUND: the bar hides on the way down, so
              at the end of a page this strip is what shows — in the page's
              white it read as an empty band under the footer. On a page with a
              buy bar it is the buy bar's clearance instead (globals.css). */}
          <div aria-hidden className="cq-tabbar-spacer h-[calc(19.72vw+16px)] shrink-0 bg-[var(--color-footer-ground)] lg:hidden" />
          {/* The basket count and whether «حسابي» signs in are the
              visitor's: the bar without them (the same box) until they
              stream (`TabBarForVisitor`). */}
          <TabBarForVisitor locale={locale} />
        </SiteChrome>
      </body>
    </html>
  );
}

