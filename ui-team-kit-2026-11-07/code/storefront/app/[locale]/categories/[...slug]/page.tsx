import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { Suspense } from "react";
import { movedToForPage } from "@/lib/seo/redirect-table";

import { CategoryBanner } from "@/components/catalog/CategoryBanner";
import type { BannerSliderLabels } from "@/components/home/BannerSlider";
import { CATEGORY_TILE_GRID, CategoryTile } from "@/components/catalog/CategoryTile";
import { LegacyOptionRedirect } from "@/components/catalog/LegacyOptionRedirect";
import { ProductCard } from "@/components/catalog/ProductCard";
import { RevealInBatches } from "@/components/catalog/RevealInBatches";
import { SectorMenu, type SectorMenuItem } from "@/components/catalog/SectorMenu";
import { HomeSearch } from "@/components/home/HomeSearch";
import { JsonLd } from "@/components/seo/JsonLd";
import { TileSection, type Tile } from "@/components/home/TileSection";
import { ApiError } from "@/lib/api/client";
import { categoryRole, tileVariantFor } from "@/lib/catalog/layout";
import { allProducts } from "@/lib/catalog/all-products";
import { categoryPageBanners, type BannerSlot } from "@/lib/content/banners";
import { categoryHref, isCategoryPage } from "@/lib/catalog/landing";
import { getCategory, listCategories, listTopBrands } from "@/lib/catalog/queries";
import { SHELL_PARAM } from "@/lib/catalog/shell";
import { ancestry, categoryArt, categoryPath, childrenByParent, collapseSingleChild } from "@/lib/catalog/tree";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { breadcrumbNode, graph } from "@/lib/seo/schema";
import { queueSelfPurge } from "@/lib/edge/purge";
import { edgeCategoryPageTag } from "@/lib/edge/tags";
import { categoryDescription } from "@/lib/seo/descriptions";
import { pageMetadata } from "@/lib/seo/metadata";
import { catalogShareImage } from "@/lib/seo/share-image";
import { absoluteUrl } from "@/lib/seo/site";

type Props = {
  params: Promise<{ locale: string; slug: string[] }>;
  searchParams: Promise<{ option?: string | string[]; line?: string | string[] }>;
};

type Category = Awaited<ReturnType<typeof listCategories>>[number];

/** «أشهر العلامات» on a gift-card section's page: four rows of six on desktop. */
const TOP_BRANDS_ON_PAGE = 24;

/** A long list of categories (a sector's brands) opens with this many and adds as many again on scroll. */
const TILES_PER_BATCH = 24;

/**
 * F3: one param, or Cache Components fails the build for this route. Never a
 * real category — the page answers 404 for it before reading anything — so
 * the build needs no API.
 */
export async function generateStaticParams() {
  return [{ slug: [SHELL_PARAM] }];
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!isLocale(locale) || slug.at(-1) === SHELL_PARAM) return {};

  const all = await listCategories({ locale });
  const category = all.find((entry) => entry.slug === slug.at(-1));
  if (!category) return {};
  // The SEO texts are page content: read with this category alone (v0.1.103).
  const seo =
    (
      await getCategory(category.slug, { locale }).catch(() => {
        degradedCopy(category.slug);
        return null;
      })
    )?.seo ?? null;

  const name = category.name[locale] ?? category.slug;
  const art = categoryArt(all, category);

  // ONE CANONICAL PER CATEGORY: the page answers on its short path
  // (`/categories/pubg-mobile`) and on every ancestor chain, so the canonical
  // is always the full chain from the root — the URL every link on the site
  // and the sitemap use. `?option=` / `?region=` are selections, not pages.
  return pageMetadata({
    locale,
    path: categoryPath(all, category, locale).slice(`/${locale}`.length),
    // `seo.title` falls back to the name per locale server-side (CC6).
    title: seo?.title?.[locale] ?? name,
    // Staff's SEO description, else the page's own text — none exists yet
    // (`categoryDescription`) — else the owner's template (spec §3.2).
    description: categoryDescription({ slug: category.slug, name: category.name, seo }, locale, null),
    // Its card art (or the nearest ancestor's — the art its tile wears) on the
    // branded 1200 × 630 frame; none up the chain: the default card.
    image: catalogShareImage("categories", category.slug, art?.url, art?.alt?.[locale] || name),
  });
}

