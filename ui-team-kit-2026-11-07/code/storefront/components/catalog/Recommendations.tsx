import { cookies } from "next/headers";

import { RecommendationsRow } from "@/components/catalog/RecommendationsRow";
import { ViewedRecommendations } from "@/components/catalog/ViewedRecommendations";
import { readSessionToken } from "@/lib/account/session";
import { recommendationCards } from "@/lib/catalog/recommendation-cards";
import { parseViewed, VIEWED_COOKIE } from "@/lib/catalog/viewed";
import { edgeCacheEnabled } from "@/lib/config/edge-cache";
import { currencyForVisitor } from "@/lib/currency/visitor";
import type { Locale } from "@/lib/i18n/locales";

/**
 * «قد ينال إعجابك أيضاً» — the row under a purchase page (`7425:40340` on the
 * phone: a sideways row of the packages comp's 150px cards; six up on desktop;
 * the markup is `RecommendationsRow`).
 *
 * RANKED BY THE API from what this visitor has opened (`cq_viewed`, written
 * by `RecordProductView`) — the games they looked at, then the rest of those
 * sections, then featured products. Never the page's own options, and never
 * filtered by what they bought: see `RecommendProducts` on the API.
 *
 * WHILE `CQ_EDGE_CACHE` IS ON (ADR 0052, D4) the page may be served to anyone
 * from Cloudflare's edge, so this draws the row a visitor WITHOUT a history
 * gets, and `ViewedRecommendations` asks for the visitor's own in the browser.
 *
 * STREAMED. The page renders it inside `<Suspense>`, so the product and its
 * buy button never wait on a suggestion — and the packs' boundary
 * (`PurchasePanel`) imports nothing of this (`purchase-data.test.ts`). ANY FAILURE DRAWS NOTHING — a missing
 * row is a smaller page, an error here would be a broken one.
 */
export async function Recommendations({
  locale,
  slug,
}: {
  locale: Locale;
  /** A product of the page — its category is the one excluded. */
  slug: string;
}) {
  // Every cookie this section needs, read BEFORE the API is asked anything:
  // a streamed section can outlive its response (a visitor who left), and a
  // `cookies()` waiting behind that fetch is what threw in
  // CHARGERQUICK-STOREFRONT-B while the funnel still used `after()`. The
  // currency is the visitor's, read here inside this section's own boundary:
  // the product page around it is shared and reads none (ADR 0046 §2).
  const [jar, bearerToken, currency] = await Promise.all([cookies(), readSessionToken(), currencyForVisitor()]);
  const atTheEdge = edgeCacheEnabled();
  // Shared when the visitor has no history (`recommendationsFor`): the same
  // row for everyone on this product, currency and locale.
  const viewed = atTheEdge ? [] : parseViewed(jar.get(VIEWED_COOKIE)?.value);
  const { cards, hearts } = await recommendationCards({ slug, currency, viewed, locale, bearerToken });
  const row = <RecommendationsRow locale={locale} cards={cards} hearts={hearts} />;

  return atTheEdge ? (
    <ViewedRecommendations locale={locale} slug={slug} currency={currency}>
      {row}
    </ViewedRecommendations>
  ) : (
    row
  );
}
