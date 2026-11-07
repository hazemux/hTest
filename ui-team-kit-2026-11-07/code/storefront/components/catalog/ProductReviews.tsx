import Image from "next/image";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { productReviews } from "@/lib/reviews/product-reviews";
import { STORE_TIME_ZONE } from "@/lib/i18n/time";
import { StarRow } from "@/components/reviews/StarRow";

/**
 * «تقييمات» — Figma `7513:30944` (2026-10-07): «541 تقييم | 4.5 ★» above the
 * review cards (muted grey, radius 12, 16 in: avatar 32/r8, name 14 semibold,
 * date 13, five 12px stars and the figure, the text 14).
 *
 * READ ONLY (ADR 0042, owner 2026-10-07): customers rate their ORDER from the
 * order page, and an approved order review shows here on every product the
 * order held. Nothing on this page writes a review any more.
 *
 * ONLY APPROVED REVIEWS ARE HERE (the owner, 2026-09-30); the API sends no
 * other. Fetched without a session — what a signed-in reader wrote is on
 * their order, not here — so it is a SHARED read (`productReviews`), the same
 * for every visitor.
 */
export async function ProductReviews({ locale, slug }: { locale: Locale; slug: string }) {
  const m = messagesFor(locale);
  const page = await productReviews(locale, slug);

  if (!page) {
    return <p className="text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.sectionUnavailable}</p>;
  }

  const { summary, data } = page;

  if (summary.count === 0 || data.length === 0) {
    return <p className="text-body-s font-medium text-[var(--color-ink-subtle)] lg:text-body-l">{m.product.reviewsNone}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* `Review Summary`: the count, a hairline, the average and its star. */}
      <p className="flex items-center gap-3 text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">
        <span>{(summary.count === 1 ? m.product.reviewsCountOne : m.product.reviewsCount).replace("{count}", String(summary.count))}</span>
        <span aria-hidden className="h-6 w-0.5 rounded-full bg-[var(--color-ink)]" />
        <span className="flex items-center gap-2">
          <bdi dir="ltr">{Number(summary.average ?? 0).toFixed(1)}</bdi>
          <Image src="/brand/icon-star-rating.svg" alt={m.product.reviewStarsOutOf5} width={20} height={20} unoptimized className="size-5" />
        </span>
      </p>

      <ul className="flex flex-col gap-2">
        {data.map((review, index) => (
          <li key={review.public_id ?? `review-${index}`}>
            <article className="flex flex-col rounded-[12px] bg-[var(--color-surface-muted)] p-4">
              <div className="flex items-center gap-2">
                {review.author.avatar_url ? (
                  <Image src={review.author.avatar_url} alt="" width={32} height={32} className="size-8 rounded-[8px] object-cover" />
                ) : (
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-[8px] bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-primary)]">
                    {(review.author.name ?? m.product.reviewAnonymous).slice(0, 1)}
                  </span>
                )}
                <div className="flex flex-col">
                  <span className="text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-body-m">{review.author.name ?? m.product.reviewAnonymous}</span>
                  {review.created_at ? (
                    <time dateTime={review.created_at} className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
                      {reviewDate(locale, review.created_at)}
                    </time>
                  ) : null}
                </div>
              </div>
              <p className="flex items-center gap-2">
                <StarRow rating={review.rating} label={m.product.reviewStarN.replace("{n}", String(review.rating))} size="sm" tone="gold" />
                <span dir="ltr" className="text-body-s font-bold text-[var(--color-ink-muted)] lg:text-body-m">
                  {review.rating.toFixed(1)}
                </span>
              </p>
              {review.body ? <p dir="auto" className="whitespace-pre-line text-body-s leading-[1.5] text-[var(--color-ink)]">{review.body}</p> : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «14 مايو, 21:07» — the comp's day, month and 24-hour time, in Dubai. */
function reviewDate(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-AE", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: STORE_TIME_ZONE,
  }).format(date);
}
