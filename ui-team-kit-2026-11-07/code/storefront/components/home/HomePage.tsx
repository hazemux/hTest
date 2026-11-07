import { Fragment } from "react";

import { AppDownload } from "@/components/home/AppDownload";
import { AppOnlyPlaceholder } from "@/components/home/AppOnlyPlaceholder";
import { BannerSlider } from "@/components/home/BannerSlider";
import { Hero } from "@/components/home/Hero";
import { HomeSearch } from "@/components/home/HomeSearch";
import { PartnerCoupons } from "@/components/home/PartnerCoupons";
import { PaymentMethodsSlot } from "@/components/home/PaymentMethodsSlot";
import { Reviews } from "@/components/home/Reviews";
import { TileSection } from "@/components/home/TileSection";
import { SectionBoundary } from "@/components/ui/SectionBoundary";
import type { getHomeLayout } from "@/lib/api/client";
import { landingFor } from "@/lib/catalog/landing";
import { listCategories, listTopBrands } from "@/lib/catalog/queries";
import { homeBanners } from "@/lib/content/banners";
import { partnerCoupons } from "@/lib/content/partner-coupons";
import { homePartnerCoupons } from "@/lib/content/partner-coupons-view";
import { appStoreLinks } from "@/lib/content/store-links";
import { appPreviewCategories, appPreviewTopBrands } from "@/lib/home/app-preview-reads";
import { homeNeeds } from "@/lib/home/needs";
import { layoutSections, STANDARD_ROW_LIMIT, standardSections, type HomeSection, type TopBrands } from "@/lib/home/sections";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { featuredReviews } from "@/lib/reviews/featured";
import { storeSettings } from "@/lib/content/settings";
import { queueSelfPurge } from "@/lib/edge/purge";
import { EDGE_HOME_TAG } from "@/lib/edge/tags";

export type HomeLayoutBlocks = NonNullable<Awaited<ReturnType<typeof getHomeLayout>>["data"]>["blocks"];

/**
 * A HOME PAGE DRAWN DEGRADED — its layout, banners, top brands, reviews,
 * partner codes or app links unreadable — must not live an hour as the edge's
 * copy (ADR 0052 plan §5.5, S12): `cq-home` is purged in about a minute, at
 * most once a minute. Called whatever the visitor: for a personal render it
 * costs one refill of copies that may have been fine.
 */
export function degradedHomeCopy(): void {
  queueSelfPurge(EDGE_HOME_TAG);
}

/**
 * The home page's body, built to the desktop comps (Figma 3840:6213 / 6273 /
 * 6341 — the trending sections — plus the hero and banner slots from
 * 5690:6095), in the order the dashboard's Home page screen says — or, with
 * `blocks` null, the standard order (`lib/home/sections.ts`).
 *
 * THE ROWS LIST CATEGORIES, NOT PRODUCTS. The comp's games section is PUBG,
 * Mobile Legends, Jawaker — each card a GAME the customer picks, leading into
 * that game's part of the tree. One `listCategories` call holds everything
 * every row shows.
 *
 * THE COMP'S "WHO WE ARE" SECTION IS GONE — owner's decision (2026-08-02).
 *
 * EVERY OPTIONAL SECTION IS ITS OWN `SectionBoundary` — the slider, banners,
 * partner codes, reviews, payment methods and app badges: one that throws in
 * the browser leaves its place empty instead of turning the whole home into
 * the error screen. The category rows are the page itself and are not
 * wrapped. A throw while the shared shell is prerendered still fails that
 * prerender (the boundary's notes), so no degraded copy is ever kept.
 *
 * SHARED BY EVERY VISITOR (ADR 0046 §2): every read here is the same for
 * everybody. The one personal section, «طرق الدفع» (the visitor's currency and
 * country), streams in its own boundary (`PaymentMethodsSlot`).
 */
