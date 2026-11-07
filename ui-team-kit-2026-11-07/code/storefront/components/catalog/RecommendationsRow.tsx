import { PackageCard } from "@/components/catalog/PackageCard";
import type { RecommendationCards } from "@/lib/catalog/recommendation-cards";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/** Desktop shows this many — exactly one row of `lg:grid-cols-6`. */
const DESKTOP_MAX = 6;

/**
 * «قد ينال إعجابك أيضاً»'s markup — drawn by the server (`Recommendations`)
 * and, for a visitor's own history while `CQ_EDGE_CACHE` is on, by the
 * browser (`ViewedRecommendations`). Imports nothing server-only.
 *
 * ONE ROW ON DESKTOP (owner 2026-10-13). The phone scrolls sideways through up
 * to `PHONE_MAX` cards; desktop shows the first `DESKTOP_MAX`, so a seventh
 * never wraps alone onto a second line. CSS, not a slice: the server cannot
 * know the viewport (the same HTML at every width, ADR 0046), so cards past
 * the sixth carry `lg:hidden`. They are `display: none` there — out of the
 * layout and the accessibility tree, and their lazy images are never fetched.
 */
export function RecommendationsRow({ locale, cards, hearts }: RecommendationCards & { locale: Locale }) {
  if (cards.length === 0) return null;
  const saved = hearts === null ? null : new Set(hearts);

  return (
    // A named region: a screen reader can jump to it, and the page's own
    // purchase area can be told apart from it.
    <section aria-labelledby="also-like" className="mt-6 lg:mt-12">
      <h2 id="also-like" className="mb-2 text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:mb-6 lg:text-heading-l lg:font-bold">
        {messagesFor(locale).product.alsoLike}
      </h2>
      {/* The phone's row runs past the 24px gutter (`Also Like Products` is
          336 wide in a 312 column), 8px between cards. */}
      <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-x-5 lg:overflow-visible lg:px-0">
        {cards.map((pkg, index) => (
          <li key={pkg.key} className={index < DESKTOP_MAX ? "w-[150px] shrink-0 lg:w-auto" : "w-[150px] shrink-0 lg:hidden"}>
            <PackageCard locale={locale} pkg={pkg} favourited={saved === null ? null : pkg.productPublicId !== null && saved.has(pkg.productPublicId)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
