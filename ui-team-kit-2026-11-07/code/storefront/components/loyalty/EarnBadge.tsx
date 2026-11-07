import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatPts } from "@/lib/loyalty/format";
import type { ProductEarn } from "@/lib/loyalty/types";

import { Coin } from "./parts";

/**
 * The product page's earn badge (Claude Design «Loyalty Storefront»): what
 * buying this earns, in three looks — earns, does not earn (a grey coin), and
 * a live campaign (the base struck through beside the boosted figure and a
 * «2×» tag).
 *
 * NOT PERSONALISED: product pages are catalogue-cached, so the figure is the
 * entry-level estimate the API puts on the product (ADR 0043 §9) — never this
 * visitor's tier. A Server Component; nothing here needs the browser.
 */
export function EarnBadge({
  locale,
  earn,
  compactOnPhone = false,
}: {
  locale: Locale;
  earn: ProductEarn;
  /**
   * In the phone's buy bar the badge shares one row with the price: below
   * `lg` it draws only «+N» and the coin (the full sentence is the caller's
   * accessible name), so a long English line never widens the page.
   */
  compactOnPhone?: boolean;
}) {
  const t = messagesFor(locale).loyalty.badge;

  if (earn.kind === "none") {
    return (
      <span data-earn="none" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-chip)] py-1 pe-3 ps-1.5 text-caption font-semibold text-[var(--color-ink-subtle)]">
        <span className="opacity-60 grayscale">
          <Coin size={18} />
        </span>
        {t.none}
      </span>
    );
  }

  if (earn.kind === "campaign") {
    return (
      <span data-earn="campaign" className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-[var(--color-secondary-wash)] py-1 pe-1.5 ps-1.5 text-caption font-bold text-[var(--color-ink)]">
        <Coin size={18} />
        <s className="font-semibold text-[var(--color-ink-subtle)]" aria-label={fill(t.was, { pts: formatPts(locale, earn.basePts) })}>
          <bdi dir="ltr">{formatPts(locale, earn.basePts)}</bdi>
        </s>
        {compactOnPhone ? (
          <>
            <bdi dir="ltr" className="lg:hidden">
              +{formatPts(locale, earn.pts)}
            </bdi>
            <span className="hidden lg:inline">{fill(t.campaign, { pts: formatPts(locale, earn.pts) })}</span>
          </>
        ) : (
          <span>{fill(t.campaign, { pts: formatPts(locale, earn.pts) })}</span>
        )}
        <span className="rounded-full bg-[var(--color-secondary)] px-2 py-0.5 text-caption-xs font-extrabold text-[var(--color-on-secondary)]">
          {fill(t.tag, { factor: earn.factor })}
        </span>
      </span>
    );
  }

  return (
    <span data-earn="earns" className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-wash)] py-1 pe-3 ps-1.5 text-caption font-bold text-[var(--color-brand-500)]">
      <Coin size={18} />
      {compactOnPhone ? (
        <>
          <bdi dir="ltr" className="lg:hidden">
            +{formatPts(locale, earn.pts)}
          </bdi>
          <span className="hidden lg:inline">{fill(t.earns, { pts: formatPts(locale, earn.pts) })}</span>
        </>
      ) : (
        fill(t.earns, { pts: formatPts(locale, earn.pts) })
      )}
    </span>
  );
}
