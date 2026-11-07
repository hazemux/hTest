import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";

import { FavouriteSlot } from "@/components/catalog/FavouriteSlot";
import { OpenReviewsFromLink } from "@/components/catalog/OpenReviewsFromLink";
import { ProductReviews } from "@/components/catalog/ProductReviews";
import { PurchasePage } from "@/components/catalog/PurchasePage";
import { PurchasePanel, PurchasePanelFallback } from "@/components/catalog/PurchasePanel";
import { Recommendations } from "@/components/catalog/Recommendations";
import { RecordProductView } from "@/components/catalog/RecordProductView";
import { ShareButton } from "@/components/catalog/ShareButton";
import type { CategoryField } from "@/components/checkout/CustomFields";
import { SectionBoundary } from "@/components/ui/SectionBoundary";
import { ApiError } from "@/lib/api/client";
import { joinKey } from "@/lib/api/public-id";
import { gameContent } from "@/lib/catalog/game-content";
import { isCategoryPage } from "@/lib/catalog/landing";
import { getCategory, getProductShell, listCategories } from "@/lib/catalog/queries";
import { productArtwork } from "@/lib/catalog/product-artwork";
import { SHELL_PARAM } from "@/lib/catalog/shell";
import { ancestry, brandArt, brandCategory, categoryByPublicId, categoryPath, childrenByParent } from "@/lib/catalog/tree";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { movedToForPage } from "@/lib/seo/redirect-table";
import { pageMetadata } from "@/lib/seo/metadata";
import { catalogShareImage } from "@/lib/seo/share-image";

/**
 * The product page — where a customer picks a package and reads everything
 * about it. Figma 6847:97051 (mobile) and 6883:31202 (desktop).
 *
 * ONE TREE, TWO LAYOUTS. The comps differ in arrangement, not in content:
 * mobile stacks image → details → usage, desktop puts the image and the usage
 * card in one column and everything buyable in the other. That is a grid
 * placement, not a second component — a forked mobile/desktop pair is two
 * places for the next price or field change to land in, and one of them always
 * gets missed.
 *
 * DIRECTION IS STRUCTURAL, never conditional. `dir` is set once on `<html>`
 * (app/[locale]/layout.tsx), so the grid's own column order mirrors: the image
 * sits on the comp's left for Arabic because it is in the END column, and it
 * lands on the right for English from the same declaration.
 *
 * WHAT USED TO BE MISSING, AND WHERE IT COMES FROM NOW (contract v0.1.62,
 * «Product Page Mobile»):
 *
 *   «الكمية محدودة»         — a tier's `low_stock`, set by staff. Nothing
 *                             counts stock, so no NUMBER is ever shown.
 *   «≈ 90» loyalty points   — a tier's `points_estimate`: what a NEW account
 *                             earns, the least any account earns.
 *   «4.5 (541 تقييم)»       — `Product.rating`, approved reviews (v0.1.57).
 *   «شحن عبر الايدي»        — the sub category's `delivery_method`, with its
 *                             delivery line, usage steps and «أين أجده؟» help.
 *
 * `Product.regions` — the ISO delivery-country list — is likewise not drawn.
 * It is `[]` on every real row, and it is NOT the region selector: that is a
 * game-server axis carried per denomination (contract v0.1.33), rendered by
 * `ProductPurchase` and derived from the prices that actually exist.
 *
 * Each is a small additive contract change when the owner wants it, and none
 * of them is worth a plausible-looking number in the meantime.
 *
 * SHARED, THEN PERSONAL (ADR 0046 §2). Everything this file renders is the
 * same for every visitor: the product WITHOUT money (`getProductShell`), the
 * category tree, the category's content. It imports nothing that reads the
 * visitor (`lib/catalog/purchase-data.test.ts` scans it). Every price, the
 * tier the page opens on, the visitor's saved details and basket, and the
 * structured data (its Offers carry prices) are `PurchasePanel`'s, streamed
 * in its own Suspense boundary; the heart is `FavouriteSlot`'s, and the row
 * of suggestions prices itself in its own.
 *
 * THE ROW OF SUGGESTIONS AND THE REVIEWS ARE OPTIONAL: each sits in its
 * `<Suspense>` AND a `SectionBoundary`. One that throws while the request is
 * rendered is sent as its boundary's empty box (the status already went out
 * as 200), and in the browser the boundary draws nothing instead of handing
 * the whole product to the error screen. The throw is still reported and, on
 * an edge copy, still purges it (`instrumentation.ts`).
 */