/**
 * A category is either a CHOICE or a PRICE LIST, and which one it is belongs to
 * the catalogue rather than to the route.
 *
 *   more than one child  → show the children; the customer picks
 *   exactly one child    → there is nothing to pick, so skip straight to it
 *   no children          → its product's page, or — when it holds several —
 *                          their cards, each opening its own product page
 *                          (the owner's rule, 2026-10-05)
 *
 * The middle rule is why this page redirects. A game usually has one top-up
 * method, and a page whose entire content is a single tile asks the customer a
 * question with one answer. It collapses through a CHAIN in one hop
 * (`digital-gift-cards → itunes-gift-cards → itunes-germany`), so no
 * intermediate URL flashes past on the way.
 *
 * WHICH COMP a page is drawn to follows from where it sits in the tree
 * (`lib/catalog/layout.ts`): a root's children are the products list
 * (`6877:140024`), a deeper choice is the method choice (`6877:139726`), and a
 * leaf is the packages grid (`6877:139276`).
 */
/**
 * The page, with its breadcrumb markup. Only a category that renders HERE
 * gets it — one that redirects (a lone child, a single product) throws out of
 * CategoryContent first, so no markup is emitted for a URL that is not a page.
 * A leaf selling several products gets NO Product markup: Google's product
 * results are for pages about one product, and this page is several.
 *
 * SHARED BY EVERY VISITOR (ADR 0046 §2): no price, no cookie, no header. Every
 * redirect and 404 here follows from the PATH alone, above any Suspense, so
 * each is a real 3xx or 404 (F3, F4); the query is read only by the legacy
 * `?option=` hop, in its own boundary (plan D1).
 */
export default async function CategoryPage(props: Props) {
  const { locale, slug } = await props.params;
  if (slug.at(-1) === SHELL_PARAM) notFound();
  const content = await CategoryContent(props);
  if (!isLocale(locale)) notFound();

  const all = await listCategories({ locale });
  const category = all.find((entry) => entry.slug === slug.at(-1));
  const m = messagesFor(locale);
  const trail = category
    ? [
        { name: m.common.storeName, url: absoluteUrl(`/${locale}`) },
        // Only ancestors that are pages — a single-child category, or a leaf
        // selling one product, redirects.
        ...ancestry(all, category)
          .filter((entry) => isCategoryPage(entry, childrenByParent(all)))
          .map((entry) => ({
            name: entry.name[locale] ?? entry.name.en ?? entry.slug,
            url: absoluteUrl(categoryPath(all, entry, locale)),
          })),
      ]
    : [];
  const self = trail.at(-1)?.url;

  return (
    <>
      {self ? <JsonLd data={graph([breadcrumbNode(self, trail)])} /> : null}
      {content}
    </>
  );
}

