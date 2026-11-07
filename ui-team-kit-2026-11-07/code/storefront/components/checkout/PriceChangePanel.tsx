import type { PriceDelta } from "@/lib/checkout/price-delta";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";

/**
 * The order exists; its price is not the one the customer saw. Both figures,
 * and an explicit choice — nothing is charged until they accept (HANDBOOK §1).
 *
 * SHARED BY BOTH CHECKOUTS. The basket checkout used to answer a price change
 * by navigating to order-status, which drew neither figure nor any way to pay:
 * the order sat unpaid and the customer had nowhere to go. Now both paths
 * stop here, on the page that knows which method was chosen.
 *
 * Drawn as «Checkout Mobile» (2026-09-30) draws it: a quiet Background/subtle
 * box, the two figures side by side, the old one struck through, and accept
 * as an outlined button — the pay bar below stays the only filled one.
 */
export function PriceChangePanel({
  locale,
  delta,
  pending,
  onAccept,
  cancelHref,
}: {
  locale: Locale;
  delta: PriceDelta;
  pending: boolean;
  onAccept: () => void;
  cancelHref: string;
}) {
  const m = messagesFor(locale);

  return (
    <section role="alert" className="cq-enter flex flex-col gap-2.5 rounded-[12px] bg-[var(--color-bg-subtle)] p-3.5 text-[var(--color-ink)]">
      <h2 className="text-body-s font-bold leading-[1.5] lg:text-body-l">{m.checkout.priceChangedTitle}</h2>
      <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.checkout.priceChangedBody}</p>

      <dl className="flex gap-4 text-body-s lg:text-body-l">
        <div className="flex flex-col">
          <dt className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.checkout.priceBefore}</dt>
          <dd dir="ltr" className="text-[var(--color-ink-subtle)] line-through tabular-nums">
            {formatMoney(locale, delta.shown.amount, delta.shown.currency)}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">{m.checkout.priceNow}</dt>
          <dd dir="ltr" className="font-bold text-[var(--color-brand-500)] tabular-nums">
            {formatMoney(locale, delta.charged.amount, delta.charged.currency)}
          </dd>
        </div>
      </dl>

      {/* Only NOW does payment start. The order already exists at the new
          price; nothing was charged while the customer decided. */}
      <button
        type="button"
        disabled={pending}
        onClick={onAccept}
        className="flex h-11 items-center justify-center rounded-[10px] border border-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-brand-500)] transition hover:bg-[var(--color-primary-wash-lighter)] disabled:opacity-50"
      >
        {m.checkout.acceptNewPrice}
      </button>
      <a href={cancelHref} className="self-center text-caption font-semibold lg:text-body-s text-[var(--color-ink-muted)] underline underline-offset-4">
        {m.checkout.cancel}
      </a>
    </section>
  );
}