/**
 * F3: one param, or Cache Components fails the build for this route. Never a
 * real product — the page answers 404 for it before reading anything — so
 * the build needs no API.
 */
export async function generateStaticParams() {
  return [{ slug: SHELL_PARAM }];
}

/**
 * Title, description and canonical from the product's OWN SEO fields (CC6 —
 * `seo.title` falls back to the name per locale server-side). The canonical
 * never carries `?pack=` or `?region=`: those pick a tier on this
 * page, they are not pages. The same shared reads the page makes — the
 * product without money, and the tree its picture falls back to — so no
 * second request reaches the API, and nothing here depends on the visitor.
 */
export async function generateMetadata(props: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!isLocale(locale) || slug === SHELL_PARAM) return {};
  const [product, categories] = await Promise.all([
    getProductShell(slug, { locale }).catch(() => null),
    listCategories({ locale }).catch(() => []),
  ]);
  if (!product) return {};

  const name = product.name[locale] ?? product.slug;
  const art = productArtwork(product, categories, locale, name);
  return pageMetadata({
    locale,
    path: `/products/${encodeURIComponent(product.slug)}`,
    title: product.seo?.title?.[locale] ?? name,
    // Plain text, cut at a word to 160 by `pageMetadata`.
    description: product.seo?.description?.[locale] ?? product.description?.[locale] ?? null,
    // The hero's own picture (spec §3.4) — the product's, else its category's
    // art — set on the branded 1200 × 630 frame (`lib/seo/share-image.ts`).
    image: catalogShareImage("products", product.slug, art?.url, art?.alt ?? name),
  });
}

