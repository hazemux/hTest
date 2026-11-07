"use client";

import type { StartPaymentResult } from "@/lib/checkout/payment";
import { failureSentence, shownGatewayReason } from "@/lib/checkout/failure-copy";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * A payment that did not start — said plainly, with a way on.
 *
 * THE REASON IS SHOWN, NOT HIDDEN. Our sentence first, in the customer's
 * language, for the reasons we recognise (no phone or email, a declined
 * card); Tap's own words beneath it as the detail, because support will ask
 * for them and the customer should not have to guess.
 *
 * THE RETRY IS THE SAME ORDER. `onRetry` pays for the order already placed —
 * never places another — so pressing it twice cannot buy twice.
 */
export function PaymentProblem({
  locale,
  orderId,
  result,
  pending,
  onRetry,
}: {
  locale: Locale;
  orderId: string;
  result: StartPaymentResult;
  pending: boolean;
  onRetry: () => void;
}) {
  const m = messagesFor(locale);
  const sentence = result.failed
    ? failureSentence(m, result.failureReason ?? null, m.payment.startFailed, result.declineCategory)
    : result.noPage
      ? m.payment.noPage
      : (result.message ?? m.payment.startFailed);

  return (
    <section role="alert" className="space-y-3 rounded-[16px] border-2 border-[var(--color-danger)] p-5">
      <p className="font-semibold text-[var(--color-ink)]">{sentence}</p>
      {shownGatewayReason(result.failureReason) ? (
        <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l" dir="auto">
          {m.payment.gatewayReason.replace("{reason}", shownGatewayReason(result.failureReason) ?? "")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        {result.retryable !== false ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={pending}
            className="rounded-[12px] bg-[var(--color-brand-500)] px-4 py-2 font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
          >
            {m.payment.retry}
          </button>
        ) : null}
        <a href={`/${locale}/order-status/${orderId}`} className="font-semibold underline">
          {m.nav.orderStatus}
        </a>
      </div>
    </section>
  );
}
