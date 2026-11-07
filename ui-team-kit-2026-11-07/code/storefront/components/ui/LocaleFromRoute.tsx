"use client";

import { createContext, useContext, type ReactNode } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/**
 * The route's `[locale]`, as the root layout read it from its params.
 *
 * The layout's params are built ahead for both languages (its
 * `generateStaticParams`), so this value is in the shell — unlike
 * `useParams()`, which can suspend under Cache Components and leave a
 * fallback showing until the script runs (Task 11: an English 404 drawn in
 * Arabic with JavaScript off).
 */
const RouteLocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once, by `app/[locale]/layout.tsx`, around the page. */
export function RouteLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <RouteLocaleContext value={locale}>{children}</RouteLocaleContext>;
}

/**
 * Shows the child written in the language of the route's `[locale]`.
 *
 * FOR THE ONE PLACE THAT HAS NO LOCALE: `app/[locale]/not-found.tsx`. Next
 * passes a not-found file no props, and the shell is shared, so the server
 * cannot read the request either (ADR 0046 §1). The server renders every
 * language's version — they stay server components, so no dictionary reaches
 * the client bundle — and this picks one.
 *
 * THE ROUTE'S PARAM, NOT THE ADDRESS BAR. The layout drew `lang`/`dir` and
 * the header from `[locale]`, and the 404 body has to agree with them. The
 * two differ after a proxy rewrite: an old `/en/product/x` is rendered as
 * `/ar/legacy-url-not-migrated/en/product/x`, so `usePathname()` would say
 * `en` and put an English 404 inside an Arabic page.
 *
 * FROM THE LAYOUT, NOT A HOOK THAT CAN SUSPEND: the value is known when the
 * shell is drawn, so the right language is in the HTML — with JavaScript off
 * too. Arabic with no layout above it: the store's own language, and the
 * cheaper way to be wrong (see `negotiateLocale`).
 */
export function LocaleFromRoute(props: Record<Locale, ReactNode>) {
  return props[useContext(RouteLocaleContext)];
}