export default async function ProductPage(props: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ pack?: string; region?: string; line?: string }>;
}) {
  const { locale, slug } = await props.params;
  if (!isLocale(locale) || slug === SHELL_PARAM) notFound();
  const m = messagesFor(locale);

  // Independent: the product and the tree its fields and crumbs come from.
  // The tree's own failure surfaces where it is awaited below; marked handled
  // here so a 404 for the product cannot leave it rejecting unobserved.
  const categoriesRead = listCategories({ locale });
  categoriesRead.catch(() => undefined);

  let product;
  try {
    product = await getProductShell(slug, { locale });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }

  // A renamed slug redirects to the product's new address (ADR 0037). From
  // params alone, above every Suspense, so it is a real 301 or a real 404
  // (F3, F4). Outside the try: `permanentRedirect` works by throwing.
  if (!product) {
    const moved = await movedToForPage(`/${locale}/products/${slug}`);
    if (moved) permanentRedirect(moved);
    notFound();
  }

  const name = product.name[locale] ?? product.slug;

  // Custom fields live on the CATEGORY, not the product (spec §4.1).
  const categories = await categoriesRead;
  const category = categoryByPublicId(categories, product.category_public_id);
  const fields = (category?.fields ?? []) as CategoryField[];

  // The category's page content (usage steps, terms, FAQs) is read for this
  // page alone (v0.1.103); the tree above is the summary. Unreadable is the
  // summary's empty content — the page still sells.
  const content = category ? await getCategory(category.slug, { locale }).catch(() => null) : null;
  const game = gameContent(content ?? category, locale);

  // Share and the heart, in each comp's order: on the phone share leads
  // (`Title and favorite`), on the desktop artwork the heart does (`Product
  // Image Header`: heart at the edge, share outside it). The heart is the
  // visitor's wishlist, so it streams in its own boundary (`FavouriteSlot`).
  const icons = (onArtwork: boolean) => {
    const share = (
      <ShareButton label={m.product.share} copiedLabel={m.product.shareCopied} title={name} onArtwork={onArtwork} />
    );
    const heart = (
      <FavouriteSlot
        locale={locale}
        productPublicId={joinKey(product.public_id)}
        slug={product.slug}
        addLabel={m.product.addFavourite}
        removeLabel={m.product.removeFavourite}
        onArtwork={onArtwork}
      />
    );

    return onArtwork ? (
      <>
        {heart}
        {share}
      </>
    ) : (
      <>
        {share}
        {heart}
      </>
    );
  };

  // Home → the category's own chain → (the product, added by the builder).
  // Only ancestors that are PAGES: one with a single child redirects down its
  // chain, and a leaf selling only this product redirects back here, so a
  // crumb pointing at either would point at a redirect.
  const kids = childrenByParent(categories);
  const trail = [
    { name: m.common.storeName, path: `/${locale}` },
    ...(category
      ? ancestry(categories, category).filter((entry) => isCategoryPage(entry, kids)).map((entry) => ({
          name: entry.name[locale] ?? entry.name.en ?? entry.slug,
          path: categoryPath(categories, entry, locale),
        }))
      : []),
  ];
  // «PUBG Mobile»: the category level's brand, which the API already falls
  // back to its name per locale (v0.1.69).
  const brandOwner = category ? brandCategory(categories, category) : null;
  // The artwork: the product's own picture, else its category's card art
  // (`productArtwork`) — the value its og:image and its structured data carry
  // too, so the three cannot disagree (spec 2026-10-10 §3.4). The buy bar
  // wears the product's OWN picture when staff uploaded one (owner
  // 2026-10-26: a specific picture is never swapped for a generic one), else
  // the MAIN category's (the brand level's, `brandArt`) — owner, 2026-10-09.
  const artwork = productArtwork(product, categories, locale, name);
  const ownArt = product.images?.primary_image?.url ? artwork : null;
  const barArt = category ? brandArt(categories, category) : null;

  return (
    <>
      <PurchasePage
        locale={locale}
        title={name}
        image={artwork}
        icons={icons}
        game={game}
        purchaseSlot={
          // The fallback is the packs' empty shape in the panel's room and
          // says nothing: no price, no tier, nothing a visitor could misread
          // before theirs arrive. The SHORTEST measured panel that offers a
          // choice (`PANEL_ROOM`), so the page below only ever moves down
          // when the panel lands.
          <Suspense fallback={<PurchasePanelFallback />}>
            <PurchasePanel
              locale={locale}
              slug={product.slug}
              searchParams={props.searchParams}
              title={name}
              // A live app's drawn card (`Artwork.drawn`) is the same card everywhere.
              image={artwork?.drawn ? artwork : (ownArt ?? (barArt ? { url: barArt.url, alt: barArt.alt?.[locale] || name } : artwork))}
              heroImage={artwork}
              categoryPublicId={category?.public_id}
              fields={fields}
              game={game}
              // The hero's picture first, then the gallery (spec §3.4).
              images={[...new Set([artwork?.url, ...(product.images?.gallery ?? []).map((g) => g.url)].filter((u): u is string => Boolean(u)))]}
              trail={trail}
              brand={brandOwner?.brand?.[locale] ?? brandOwner?.name[locale] ?? null}
            />
          </Suspense>
        }
        description={product.description?.[locale]}
        instructions={product.images?.instructions ?? []}
        recommendations={
          <Suspense fallback={<div data-cq-fallback="recommendations" aria-hidden className="mt-6 min-h-[296px] lg:mt-12 lg:min-h-[370px]" />}>
            <SectionBoundary name="recommendations">
              <Recommendations locale={locale} slug={product.slug} />
            </SectionBoundary>
          </Suspense>
        }
        reviews={
          <Suspense fallback={<div data-cq-fallback="reviews" aria-hidden className="mt-6 min-h-[160px]" />}>
            <SectionBoundary name="product_reviews">
              <ProductReviews locale={locale} slug={product.slug} />
            </SectionBoundary>
          </Suspense>
        }
      />
      <OpenReviewsFromLink />
      <RecordProductView slug={product.slug} />
    </>
  );
}
