"use client";

import { useSyncExternalStore } from "react";

import { CountrySwitcher } from "@/components/ui/CountrySwitcher";
import { visitorCountryInBrowser } from "@/lib/edge/visitor-country";
import type { Locale } from "@/lib/i18n/locales";

/**
 * The country pill on a SHARED COPY (ADR 0052, D9). The server drew it for the
 * copy's currency (`defaultCountryForCurrency`); once hydrated it switches to
 * the visitor's own country — their choice, else the one Cloudflare saw.
 * The prices do not move: they follow the currency, which is in the URL.
 */
export function VisitorCountrySwitcher({ locale, country, size }: { locale: Locale; country: string; size: "sm" | "lg" }) {
  // Null on the server and while hydrating, so the first paint matches the server's HTML.
  const own = useSyncExternalStore(neverChanges, visitorCountryInBrowser, noCountryOnServer);
  return <CountrySwitcher locale={locale} country={own ?? country} size={size} />;
}

/** Nothing here subscribes to cookie changes: choosing a country reloads the page. */
function neverChanges(): () => void {
  return () => undefined;
}

function noCountryOnServer(): null {
  return null;
}
