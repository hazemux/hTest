"use client";

import { useEffect, useRef } from "react";

import { settlePaidBasket } from "@/lib/cart/settle";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Asks the server, once, to empty the basket this captured order was bought
 * from. Rendered only where the page already knows the order is captured AND
 * this browser's basket was placed as this order; the server checks both
 * again (`settlePaidBasket`). Draws nothing.
 */
export function SettleBasket({ orderId, locale }: { orderId: string; locale: Locale }) {
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void settlePaidBasket(orderId, locale);
  }, [orderId, locale]);

  return null;
}
