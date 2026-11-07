import { formatMoney } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locales";

/**
 * A price the SERVER decided, formatted for reading.
 *
 * `amount` arrives as a string and stays one until Intl formats it. It is
 * never parsed into a number for display, never rounded here, never added to
 * anything. Every figure on this storefront came from the pricing engine with
 * its FX rate, markup, VAT and band rounding already applied — re-deriving any
 * part of it in a component is how two screens start disagreeing about what
 * something costs.
 */
export function Price({
  locale,
  amount,
  currency,
  className,
}: {
  locale: Locale;
  amount: string;
  currency: string;
  className?: string;
}) {
  return (
    <span className={className} dir="ltr">
      {formatMoney(locale, amount, currency)}
    </span>
  );
}