async function CategoryContent(props: Props) {
  const { locale, slug } = await props.params;
  if (!isLocale(locale)) notFound();

  // The DEEPEST segment identifies the category; the ones before it are the
  // path it was reached by. So `/categories/pubg-mobile` and
  // `/categories/games-top-up/pubg-mobile` are the same page, and the short
  // form `menuHref` produces keeps working.
  const categorySlug = slug.at(-1);
  if (!categorySlug) notFound();

  const all = await listCategories({ locale });
  const category = all.find((entry) => entry.slug === categorySlug);
  if (!category) {
    // A renamed slug redirects to the category's new address (ADR 0037).
    const moved = await movedToForPage(`/${locale}/categories/${categorySlug}`);
    if (moved) permanentRedirect(moved);
    notFound();
  }

  const children = childrenByParent(all);
  const destination = collapseSingleChild(category, children);

  // OUTSIDE any try/catch: `redirect` works by throwing, and a catch around it
  // swallows the navigation and renders nothing.
  if (destination !== category) {
    redirect(categoryPath(all, destination, locale));
  }

  // ONE URL PER CATEGORY, AND IT NAMES ITS ROOT. A short path
  // (`/categories/pubg-mobile`, as a banner or a search result may link) is
  // sent to the full chain from the root. The header rail lights its parent
  // tab from the URL alone — «شحن الالعاب» is current because the path starts
  // `/categories/games-top-up/` — so a page answering on its short path had no
  // tab lit at all. From the path alone, so it stays a real 307: an old
  // `?option=` / `?region=` selection no longer rides along (plan D1, owner
  // 2026-10-10).
  const canonical = categoryPath(all, category, locale);
  if (`/${locale}/categories/${slug.map(encodeURIComponent).join("/")}` !== canonical) {
    redirect(canonical);
  }

  const role = categoryRole(category, children);
  const title = category.name[locale] ?? category.name.en ?? category.slug;
  const options = (category.public_id ? children.get(category.public_id) : undefined) ?? [];
  const m = messagesFor(locale);
  const sliderLabels = { region: m.home.sliderLabel, previous: m.home.sliderPrevious, next: m.home.sliderNext };

  // The category's OWN hero, when staff uploaded one — the plate the comps
  // draw above a products list and under a choice on the phone; the fallback
  // when the category has no banner of its own.
  const heroDesktop = heroImage(category.images?.hero_desktop, locale, title);
  const heroMobile = heroImage(category.images?.hero_mobile, locale, title) ?? heroDesktop;

  if (role === "leaf") {
    return (
      <Packages
        {...{ locale, all, category, title, sliderLabels, heroDesktop, heroMobile }}
        searchParams={props.searchParams}
      />
    );
  }

  // The banners staff added on THIS category's screen (owner, 2026-10-07) —
  // never a parent's. On every role of page; with none, the hero above.
  // Each tile links where it LANDS: a leaf selling one product to that
  // product, never to its redirect (`lib/catalog/landing.ts`).
  const own = await categoryPageBanners(category.public_id, locale);

  const tiles = options.map<Tile>((option) => {
    const image = option.images?.card_image ?? null;
    return {
      slug: option.slug,
      name: option.name[locale] ?? option.name.en ?? option.slug,
      href: categoryHref(all, children, option, locale),
      image: image ? { url: image.url, alt: image.alt?.[locale] ?? "" } : null,
      logo: option.images?.logo ? { url: option.images.logo.url } : null,
    };
  });

  // A section of sectors (ADR 0040): its sectors as an icon menu, then its
  // top brands (owner 2026-10-08) — on a sector's page the same menu, that
  // sector marked, above the sector's brands.
  const sectorParent = category.has_sectors
    ? category
    : all.find((entry) => entry.public_id !== null && entry.public_id === category.parent_public_id && entry.has_sectors);
  const sectorMenu = sectorParent ? (
    <SectorMenu
      label={m.catalog.sectorsLabel}
      items={((sectorParent.public_id ? children.get(sectorParent.public_id) : undefined) ?? []).map<SectorMenuItem>((sector) => {
        const icon = sector.images?.icon ?? sector.images?.card_image ?? null;
        return {
          slug: sector.slug,
          name: sector.name[locale] ?? sector.name.en ?? sector.slug,
          href: categoryHref(all, children, sector, locale),
          icon: icon ? { url: icon.url, alt: icon.alt?.[locale] ?? "" } : null,
          current: sector.slug === category.slug,
        };
      })}
    />
  ) : null;

  if (role === "root" && category.has_sectors && category.public_id) {
    const brands = (await listTopBrands(category.public_id, TOP_BRANDS_ON_PAGE, { locale, onFailure: () => degradedCopy(category.slug) })).flatMap((brand) =>
      all.filter((entry) => entry.public_id === brand.public_id),
    );
    const brandTiles = brands.map<Tile>((brand) => {
      const image = brand.images?.card_image ?? null;
      return {
        slug: brand.slug,
        name: brand.name[locale] ?? brand.name.en ?? brand.slug,
        href: categoryHref(all, children, brand, locale),
        image: image ? { url: image.url, alt: image.alt?.[locale] ?? "" } : null,
        logo: brand.images?.logo ? { url: brand.images.logo.url } : null,
      };
    });

    return (
      <main className="flex-1 pb-12">
        <HomeSearch locale={locale} />
        <div className="mx-auto flex w-full max-w-[1248px] flex-col px-6 pt-[34px] lg:gap-8 lg:pt-[70px]">
          <CategoryBanner slides={own} hero={heroDesktop} where="top" shape="list" labels={sliderLabels} />
          <div>
            <PageTitle>{title}</PageTitle>
            {sectorMenu}
          </div>
        </div>
        {brandTiles.length > 0 ? (
          <>
            <h2 className="mx-auto mt-6 w-full max-w-[1248px] px-6 text-body-s font-bold leading-[1.5] text-[var(--color-ink)] lg:mt-10 lg:text-heading-l lg:leading-[1.4]">
              {m.catalog.topBrands}
            </h2>
            <TileSection
              locale={locale}
              title={m.catalog.topBrands}
              href=""
              tiles={brandTiles}
              variant={tileVariantFor(category.slug)}
              hideHeader
              phone="grid"
              spacing="mt-4 lg:mt-6"
              lcp
            />
          </>
        ) : null}
        <div className="mx-auto w-full max-w-[1248px] px-6">
          <CategoryBanner slides={own} hero={heroMobile} where="bottom" shape="list" labels={sliderLabels} />
        </div>
      </main>
    );
  }

  if (role === "root") {
    /*
     * THE PRODUCTS LIST (`6877:140024` / `6847:96404`): the home comp's tile,
     * six up at 183 on desktop and four up at 66 on the phone, under the
     * root's own hero. Not capped at the home row's twelve — this page IS
     * "view all".
     */
    return (
      <main className="flex-1 pb-12">
        <HomeSearch locale={locale} />
        <div className="mx-auto flex w-full max-w-[1248px] flex-col px-6 pt-[34px] lg:gap-8 lg:pt-[70px]">
          <CategoryBanner slides={own} hero={heroDesktop} where="top" shape="list" labels={sliderLabels} />
          <PageTitle>{title}</PageTitle>
        </div>
        <TileSection
          locale={locale}
          title={title}
          href=""
          tiles={tiles}
          variant={tileVariantFor(category.slug)}
          hideHeader
          phone="grid"
          spacing="mt-5 lg:mt-6"
          lcp
        />
        <div className="mx-auto w-full max-w-[1248px] px-6">
          <CategoryBanner slides={own} hero={heroMobile} where="bottom" shape="list" labels={sliderLabels} />
        </div>
      </main>
    );
  }

  /*
   * A GAME'S CHOICE wears the games card — the same 172×192 / 64×72 card as
   * the games list above it (`TileSection`), so a game's options look like the
   * game they came from. `slug[0]` is the root: the canonical redirect above
   * has already made the URL the full chain.
   */
  if (tileVariantFor(slug[0] ?? "") === "game") {
    return (
      <main className="flex-1 pb-12">
        <HomeSearch locale={locale} />
        <div className="mx-auto flex w-full max-w-[1248px] flex-col px-6 pt-[34px] lg:gap-8 lg:pt-[70px]">
          {/* No desktop plate in the choice comps (`6877:139726`); one is
              drawn only for a banner staff added to THIS category. */}
          <CategoryBanner slides={own} hero={null} where="top" shape="index" labels={sliderLabels} />
          <PageTitle>{title}</PageTitle>
        </div>
        <TileSection
          locale={locale}
          title={title}
          href=""
          tiles={tiles}
          variant="game"
          hideHeader
          phone="pair"
          spacing="mt-3 lg:mt-6"
          lcp
        />
        <div className="mx-auto w-full max-w-[1248px] px-6">
          <CategoryBanner slides={own} hero={heroMobile} where="bottom" shape="index" labels={sliderLabels} />
        </div>
      </main>
    );
  }

  /*
   * THE METHOD CHOICE (`6877:139726` / `6847:96288`): «شحن عبر الايدي» beside
   * «شحن عبر الدخول» — 144px tiles, two to the phone's row. ALWAYS MORE THAN
   * ONE here: a lone child was collapsed above, by construction.
   */
  return (
    <main className="flex-1 pb-12">
      <HomeSearch locale={locale} />
      <div className="mx-auto w-full max-w-[1248px] px-6 pt-[34px] lg:pt-[70px]">
        <CategoryBanner slides={own} hero={null} where="top" shape="index" labels={sliderLabels} className="lg:mb-8" />
        <PageTitle>{title}</PageTitle>
        {sectorMenu}
        <RevealInBatches batch={TILES_PER_BATCH} className={`mt-3 lg:mt-6 ${CATEGORY_TILE_GRID}`} moreLabel={m.catalog.showMore}>
          {options.map((option, index) => {
            const image = option.images?.card_image ?? null;
            const name = option.name[locale] ?? option.name.en ?? option.slug;

            return (
              <li key={option.slug}>
                <CategoryTile
                  name={name}
                  href={categoryHref(all, children, option, locale)}
                  image={image ? { url: image.url, alt: image.alt?.[locale] ?? "" } : null}
                  lcp={index === 0}
                  eager={index > 0 && index < 4}
                  framed={false}
                />
              </li>
            );
          })}
        </RevealInBatches>
        <CategoryBanner slides={own} hero={heroMobile} where="bottom" shape="index" labels={sliderLabels} />
      </div>
    </main>
  );
}

