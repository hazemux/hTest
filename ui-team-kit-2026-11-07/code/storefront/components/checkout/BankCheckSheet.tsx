"use client";

import { useEffect, useId, useRef, useState } from "react";

import { framedReturnHref, safePaymentUrl } from "@/lib/checkout/bank-check";
import { reportPaymentSignal } from "@/lib/monitoring/payment-signal";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/** Without a first load by now, the full-page way out is offered up front. */
const SLOW_AFTER_MS = 12_000;

/**
 * «التحقق من البنك» — the card's 3-D Secure page in a sheet over our page
 * (owner, 2026-10-01). Full screen on the phone, a centred card from `lg`.
 * See `lib/checkout/bank-check.ts` for how the frame ends.
 *
 * EVERY WAY IT CAN GO:
 * - the bank confirms or refuses → Tap sends the frame to `/payment/complete`
 *   → the whole page follows (three layers, never a result inside the frame);
 * - the bank's page will not show in a frame, or never loads → «افتحها بملء
 *   الشاشة» is always there, and after 12 seconds it is the first thing said
 *   — whether or not the frame fired `load`: a browser fires `load` for the
 *   error page of a refused frame too, so a load proves nothing;
 * - an address that is not `https:` is never framed or followed — the
 *   customer goes to the order's page instead;
 * - no `<dialog>` in this browser → the bank's page opens full page, as before;
 * - the customer closes it (✕, Escape) → the order's page, whose «أكمل التحقق
 *   من البطاقة» reopens THIS charge's page. Never a second charge.
 */
export function BankCheckSheet({ url: given, orderId, locale }: { url: string; orderId: string; locale: Locale }) {
  const m = messagesFor(locale);
  const url = safePaymentUrl(given);
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const leaving = useRef(false);
  const titleId = useId();
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  const orderHref = `/${locale}/order-status/${encodeURIComponent(orderId)}`;

  function leaveTo(href: string) {
    if (leaving.current) return;
    leaving.current = true;
    window.location.assign(href);
  }

  useEffect(() => {
    if (!url) {
      leaving.current = true;
      window.location.assign(orderHref);
      return;
    }
    const element = dialog.current;
    if (!element || typeof element.showModal !== "function") {
      leaving.current = true;
      window.location.assign(url);
      return;
    }
    if (!element.open) element.showModal();
    const timer = window.setTimeout(() => {
      setSlow(true);
      reportPaymentSignal("bank_check_slow", { stage: "sheet" });
    }, SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [url, orderHref]);

  function onFrameLoad() {
    setLoaded(true);
    const back = framedReturnHref(frame.current, window.location.origin);
    if (back) leaveTo(back);
  }

  // After 12 s the full-page way is offered whatever `load` said: a refused
  // frame fires `load` on its error page.
  const showSlow = slow;

  return (
    <dialog
      ref={dialog}
      // The live chat steps aside while it is open (globals.css).
      data-bank-check
      aria-labelledby={titleId}
      // Escape closes the way ✕ does — to the order, never to a bare page.
      onCancel={(event) => {
        event.preventDefault();
        leaveTo(orderHref);
      }}
      className="fixed inset-0 z-[80] m-0 flex h-dvh max-h-none w-full max-w-none flex-col overflow-hidden bg-[var(--background)] p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[var(--color-backdrop)] lg:m-auto lg:h-[min(720px,92dvh)] lg:max-w-[480px] lg:rounded-[20px] [&:not([open])]:hidden"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-line)] px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] lg:pt-4">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-success-wash)]">
          <span className="block size-5 bg-[var(--color-success)] [mask-image:url(/brand/icon-security-lock.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <h2 id={titleId} className="text-body-l font-bold leading-[1.4] lg:text-heading-m">
            {m.payment.bankCheckTitle}
          </h2>
          <span className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">{m.payment.bankCheckSubtitle}</span>
        </span>
        <a
          href={orderHref}
          aria-label={m.payment.bankCheckClose}
          title={m.payment.bankCheckClose}
          onClick={(event) => {
            event.preventDefault();
            leaveTo(orderHref);
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-chip)]"
        >
          <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </a>
      </header>

      {showSlow ? (
        <p role="status" className="shrink-0 bg-[var(--color-warning-wash)] px-4 py-2.5 text-body-s font-semibold leading-[1.6] lg:text-body-l">
          {loaded ? m.payment.bankCheckBlank : m.payment.bankCheckSlow}
        </p>
      ) : null}

      <div className="cq-bank-frame relative min-h-0 flex-1">
        <iframe
          ref={frame}
          src={url ?? undefined}
          title={m.payment.bankCheckFrameTitle}
          onLoad={onFrameLoad}
          // The bank's page runs its own scripts and forms, and Tap moves the
          // frame between pages: no `sandbox`, which would break the code step.
          allow="payment"
          className="absolute inset-0 size-full border-0"
        />
        {!loaded ? (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--background)]">
            <span aria-hidden className="size-8 rounded-full border-[3px] border-[var(--color-brand-500)] border-t-transparent motion-safe:animate-spin" />
            <span className="text-body-s font-semibold text-[var(--color-ink-muted)] lg:text-body-l">{m.payment.bankCheckLoading}</span>
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 flex-col gap-1.5 border-t border-[var(--color-line)] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 text-center">
        <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.payment.bankCheckKeepOpen}</p>
        <a
          href={url ?? orderHref}
          onClick={(event) => {
            event.preventDefault();
            reportPaymentSignal("bank_check_fullpage", { stage: loaded ? "loaded" : "loading" });
            leaveTo(url ?? orderHref);
          }}
          className={`text-body-s font-bold underline underline-offset-4 lg:text-body-l ${showSlow ? "text-[var(--color-brand-500)]" : "text-[var(--color-ink)]"}`}
        >
          {m.payment.bankCheckFullPage}
        </a>
      </footer>
    </dialog>
  );
}
