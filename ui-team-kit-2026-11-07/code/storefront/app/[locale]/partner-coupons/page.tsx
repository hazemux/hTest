import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PartnerCouponCard } from "@/components/partner-coupons/PartnerCouponCard";
import { partnerCoupons } from "@/lib/content/partner-coupons";
import { filterPartnerCoupons, partnerCouponFilterOptions, type PartnerCouponView } from "@/lib/content/partner-coupons-view";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * «أكواد خصم شركائنا» — every published partner code, with its code, its
 * conditions and a way to the store. The home row's «عرض التفاصيل» lands on
 * a card here by its anchor.
 *
 * ONE PAGE, NOT MANY. Search, country and category are query-string filters
 * over the one list the API already sent, applied on the server by a plain
 * GET form (no script needed on mobile data). A filtered view is
 * `noindex, follow` with the canonical on the bare page, so search engines
 * see one partner-codes page rather than a thin copy per country.
 *
 * Nothing here calls DCM: the list is our API's, cached with the catalogue.
 *
 * SHARED, THEN THE QUERY (ADR 0046): the heading and the UNFILTERED list
 * (the shared, cached read) are the same for every visitor, and are what the
 * bare URL and a visitor without JavaScript get. A filtered view depends on
 * the query string, so it waits for it inside its own boundary
 * (`FilteredCoupons`) and replaces the unfiltered list when it streams in.
 * The metadata reads the query too, and streams with that boundary.
 */
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[]; country?: string | string[]; category?: string | string[] }>;
};

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.slice(0, 80) ?? "";
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};

  const query = await props.searchParams;
  const filtered = [query.q, query.country, query.category].some((value) => single(value) !== "");
  // Empty, the page is a "none right now" notice — kept out of the index,
  // and out of the sitemap by the same test (app/sitemap.ts).
  const empty = (await partnerCoupons(locale)).length === 0;
  const m = messagesFor(locale).partnerCoupons;

  return {
    ...pageMetadata({ locale, path: "/partner-coupons", title: m.title, description: m.metaDescription }),
    // Its own robots rule stays (spec §3.1): a filtered or empty list is
    // `noindex, follow`, the bare list with codes inherits the layout's.
    ...(filtered || empty ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function PartnerCouponsPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale).partnerCoupons;
  const all = await partnerCoupons(locale);

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-6 lg:pt-[70px]">
      <header className="mb-6 max-w-3xl">
        <h1 className="text-display font-bold leading-[1.4] text-[var(--color-ink)] lg:text-[32px]">{m.title}</h1>
        <p className="mt-2 text-body-s leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-l">{m.intro}</p>
        <p className="mt-1 text-caption leading-[1.6] text-[var(--color-ink-subtle)] lg:text-body-s">{m.notTested}</p>
      </header>

      {/* The fallback is the whole unfiltered list — the bare URL's final
          state, so it does not shift — and the filtered view replaces it. */}
      <Suspense fallback={<CouponList locale={locale} all={all} filters={NO_FILTERS} />}>
        <FilteredCoupons locale={locale} all={all} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Filters = { q: string; country: string; category: string };

const NO_FILTERS: Filters = { q: "", country: "", category: "" };

/** The list as the query string filters it. */
async function FilteredCoupons({ locale, all, searchParams }: { locale: Locale; all: PartnerCouponView[]; searchParams: Props["searchParams"] }) {
  const query = await searchParams;
  const filters = { q: single(query.q), country: single(query.country).toUpperCase(), category: single(query.category) };
  return <CouponList locale={locale} all={all} filters={filters} />;
}

/** The filter form and the cards for one set of filters. */
function CouponList({ locale, all, filters }: { locale: Locale; all: PartnerCouponView[]; filters: Filters }) {
  const m = messagesFor(locale).partnerCoupons;
  const options = partnerCouponFilterOptions(all);
  const shown = filterPartnerCoupons(all, filters);
  const isFiltered = filters.q !== "" || filters.country !== "" || filters.category !== "";

  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countryName = (code: string): string => {
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const categoryName = (key: string): string => (m.categories as Record<string, string>)[key] ?? key;

  const control =
    "h-11 w-full rounded-[8px] border border-[var(--color-input-border)] bg-[var(--color-surface)] px-3 text-body-s text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

  return (
    <>
      {all.length > 0 ? (
        <form method="get" role="search" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-caption font-semibold text-[var(--color-ink-muted)] lg:text-body-s">
            {m.search}
            <input type="search" name="q" defaultValue={filters.q} maxLength={80} className={control} />
          </label>
          {options.countries.length > 0 ? (
            <label className="grid gap-1 text-caption font-semibold text-[var(--color-ink-muted)] lg:text-body-s">
              {m.country}
              <select name="country" defaultValue={filters.country} className={control}>
                <option value="">{m.allCountries}</option>
                {options.countries.map((code) => (
                  <option key={code} value={code}>
                    {countryName(code)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {options.categories.length > 0 ? (
            <label className="grid gap-1 text-caption font-semibold text-[var(--color-ink-muted)] lg:text-body-s">
              {m.category}
              <select name="category" defaultValue={filters.category} className={control}>
                <option value="">{m.allCategories}</option>
                {options.categories.map((key) => (
                  <option key={key} value={key}>
                    {categoryName(key)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="h-11 flex-1 whitespace-nowrap rounded-[8px] bg-[var(--color-primary)] px-5 text-body-s font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
            >
              {m.apply}
            </button>
            {isFiltered ? (
              <Link
                href={`/${locale}/partner-coupons`}
                className="flex h-11 items-center rounded-[8px] px-3 text-body-s font-semibold text-[var(--color-primary)] hover:bg-[var(--color-brand-wash)]"
              >
                {m.clear}
              </Link>
            ) : null}
          </div>
        </form>
      ) : null}

      {all.length === 0 ? (
        <p className="rounded-[8px] bg-[var(--color-surface-subtle)] p-6 text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.empty}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-[8px] bg-[var(--color-surface-subtle)] p-6 text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.emptyFiltered}</p>
      ) : (
        <>
          <p className="mb-3 text-caption text-[var(--color-ink-muted)]" aria-live="polite">
            {m.resultsCount.replace("{count}", new Intl.NumberFormat(locale).format(shown.length))}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((coupon) => (
              <PartnerCouponCard key={coupon.id} locale={locale} coupon={coupon} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
