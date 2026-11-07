"use client";

import { useEffect } from "react";

import { afterHumanSignal } from "@/lib/analytics/human-signal";
import type { ProductView } from "@/lib/analytics/product-view";
import type { Locale } from "@/lib/i18n/locales";

/**
 * A PRODUCT VIEW, REPORTED BY THE BROWSER (ADR 0052 §7) — while
 * `CQ_EDGE_CACHE` is on, the page may be a copy served from Cloudflare, so
 * the server that rendered it never hears of this visit.
 *
 * Two posts to `/api/views`: the funnel's `product_viewed` at once (our own
 * data), and the ad platforms' «view content» only after a human signal
 * (`afterHumanSignal`), so a page fetched and abandoned reaches no ad report.
 */
export function ProductViewBeacon({ locale, view }: { locale: Locale; view: ProductView }) {
  const { productPublicId, categoryPublicId, packPublicId } = view;

  useEffect(() => {
    const payload = { locale, product_public_id: productPublicId, category_public_id: categoryPublicId, pack_public_id: packPublicId };
    send({ ...payload, kind: "view" });
    return afterHumanSignal(() => send({ ...payload, kind: "ad" }));
  }, [locale, productPublicId, categoryPublicId, packPublicId]);

  return null;
}

function send(body: Record<string, unknown>): void {
  // `keepalive`: a visitor who leaves right after the signal still counts.
  void fetch("/api/views", {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
