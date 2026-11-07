import { CopyCodeButton } from "@/components/partner-coupons/CopyCodeButton";
import { PartnerLogo } from "@/components/partner-coupons/PartnerLogo";
import {
  PARTNER_COUPON_ANCHOR,
  partnerVisitHref,
  type PartnerCouponView,
  type PartnerOfferKind,
} from "@/lib/content/partner-coupons-view";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * One partner code on the partner-codes page, in the home row's language
 * (Background/subtle card, r8, the brand-gradient offer line) with what the
 * home card leaves out: the kind of offer, the code, its conditions, where it
 * works, a verified end date, and the store link.
 *
 * HONEST LABELS. The kind is a person's decision (staff choose it in the
 * admin), and merchant cashback always carries the note that the STORE pays
 * it and that it is not ChargerQuick wallet credit. No savings figure, end
 * date, popularity or "tested" claim is ever drawn that the data did not
 * state — an unknown end date draws nothing at all.
 *
 * "Visit store" is a plain anchor to our counting redirect, not a `<Link>`:
 * prefetching it would count visits nobody made.
 */
export function PartnerCouponCard({ locale, coupon }: { locale: Locale; coupon: PartnerCouponView }) {
  const m = messagesFor(locale).partnerCoupons;
  const kindLabel: Record<PartnerOfferKind, string> = {
    discount: m.kindDiscount,
    cashback: m.kindCashback,
    other: m.kindOther,
  };
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countries = coupon.countries.map((code) => {
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  });
  const expires = coupon.expiresAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Asia/Dubai" }).format(new Date(coupon.expiresAt))
    : null;

  return (
    <article
      id={PARTNER_COUPON_ANCHOR(coupon.id)}
      className="flex scroll-mt-24 flex-col gap-4 rounded-[8px] bg-[var(--color-surface-subtle)] p-4 target:outline-2 target:outline-[var(--color-primary)]"
    >
      <header className="flex items-center gap-3">
        <PartnerLogo
          logo={coupon.logo}
          name={coupon.merchantName}
          className="h-[48px] w-[72px] rounded-[6px] bg-[var(--color-surface)] lg:h-[56px] lg:w-[96px]"
          sizes="96px"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body-l font-bold leading-[1.5] lg:text-heading-m text-[var(--color-ink)]">{coupon.merchantName}</h2>
          <p className="mt-0.5">
            <span className="inline-block rounded-[6px] bg-[var(--color-brand-wash)] px-2 text-caption font-semibold leading-[1.5] text-[var(--color-ink)]">
              {kindLabel[coupon.kind]}
            </span>
          </p>
        </div>
      </header>

      <p dir="auto" className="text-gradient-brand text-heading-l font-bold leading-[1.4] lg:text-display">
        {coupon.headline}
      </p>

      <CopyCodeButton
        couponId={coupon.id}
        code={coupon.code}
        labels={{ code: m.codeLabel, copy: m.copy, copied: m.copied, copyFailed: m.copyFailed }}
      />

      {coupon.kind === "cashback" ? (
        <p className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">{m.cashbackNote}</p>
      ) : null}

      {expires || countries.length > 0 ? (
        <div className="grid gap-1 text-body-s leading-[1.5] lg:text-body-l">
          {expires ? <p className="font-semibold text-[var(--color-ink)]">{m.expires.replace("{date}", expires)}</p> : null}
          {countries.length > 0 ? (
            <p className="text-[var(--color-ink)]">
              <span className="text-[var(--color-ink-muted)]">{m.countries}: </span>
              {countries.join(locale === "ar" ? "، " : ", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {coupon.terms.length > 0 ? (
        <details className="group rounded-[8px] bg-[var(--color-surface)] px-3 py-2">
          <summary className="cursor-pointer text-body-s font-semibold leading-[1.5] lg:text-body-l text-[var(--color-ink)]">
            {coupon.termsFromProvider ? m.providerConditions : m.conditions}
          </summary>
          <ul dir={coupon.termsFromProvider ? "auto" : undefined} className="mt-2 list-disc space-y-1 ps-5 text-body-s leading-[1.6] text-[var(--color-ink-muted)]">
            {coupon.terms.map((line, index) => (
              <li key={index} dir="auto">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {coupon.hasStoreLink ? (
        <a
          href={partnerVisitHref(locale, coupon.id)}
          target="_blank"
          rel="sponsored nofollow noopener"
          aria-label={m.visitStoreFor.replace("{merchant}", coupon.merchantName)}
          className="mt-auto rounded-[8px] border border-[var(--color-primary)] px-4 py-2 text-center text-body-s font-semibold leading-[1.5] text-[var(--color-primary)] transition hover:bg-[var(--color-brand-wash)]"
        >
          {m.visitStore}
        </a>
      ) : null}
    </article>
  );
}
