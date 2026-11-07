"use client";

import { useEffect } from "react";

import { finishBuyGuide } from "@/lib/catalog/buy-guide";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «كيف تشحن؟» on the product page (`lib/catalog/buy-guide.ts`): three numbered
 * steps in one quiet row above the packages, with a close button — the
 * numbers carry the order, so there are no arrows to turn for RTL. For a game
 * that needs an ID the middle step is the ID; for a card with nothing to fill
 * in it is the payment, and the code arrives in «طلباتي».
 *
 * Hidden by CSS (`html[data-guide='done'] .cq-buy-guide`) before the first
 * paint for anyone who closed it or has paid in this browser — so it is
 * rendered by the server and never pops in late.
 */
export function BuyGuide({ locale, needsId }: { locale: Locale; needsId: boolean }) {
  const t = messagesFor(locale).product.buyGuide;
  const steps = needsId ? [t.choose, t.enterId, t.payGet] : [t.choose, t.pay, t.codeInOrders];

  return (
    <section aria-label={t.title} className="cq-buy-guide flex items-start gap-3 rounded-[14px] bg-[var(--color-primary-wash-lighter)] px-3.5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-body-s font-bold text-[var(--color-ink)] lg:text-body-m">{t.title}</p>
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption font-semibold text-[var(--color-ink-muted)] lg:text-body-s">
          {steps.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)] text-caption-xs font-bold text-[var(--color-on-cta)]">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        onClick={finishBuyGuide}
        aria-label={t.close}
        title={t.close}
        className="-me-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-ink-subtle)] transition hover:bg-[var(--color-chip)]"
      >
        <span aria-hidden className="block size-3 bg-current [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      </button>
    </section>
  );
}

/** Placed on the captured payment result: the customer has bought once, so the guide is done. */
export function FinishBuyGuide() {
  useEffect(() => finishBuyGuide(), []);
  return null;
}
