"use client";

import { shownGatewayReason } from "@/lib/checkout/failure-copy";
import { useActionState } from "react";

import { resumePayment } from "@/lib/checkout/payment";
import { failureKind } from "@/lib/checkout/payment-reply";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «أكمل الدفع» on an order that is still waiting for its payment.
 *
 * A PLAIN FORM posting to a Server Action, so it works before hydration: the
 * action redirects to Tap's page (the order's existing charge when Tap has
 * one, a new one when the earlier start never reached Tap) or to the return
 * page when it settled — and otherwise comes back here with why not.
 */
export function ResumePayment({ locale, orderId }: { locale: Locale; orderId: string }) {
  const m = messagesFor(locale);
  const [result, action, pending] = useActionState(resumePayment, null);

  const kind = result?.failed ? failureKind(result.failureReason ?? null) : null;
  const problem = !result
    ? null
    : kind === "contact"
      ? m.payment.needContact
      : kind === "declined"
        ? m.payment.declined
        : result.noPage
          ? m.payment.noPage
          : (result.message ?? m.payment.startFailed);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="order" value={orderId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-[12px] bg-[var(--color-brand-500)] px-4 py-2 font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
      >
        {m.payment.resume}
      </button>
      {problem ? (
        <div role="alert" className="space-y-1">
          <p className="font-semibold text-[var(--color-danger)]">{problem}</p>
          {shownGatewayReason(result?.failureReason) ? (
            <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l" dir="auto">
              {m.payment.gatewayReason.replace("{reason}", shownGatewayReason(result?.failureReason) ?? "")}
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