/**
 * A LEAF LISTS ITS PRODUCTS; EACH PRODUCT IS BOUGHT ON ITS OWN PAGE.
 *
 *   - no products  → says so;
 *   - ONE product  → opens that product's page;
 *   - SEVERAL      → their cards, each opening its product's page.
 *
 * Until 2026-10-05 a leaf selling several products was ONE purchase page with
 * every product's packs as chips (Daleel Store's layout, the owner's rule of
 * 2026-09-24). Products that share pack labels — PUBG Prime and Prime Plus
 * both sell «6 شهور» — could not be told apart there, and the owner chose a
 * page per product instead. An old `?option=slug:pack` link still opens what
 * it named: its product's page, on that pack — in the browser, from inside
 * its own Suspense (`LegacyOptionRedirect`, plan D1), because this list is
 * shared and cannot wait for the query.
 */
async function Packages({
  locale,
  all,
  category,
  title,
  searchParams,
  sliderLabels,
  heroDesktop,
  heroMobile,
}: {
  locale: Locale;
  all: Category[];
  category: Category;
  title: string;
  /** Still a promise: only the legacy `?option=` hop waits on it. */
  searchParams: Props["searchParams"];
  sliderLabels: BannerSliderLabels;
  heroDesktop: { url: string; alt: string } | null;
  heroMobile: { url: string; alt: string } | null;
}) {
  const m = messagesFor(locale);

  let products;
  let complete;
  let legacyOptions;
  let own: BannerSlot[];
  try {
    // The listing and this category's own banners are independent reads.
    // The listing carries no money: the cards show none (ADR 0046 §2).
    [{ products, complete, legacyOptions }, own] = await Promise.all([
      allProducts(category.slug, locale),
      categoryPageBanners(category.public_id, locale),
    ]);
  } catch (error) {
    // 404 is a real "no such category" and must render as one. Anything else
    // is ours, not the customer's, and must not be disguised as a missing page.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // A listing cut short is not the leaf's page: its edge copy goes too.
  if (!complete) degradedCopy(category.slug);

  // ONE PRODUCT IS NOT A CHOICE — its page opens, from the path alone (a real
  // 307; an old `?option=` pack or `?line=` no longer rides along, plan D1).
  // OUTSIDE the try: `redirect` throws. Only a COMPLETE list of one is "one
  // product": a list cut short by a failed page is not.
  const [only] = products;
  if (complete && products.length === 1 && only) {
    redirect(`/${locale}/products/${encodeURIComponent(only.slug)}`);
  }

  if (products.length === 0) {
    return (
      <main className="flex-1 pb-12">
        <HomeSearch locale={locale} />
        <div className="mx-auto w-full max-w-[1248px] px-6 pt-[34px] lg:pt-[70px]">
          <PageTitle>{title}</PageTitle>
          <p className="mt-4 text-[var(--color-ink-muted)] lg:mt-6">{m.catalog.noProducts}</p>
        </div>
      </main>
    );
  }

  // A product without its own picture wears the category's card art — the same
  // art its product page shows (`categoryArt`).
  const art = categoryArt(all, category);

  return (
    <main className="flex-1 pb-12">
      {/* An old `?option=slug:pack` link opens the product it named (plan D1). */}
      <Suspense fallback={null}>
        <LegacyOptionRedirect locale={locale} options={legacyOptions} searchParams={searchParams} />
      </Suspense>
      <HomeSearch locale={locale} />
      <div className="mx-auto w-full max-w-[1248px] px-6 pt-[34px] lg:pt-[70px]">
        {/* The packages comp (`6877:139276`) draws no plate; the category's
            own banner — or its hero — takes the products list's places. */}
        <CategoryBanner slides={own} hero={heroDesktop} where="top" shape="list" labels={sliderLabels} className="lg:mb-8" />
        <PageTitle>{title}</PageTitle>
        <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:mt-6 lg:grid-cols-4">
          {products.map((product, index) => (
            <li key={product.slug}>
              <ProductCard
                locale={locale}
                lcp={index === 0}
                product={
                  product.images?.primary_image || !art
                    ? product
                    : { ...product, images: { ...product.images, primary_image: { url: art.url, alt: art.alt ?? {} } } }
                }
              />
            </li>
          ))}
        </ul>
        {/* A later page of the listing failed: say so rather than present a
            short list as the whole of it. */}
        {complete ? null : (
          <p role="status" className="mt-4 text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">
            {m.catalog.partialListing}
          </p>
        )}
        <CategoryBanner slides={own} hero={heroMobile} where="bottom" shape="list" labels={sliderLabels} />
      </div>
    </main>
  );
}

/**
 * A PAGE DRAWN DEGRADED — a listing cut short, its top brands or SEO texts
 * missing — must not live an hour as the edge's copy (ADR 0052 plan §5.5):
 * its own page tag is purged in about a minute, at most once a minute. NOT a
 * banner that did not answer: banners have a deadline so that under load a
 * slow promo is skipped, and purging for it would empty the cache exactly
 * when it matters most.
 * Called whatever the visitor; for a personal render it costs one refill of a
 * copy that may have been fine, and knowing whether this render IS the copy
 * would take a header read this shared page never makes.
 */
function degradedCopy(slug: string): void {
  queueSelfPurge(edgeCategoryPageTag(slug));
}

/** Body/SemiBold 16 on the phone, Heading/Bold 20 on desktop — every category comp. */
function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold lg:leading-[1.4]">
      {children}
    </h1>
  );
}

function heroImage(
  media: { url: string; alt?: Record<string, string> | null } | null | undefined,
  locale: Locale,
  title: string,
): { url: string; alt: string } | null {
  return media?.url ? { url: media.url, alt: media.alt?.[locale] || title } : null;
}
