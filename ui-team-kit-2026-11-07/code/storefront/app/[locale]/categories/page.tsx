import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CATEGORY_TILE_GRID, CategoryTile } from "@/components/catalog/CategoryTile";
import { BannerSlider } from "@/components/home/BannerSlider";
import { HomeSearch } from "@/components/home/HomeSearch";
import { categoryHref } from "@/lib/catalog/landing";
import { listCategories } from "@/lib/catalog/queries";
import { childrenByParent } from "@/lib/catalog/tree";
import { categoryBanners } from "@/lib/content/banners";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};

  const m = messagesFor(locale);
  return pageMetadata({ locale, path: "/categories", title: m.catalog.sections, description: m.seo.categoriesDescription });
}

/**
 * «الاقسام» — every root, as the categories comp draws them (`6877:141864`
 * desktop, `6904:22758` phone): the "Categories page banner" placement (a
 * banner or a slider, 1200 × 488), the heading, and one 144px tile per root
 * in the admin's order.
 *
 * THIS URL USED TO 404. The catch-all beside it needs a slug, so `/categories`
 * matched nothing, and the account menu's «الأقسام» entry had nowhere to go.
 *
 * Each tile links to where it LANDS (`categoryHref`), as the home rows do —
 * down a chain of lone children, and on to the product when that leaf sells
 * one — never to a redirect.
 */
export default async function CategoriesIndexPage(props: Props) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const [all, banners] = await Promise.all([listCategories({ locale }), categoryBanners(locale)]);
  const children = childrenByParent(all);
  // A root is a category with no parent PUBLIC id (ADR 0037).
  const roots = all.filter((category) => !category.parent_public_id);

  return (
    <main className="flex-1">
      <HomeSearch locale={locale} />

      {banners.length > 0 ? (
        <BannerSlider
          slides={banners}
          labels={{
            region: m.home.sliderLabel,
            previous: m.home.sliderPrevious,
            next: m.home.sliderNext,
          }}
          className="mt-4 lg:mt-[70px]"
          lcp
        />
      ) : null}

      <div
        className={`mx-auto flex w-full max-w-[1248px] flex-col px-6 pb-12 lg:gap-8 ${banners.length > 0 ? "pt-6 lg:pt-8" : "pt-[34px] lg:pt-[70px]"}`}
      >
        <section>
          <h1 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold lg:leading-[1.4]">
            {m.catalog.sections}
          </h1>

          <ul className={`mt-6 ${CATEGORY_TILE_GRID}`}>
            {roots.map((root, index) => {
              const image = root.images?.card_image ?? null;
              const name = root.name[locale] ?? root.name.en ?? root.slug;
              // The banner, when there is one, is the LCP; otherwise the first tile.
              const isLcp = banners.length === 0 && index === 0;

              return (
                <li key={root.slug}>
                  <CategoryTile
                    name={name}
                    href={categoryHref(all, children, root, locale)}
                    image={image ? { url: image.url, alt: image.alt?.[locale] ?? "" } : null}
                    lcp={isLcp}
                    eager={index < 4 && !isLcp}
                  />
                </li>
              );
            })}
          </ul>
        </section>

      </div>
    </main>
  );
}
