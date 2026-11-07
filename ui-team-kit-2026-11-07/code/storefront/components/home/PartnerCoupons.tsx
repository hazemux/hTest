import type { CSSProperties } from "react";
import Link from "next/link";

import { PartnerLogo } from "@/components/partner-coupons/PartnerLogo";
import { PARTNER_COUPON_ANCHOR, type PartnerCouponView } from "@/lib/content/partner-coupons-view";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «أكواد خصم شركائنا» — the home row of partner codes, built to the comps:
 * desktop `3840:6384`, phone `6847:97950`.
 *
 * |          | card        | ground                 | logo box | offer line       | button          |
 * |----------|-------------|------------------------|----------|------------------|-----------------|
 * | desktop  | 5-up × 154  | Background/subtle, r8  | 126 × 56 | Body/Bold-L 16   | SemiBold-S 14   |
 * | phone    | 92 × 128    | same, 8×12 padding     | 72 × 45  | Bold 12          | SemiBold 10     |
 *
 * The comp's "10% / 5%" slot is the offer line STAFF wrote (`headline`) —
 * never a figure derived here. «عرض التفاصيل» opens that code on the
 * partner-codes page, where the code, its conditions and the store link are.
 *
 * Staff choose which codes appear ("Show on the home page"); none chosen, no
 * row. The phone scrolls sideways in two rows, row-major, like the apps row.
 */
export function PartnerCoupons({ locale, coupons }: { locale: Locale; coupons: PartnerCouponView[] }) {
  if (coupons.length === 0) return null;

  const m = messagesFor(locale).partnerCoupons;
  const phoneColumns = { "--phone-cols": Math.max(Math.ceil(coupons.length / 2), 1) } as CSSProperties;

  return (
    <section className="mx-auto mt-6 w-full max-w-[1248px] px-6 lg:mt-12" aria-labelledby="partner-coupons-heading">
      {/* Body/Bold-S 14/1.5 on the phone, Heading/Bold-L 20/1.4 on desktop;
          20 down to the cards on the phone, 16 on desktop. */}
      <h2
        id="partner-coupons-heading"
        className="mb-5 text-body-s font-bold leading-[1.5] text-[var(--color-ink)] lg:mb-4 lg:text-heading-l lg:leading-[1.4]"
      >
        <Link href={`/${locale}/partner-coupons`} className="hover:underline">
          {m.title}
        </Link>
      </h2>

      {/* `relative`: each card's merchant name is `sr-only` — ABSOLUTELY placed,
          so an unpositioned scroller is not its containing block and the
          scroller never clips it. The names then sit at their static position
          along the row, far past the viewport, and the page itself scrolls
          sideways (an RTL phone showed 126px of white). */}
      <ul
        className="relative -mx-6 grid grid-cols-[repeat(var(--phone-cols),92px)] gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid-cols-5 lg:overflow-visible lg:px-0 lg:pb-0"
        style={phoneColumns}
      >
        {coupons.map((coupon) => (
          <li key={coupon.id} className="min-w-0">
            <Link
              href={`/${locale}/partner-coupons#${PARTNER_COUPON_ANCHOR(coupon.id)}`}
              className="group flex h-[128px] w-[92px] flex-col items-center justify-center gap-2 rounded-[8px] bg-[var(--color-surface-subtle)] px-2 py-3 transition hover:brightness-95 lg:h-[154px] lg:w-auto lg:justify-between lg:gap-0 lg:p-3"
            >
              <span className="sr-only">{coupon.merchantName}</span>
              <PartnerLogo
                logo={coupon.logo}
                name={coupon.merchantName}
                className="h-[45px] w-[72px] lg:h-[56px] lg:w-[126px]"
                sizes="(min-width: 1024px) 126px, 72px"
              />
              {/* The phone column is exactly the comp's 128: 12 + logo 45 + 8 +
                  line 12 + 12 + button 27 + 12. The comp trims the offer
                  line's box to its cap height (8px, 16 below it); CSS cannot
                  do that everywhere yet, so the full 12px line and a 12px gap
                  land on the same total. */}
              <span className="flex w-full flex-col items-center gap-3 lg:gap-4">
                <span
                  dir="auto"
                  title={coupon.headline}
                  className="text-gradient-brand max-w-full truncate text-caption font-bold leading-none lg:text-body-l lg:leading-[1.5]"
                >
                  {coupon.headline}
                </span>
                <span className="w-full rounded-[6px] bg-[var(--color-primary)] p-1 text-center text-caption-xs font-semibold text-[var(--color-on-primary)] transition group-hover:bg-[var(--color-primary-hover)] lg:text-body-s lg:leading-[1.5]">
                  {m.viewDetails}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
