"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { Money } from "@/lib/checkout/price-delta";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";

/** How long the page may take to open before the ways on are offered. */
const SLOW_AFTER_MS = 6000;
/**
 * How long «open the page again» is offered — well inside the page's own
 * life (30 minutes unless Tap says otherwise), so a tab left open never
 * reopens a page the server has since closed. The status check stays.
 */
const REOPEN_FOR_MS = 10 * 60 * 1000;

/**
 * The moment between «ادفع» and the payment page: the order is placed and
 * the customer is on the way to OmanNet's, KNET's, mada's, Benefit's or the
 * card's own page.
 *
 * NO COMP for this state — built to the checkout's design system (the
 * processing ring, the result page's column, `styles.ts` radii). It says
 * where they are going, for how much, under which order, and the three
 * steps of a hosted payment, so a slow page reads as progress, not a hang.
 *
 * If the page has not opened after a few seconds (a slow network, an app
 * that did not take the link), the ways on appear: open the page again —
 * the SAME charge, never a second one — or check the payment, which asks
 * the API (`/payment/complete`); nothing here decides it. Coming BACK to this
 * page from the gateway never shows it: `leaveForPayment` moves on to the
 * payment's own page.
 */
export function LeavingForPayment({
  locale,
  orderId,
  methodName,
  methodLogo,
  total,
  payUrl,
  note,
}: {
  locale: Locale;
  orderId: string;
  /** The chosen method's own name, from `GET /payment-methods`. */
  methodName?: string;
  methodLogo?: ReactNode;
  /** The placed order's total, as the server froze it. */
  total: Money | null;
  /** The gateway's page for THIS charge — opened again, never re-created. */
  payUrl: string | null;
  /** Placement answered with a message instead of a page. */
  note?: string;
}) {
  const m = messagesFor(locale);
  const [slow, setSlow] = useState(Boolean(note));
  const [reopenable, setReopenable] = useState(true);

  useEffect(() => {
    if (slow) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [slow]);

  useEffect(() => {
    const timer = window.setTimeout(() => setReopenable(false), REOPEN_FOR_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const pageAgain = reopenable ? payUrl : null;

  const statusHref = `/${locale}/payment/complete?order=${encodeURIComponent(orderId)}`;
  const title = note ?? (methodName ? m.checkout.leavingTitle.replace("{method}", methodName) : m.checkout.redirecting);
  const steps = [m.checkout.leavingStepPlaced, m.checkout.leavingStepPay, m.checkout.leavingStepConfirm];

  return (
    <section
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[480px] flex-col gap-6 rounded-[16px] bg-[var(--color-surface)] px-5 py-7 text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] lg:px-8"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden className="grid size-24 place-items-center rounded-full bg-[var(--color-brand-wash)]">
          <span className="block size-[70px] rotate-[150deg] bg-[var(--color-brand-500)] [mask-image:url(/brand/illus-processing.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] motion-safe:animate-spin" />
        </span>
        <h2 className="mt-2 text-heading-l font-bold leading-[1.4] lg:text-display">{title}</h2>
        {note ? null : <p className="max-w-[320px] text-body-s leading-[1.7] lg:text-body-l text-[var(--color-ink-muted)]">{m.checkout.leavingBody}</p>}
      </div>

      <div className="flex flex-col rounded-[16px] bg-[var(--color-chip)] px-4">
        {total ? (
          <div className="flex min-h-[60px] items-center justify-between gap-3 border-b border-[var(--color-line)]">
            <span className="flex items-center gap-2.5">
              {methodLogo}
              <span className="text-body-s font-bold text-[var(--color-ink-muted)] lg:text-body-l">{m.checkout.leavingAmount}</span>
            </span>
            <span dir="ltr" className="text-heading-m font-bold tabular-nums lg:text-heading-l text-[var(--color-brand-500)]">
              {formatMoney(locale, total.amount, total.currency)}
            </span>
          </div>
        ) : null}
        <div className="flex min-h-[48px] items-center justify-between gap-3 text-body-s lg:text-body-l">
          <span className="font-bold text-[var(--color-ink-muted)]">{m.orderView.orderNo}</span>
          <bdi dir="ltr" className="font-bold">
            #{orderId}
          </bdi>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => {
          const done = index === 0;
          const current = index === 1;
          return (
            <li key={step} aria-current={current ? "step" : undefined} className="flex items-center gap-3 text-body-s lg:text-body-l">
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-caption font-bold ${
                  done
                    ? "bg-[var(--color-success)] text-[var(--color-on-primary)]"
                    : current
                      ? "bg-[var(--color-brand-500)] text-[var(--color-on-cta)] shadow-[0_0_0_4px_var(--color-brand-wash)]"
                      : "bg-[var(--color-chip)] text-[var(--color-ink-subtle)]"
                }`}
              >
                {done ? (
                  <span className="block size-3.5 bg-current [mask-image:url(/brand/icon-check-white.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                ) : (
                  index + 1
                )}
              </span>
              <span className={current ? "font-extrabold" : done ? "font-bold" : "font-semibold text-[var(--color-ink-subtle)]"}>{step}</span>
            </li>
          );
        })}
      </ol>

      {slow ? (
        <div className="flex flex-col gap-2.5 border-t border-[var(--color-line)] pt-5">
          {note ? null : <p className="text-center text-body-s font-bold lg:text-body-l">{m.checkout.leavingSlow}</p>}
          {pageAgain ? (
            <a href={pageAgain} className={PRIMARY}>
              {m.checkout.leavingOpenAgain}
            </a>
          ) : null}
          <a href={statusHref} className={pageAgain ? SECONDARY : PRIMARY}>
            {m.checkout.leavingCheckStatus}
          </a>
          <p className="text-center text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.checkout.leavingNoDouble}</p>
        </div>
      ) : null}

      <p className="flex items-center justify-center gap-1.5 text-caption font-semibold text-[var(--color-ink-subtle)] lg:text-body-s">
        <span aria-hidden className="block size-3.5 bg-current [mask-image:url(/brand/icon-lock.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        {m.checkout.leavingSecure}
      </p>
    </section>
  );
}

const PRIMARY =
  "flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)]";
const SECONDARY =
  "flex h-[50px] w-full items-center justify-center rounded-[12px] px-4 text-body-s font-bold text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-[var(--color-chip)]";
