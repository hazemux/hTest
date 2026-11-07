"use client";

import { useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { RateOrderSheet } from "./RateOrderSheet";

/**
 * «قيم الطلب» under the order's actions (Figma `7563:56097`): the brand
 * button with a star, opening the review sheet — open from the start when
 * the page was reached from the review email (`?review=1`). Shown only while
 * the order has never been reviewed: a sent review is final (owner,
 * 2026-10-07), so the page then shows its status instead.
 */
export function RateOrderButton({
  locale,
  orderId,
  rewardPoints,
  openInitially = false,
}: {
  locale: Locale;
  orderId: string;
  rewardPoints: number;
  openInitially?: boolean;
}) {
  const m = messagesFor(locale).orderReview;
  const [open, setOpen] = useState(openInitially);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 text-body-s font-bold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99] lg:text-body-l"
      >
        <span aria-hidden className="block size-[18px] shrink-0 bg-[var(--color-secondary)] [mask-image:url(/brand/icon-star-rate-filled.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        {m.rateOrder}
      </button>
      <RateOrderSheet
        locale={locale}
        orderId={orderId}
        title={m.title}
        rewardPoints={rewardPoints}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
