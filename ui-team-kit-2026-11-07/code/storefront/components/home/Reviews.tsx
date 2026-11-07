import Image from "next/image";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import type { FeaturedReview } from "@/lib/reviews/featured";
import { StarRow } from "@/components/reviews/StarRow";

/**
 * «التقييمات» on the home page — Figma `6847:98003` (phone): a row of
 * 140-wide grey cards scrolling sideways, each the customer's first name, five
 * 8px stars and their words; from tablet (`md`, HANDBOOK §5) the desktop row
 * (`3840:6449`): the same cards, wider and centred, three or four to a row.
 *
 * REAL REVIEWS ONLY (ADR 0042): approved order reviews that staff picked for
 * the home page (`GET /content/reviews`). With none picked the section draws
 * nothing — the comp's sample quote is never shown as if a customer said it.
 */
export function Reviews({ locale, reviews }: { locale: Locale; reviews: FeaturedReview[] }) {
  const m = messagesFor(locale);

  if (reviews.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1248px] px-6 py-6" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading" className="mb-4 text-center text-body-s font-bold text-[var(--color-ink)] md:text-heading-m lg:text-heading-l">
        {m.home.reviewsTitle}
      </h2>

      <ul className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
        {reviews.map((review) => (
          <li
            key={review.public_id}
            className="flex min-h-[135px] w-[140px] shrink-0 snap-start flex-col gap-2 rounded-[12px] bg-[var(--color-bg-subtle)] p-2.5 md:w-auto md:min-w-[220px] md:flex-1 md:items-center md:p-4 md:text-center xl:min-w-[280px]"
          >
            <figure className="flex flex-col gap-2 md:items-center">
              <figcaption className="flex items-center gap-2 md:flex-col">
                {review.author.avatar_url ? (
                  <Image src={review.author.avatar_url} alt="" width={24} height={24} className="size-6 shrink-0 rounded-[6px] object-cover" />
                ) : null}
                <span className="flex flex-col gap-1 md:items-center">
                  <span dir="auto" className="text-caption font-semibold text-[var(--color-ink)] lg:text-body-s">{review.author.name ?? m.product.reviewAnonymous}</span>
                  <StarRow rating={review.rating} label={m.home.reviewRating.replace("{rating}", String(review.rating))} size="xs" tone="ink" />
                </span>
              </figcaption>
              <blockquote dir="auto" className="line-clamp-4 text-caption font-medium leading-[1.5] text-[var(--color-ink)] lg:text-body-l">{review.body}</blockquote>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
