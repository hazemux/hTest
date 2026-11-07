"use client";

import { useState } from "react";

import { canCheckInPage, safePaymentUrl } from "@/lib/checkout/bank-check";
import type { Locale } from "@/lib/i18n/locales";

import { BankCheckSheet } from "./BankCheckSheet";

/**
 * «أكمل التحقق من البطاقة» — the SAME charge's 3-D Secure page, reopened.
 * A link first (it works before any script); with one, and for a card, the
 * page opens in the sheet over the order instead of taking the customer away.
 */
export function ContinueBankCheck({
  url,
  orderId,
  locale,
  inPage,
  className,
  children,
}: {
  url: string;
  orderId: string;
  locale: Locale;
  /** The order was paid by card — a hosted page is never framed. */
  inPage: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Only an https page is ever linked; anything else stays on the order.
  const page = safePaymentUrl(url);
  if (!page) return null;

  return (
    <>
      <a
        href={page}
        onClick={(event) => {
          if (!inPage || !canCheckInPage()) return;
          event.preventDefault();
          setOpen(true);
        }}
        className={className}
      >
        {children}
      </a>
      {open ? <BankCheckSheet url={page} orderId={orderId} locale={locale} /> : null}
    </>
  );
}
