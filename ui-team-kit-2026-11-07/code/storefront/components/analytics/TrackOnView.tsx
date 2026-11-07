"use client";

import { useEffect, useRef } from "react";

import {
  trackCartViewed,
  trackCheckoutStarted,
  trackProductViewed,
  type AnalyticsItem,
} from "@/lib/analytics/events";

/**
 * Fires one funnel event when a page shows (Zaraz spec §3.1). `signature`
 * names what was shown — a product option key, the cart's line ids — so a
 * re-render does not repeat the event and a real change does.
 */
export function TrackOnView({
  event,
  items,
  signature,
}: {
  event: "product" | "cart" | "checkout";
  items: AnalyticsItem[];
  signature: string;
}) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === signature || items.length === 0) return;
    sent.current = signature;
    if (event === "product") trackProductViewed(items[0]!);
    else if (event === "cart") trackCartViewed(items);
    else trackCheckoutStarted(items);
  }, [event, items, signature]);

  return null;
}