export async function HomePage({
  locale,
  blocks,
  notice,
  appPreview = false,
}: {
  locale: Locale;
  /** The published (or previewed) layout; null draws the standard page. */
  blocks: HomeLayoutBlocks | null;
  /** Drawn above everything — the preview's "not live yet" strip. */
  notice?: React.ReactNode;
  /**
   * The dashboard's APP preview: the app-only blocks are drawn as labelled
   * placeholders, and the rows are joined against the catalogue AS THE APP
   * reads it (R19, `lib/home/app-preview-reads.ts`) — never the website's
   * shared, tagged tree.
   */
  appPreview?: boolean;
}) {
  const m = messagesFor(locale);

  // These do not depend on each other, so they go out together. Awaited in
  // sequence they would chain round-trips before the fold on the mobile data
  // these customers are on. The optional sections are asked for only when the
  // published layout draws them (`homeNeeds`).
  const needs = homeNeeds(blocks);
  // «التقييمات» (ADR 0042): the reviews staff picked — sent with the reads
  // below, awaited after them.
  const reviewsRead = needs.reviews ? featuredReviews(locale, degradedHomeCopy) : Promise.resolve([]);
  const [categories, partnerCodes, banners, settings] = await Promise.all([
    appPreview ? appPreviewCategories(locale) : listCategories({ locale }),
    // «أكواد خصم شركائنا» — only codes staff chose for the home page.
    needs.partnerCoupons ? partnerCoupons(locale, degradedHomeCopy).then(homePartnerCoupons) : Promise.resolve(homePartnerCoupons([])),
    // The standard page reads banners by placement; a layout carries its own.
    blocks ? Promise.resolve(null) : homeBanners(locale, degradedHomeCopy),
    // The app-download badges are store settings (v0.1.100). The SAME read
    // as the footer's (`storeSettings`): one shared entry per (path, query,
    // locale, revalidate, tags) via sharedRead, so both are answered from one
    // round-trip. Optional: unreadable means no section, never an error.
    needs.storeSettings
      ? storeSettings(locale).catch(() => {
          degradedHomeCopy();
          return null;
        })
      : Promise.resolve(null),
  ]);

  // `banners` was read exactly when there is no layout; the `??` only
  // satisfies the type and never runs.
  // A gift-card section of sectors shows its top brands (v0.1.102): one read
  // per such section, together. An unreadable list leaves its sectors.
  const sectioned = categories.filter((category) => !category.parent_public_id && category.has_sectors && category.public_id);
  const topBrands: TopBrands = new Map(
    await Promise.all(
      sectioned.map(async (root) => [
        root.public_id as string,
        appPreview
          ? await appPreviewTopBrands(root.public_id as string, STANDARD_ROW_LIMIT, locale)
          : await listTopBrands(root.public_id as string, STANDARD_ROW_LIMIT, { locale, onFailure: degradedHomeCopy }),
      ] as const),
    ),
  );

  const sections: HomeSection[] = blocks
    ? layoutSections({ blocks, categories, locale, topBrands, appPreview })
    : standardSections({ categories, locale, topBrands, ...(banners ?? (await homeBanners(locale, degradedHomeCopy))) });

  const landing = landingFor(categories, locale);

  const reviews = await reviewsRead;

  const sliderLabels = {
    region: m.home.sliderLabel,
    previous: m.home.sliderPrevious,
    next: m.home.sliderNext,
  };

  // ONE h1 on every home page: the hero's own (its text composition), the
  // slider's hidden one, or — with no hero section at all — a hidden one here.
  const hasHero = sections.some((section) => section.kind === "hero");
  // ONE image on the page is fetched at high priority (2026-10-10 trace): the
  // first hero or banner, whichever comes first — the text hero's plate
  // counts, so a later banner never claims a second.
  const lcpIndex = sections.findIndex((section) => section.kind === "hero" || section.kind === "banner");

  return (
    <main className="flex-1">
      {notice}
      {hasHero ? null : (
        <h1 className="sr-only">
          {m.home.heroLead} {m.common.storeName}
        </h1>
      )}
      {sections.map((section, index) => {
        switch (section.kind) {
          case "search":
            // On desktop the search lives in the header and this renders nothing.
            return <HomeSearch key="search" locale={locale} />;
          case "hero":
            // With no live banner, the hero's own text keeps the top of the page.
            return section.slides.length > 0 ? (
              <Fragment key="hero">
                <h1 className="sr-only">
                  {m.home.heroLead} {m.common.storeName}
                </h1>
                <SectionBoundary name="hero">
                  <BannerSlider slides={section.slides} labels={sliderLabels} lcp={index === lcpIndex} />
                </SectionBoundary>
              </Fragment>
            ) : (
              <Hero key="hero" locale={locale} lcp={index === lcpIndex} />
            );
          case "row":
            return (
              <TileSection
                key={`row-${section.row.slug}`}
                locale={locale}
                title={section.row.title}
                // «عرض الكل» lands where the row's category does — a root
                // with one child is its child's page (`lib/catalog/landing.ts`).
                href={landing(section.row.slug) ?? `/${locale}/categories/${section.row.slug}`}
                tiles={section.row.tiles}
                variant={section.row.variant}
              />
            );
          case "banner":
            return (
              <SectionBoundary key={`banner-${section.block.id}-${index}`} name="banner">
                <BannerSlider slides={section.block.slides} labels={sliderLabels} className="mt-6 lg:mt-8" lcp={index === lcpIndex} />
              </SectionBoundary>
            );
          case "partner_coupons":
            return (
              <SectionBoundary key="partner_coupons" name="partner_coupons">
                <PartnerCoupons locale={locale} coupons={partnerCodes} />
              </SectionBoundary>
            );
          case "reviews":
            return (
              <SectionBoundary key="reviews" name="reviews">
                <Reviews locale={locale} reviews={reviews} />
              </SectionBoundary>
            );
          case "payment_methods":
            // The visitor's methods, in their own boundary (asked for only
            // when the layout draws the strip).
            return (
              <SectionBoundary key="payment_methods" name="payment_methods">
                <PaymentMethodsSlot locale={locale} />
              </SectionBoundary>
            );
          case "app_only":
            return <AppOnlyPlaceholder key={`app-${section.block}`} locale={locale} block={section.block} labels={section.labels} />;
          case "app_download":
            // Renders nothing until a store link is set (ADR 0019 §24).
            return (
              <SectionBoundary key="app_download" name="app_download">
                <AppDownload locale={locale} links={appStoreLinks(settings?.data?.general)} />
              </SectionBoundary>
            );
        }
      })}
    </main>
  );
}
