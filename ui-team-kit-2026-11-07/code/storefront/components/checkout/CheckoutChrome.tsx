import { failureSentence, shownGatewayReason } from "@/lib/checkout/failure-copy";
import type { PaymentMethodView } from "@/lib/checkout/methods";
import type { StartPaymentResult } from "@/lib/checkout/payment";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { payLabel } from "./payment/PaymentSection";

/**
 * The pieces both checkouts share from the mobile checkout comps
 * (`6847:92697`, then «Checkout Mobile», 2026-09-30): the pay button and its
 * bar, why a payment did not go through, and
 * the processing sheet. Presentational only — which order is paid, and when,
 * stays with the form that renders them.
 */

/** The pay button's look lives with the basket's, so every page draws one button. */
export { CTA_BUTTON, PAY_BAR } from "./styles";

/**
 * Why the payment did not go through — our sentence, the gateway's reason
 * beneath it — drawn beside the pay button, which now pays THE SAME order
 * again. The error wash, as the comp draws it: red words on the palest red.
 */
export function PaymentFailureNotice({ locale, failure }: { locale: Locale; failure: StartPaymentResult }) {
  const m = messagesFor(locale);
  const reason = shownGatewayReason(failure.failureReason);

  return (
    <div role="alert" className="cq-enter flex flex-col gap-1 rounded-[12px] bg-[var(--color-error-subtlest)] px-3.5 py-3">
      <p className="text-body-s font-bold leading-[1.55] text-[var(--color-danger)] lg:text-body-l">
        {failure.failed
          ? failureSentence(m, failure.failureReason ?? null, m.payment.failedRetryBody, failure.declineCategory)
          : failure.noPage
            ? m.payment.stillVerifying
            : (failure.message ?? m.payment.startFailed)}
      </p>
      {reason ? (
        <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s" dir="auto">
          {m.payment.gatewayReason.replace("{reason}", reason)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the pay button says for the chosen method. A card is «إتمام الدفع»
 * (the comp's words); every other method keeps saying where it goes next.
 */
export function payButtonWords(locale: Locale, method: PaymentMethodView | undefined): string {
  if (method?.card_sdk) return messagesFor(locale).payment.completePayment;
  return payLabel(locale, method, null);
}

/** The pay button's words at the start and the server's total at the end. */
export function PayButtonLabel({ words, amount }: { words: string; amount: string | null }) {
  return (
    <>
      <span>{words}</span>
      {amount ? (
        <span dir="ltr" className="tabular-nums">
          {amount}
        </span>
      ) : null}
    </>
  );
}

/**
 * «جاري معالجة عملية الدفع» (`6847:94516`) while a payment is in flight: a
 * sheet from the bottom of the phone over the dimmed checkout, a centred card
 * from `lg`. It covers the page — the tab bar too, as the comp's sheets do —
 * so nothing is pressed twice; it closes by itself — when the payment leaves
 * for the bank, lands, or asks for more.
 */
export function ProcessingSheet({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  return (
    <div className="cq-fade-in fixed inset-0 z-[60] flex items-end bg-[var(--color-backdrop)] backdrop-blur-[2px] lg:items-center lg:justify-center">
      <div
        role="status"
        aria-live="polite"
        className="flex w-full flex-col items-center gap-1 rounded-t-[12px] bg-[var(--background)] p-6 text-center lg:w-[360px] lg:rounded-[12px]"
      >
        {/* The comp's ring, in the theme's primary (#007bbf / #0991dc). */}
        <span aria-hidden className="grid size-24 place-items-center">
          <span className="block h-[70.277px] w-[70.277px] rotate-[150deg] bg-[var(--color-brand-500)] [mask-image:url(/brand/illus-processing.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] motion-safe:animate-spin" />
        </span>
        <p className="text-body-l font-bold leading-[1.5] text-[var(--color-brand-500)] lg:text-display">{m.payment.processingTitle}</p>
        <p className="text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-m">{m.payment.processingBody}</p>
      </div>
    </div>
  );
}
