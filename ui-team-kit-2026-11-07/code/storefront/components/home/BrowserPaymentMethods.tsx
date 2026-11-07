"use client";

import { useEffect, useState } from "react";

import { PaymentMethods, type PaymentMethodTile } from "@/components/home/PaymentMethods";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «طرق الدفع» ON THE EDGE'S SHARED COPY, asked by the browser (ADR 0052, S12).
 * The copy is one page for every visitor of a currency, but a domestic rail is
 * offered by country, so the strip is the visitor's own: `/api/payment-methods`
 * (private, never cached) lists it for the copy's currency and the visitor's
 * country, exactly as `PaymentMethodsSlot` does when it draws the page itself.
 *
 * Until the answer, the strip's room is held (the slot's fallback, same
 * heights); a failure or an empty list draws nothing, as on the server.
 */
export function BrowserPaymentMethods({ locale, currency }: { locale: Locale; currency: string }) {
  const [methods, setMethods] = useState<PaymentMethodTile[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ locale, currency });
    fetch(`/api/payment-methods?${query}`, { credentials: "same-origin", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ methods: PaymentMethodTile[] }>) : { methods: [] }))
      .then((answer) => setMethods(answer.methods))
      .catch(() => setMethods([]));
    return () => controller.abort();
  }, [locale, currency]);

  if (methods === null) {
    return <div aria-hidden data-cq-fallback="payment-methods" className="mx-auto mt-6 min-h-[136px] w-full max-w-[1248px] lg:mt-12 lg:min-h-[186px]" />;
  }
  return <PaymentMethods locale={locale} currency={currency} methods={methods} />;
}
