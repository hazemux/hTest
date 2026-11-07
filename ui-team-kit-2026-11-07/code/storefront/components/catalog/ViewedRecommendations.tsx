"use client";

import { useEffect, useState, type ReactNode } from "react";

import { RecommendationsRow } from "@/components/catalog/RecommendationsRow";
import type { RecommendationCards } from "@/lib/catalog/recommendation-cards";
import { parseViewed, VIEWED_COOKIE } from "@/lib/catalog/viewed";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «قد ينال إعجابك أيضاً» FOR THIS VISITOR'S HISTORY, asked by the browser
 * (ADR 0052, D4). While `CQ_EDGE_CACHE` is on, the page may be Cloudflare's
 * copy, so the server draws the row every visitor without a history gets
 * (`children`). A visitor whose `cq_viewed` names other products then asks
 * `/api/recommendations` (private, never cached) for their own row and swaps
 * it in. Without a history, or when the ask fails, the server's row stays.
 *
 * `currency` is the one the page was drawn in, so both rows price alike.
 */
export function ViewedRecommendations({
  locale,
  slug,
  currency,
  children,
}: {
  locale: Locale;
  slug: string;
  currency: string;
  children: ReactNode;
}) {
  const [own, setOwn] = useState<RecommendationCards | null>(null);

  useEffect(() => {
    const history = parseViewed(readCookie(VIEWED_COOKIE)).filter((each) => each !== slug);
    if (history.length === 0) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ slug, locale, currency });
    fetch(`/api/recommendations?${query}`, { credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<RecommendationCards>) : null))
      .then((answer) => {
        if (answer && answer.cards.length > 0) setOwn(answer);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [locale, slug, currency]);

  return own ? <RecommendationsRow locale={locale} cards={own.cards} hearts={own.hearts} /> : <>{children}</>;
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}
