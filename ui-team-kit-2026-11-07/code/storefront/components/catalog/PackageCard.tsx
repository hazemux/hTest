"use client";

import Image from "next/image";

import { FavouriteButton } from "@/components/catalog/FavouriteButton";
import { Price } from "@/components/catalog/Price";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { IntentLink } from "@/components/ui/IntentLink";
import type { Package } from "@/lib/catalog/layout";
import { packQuery } from "@/lib/catalog/pack-link";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * One PRODUCT on a category page — the packages comp's card, `7104:9149` on
 * desktop (184 × 330.7),
 * `6847:96120`'s cards on the phone (150 × 281).
 *
 * |               | desktop            | phone              |
 * |---------------|--------------------|--------------------|
 * | artwork       | 184 × 175.7, r20   | 150 × 144, r20     |
 * | saving, heart | 16 SemiBold, 24px  | 12 SemiBold, 20px  |
 * | name          | 16 SemiBold, 2 ln  | 12 SemiBold, 2 ln  |
 * | was / now     | 12 / 16 Bold       | 10 / 14 Bold       |
 * | buy button    | 37 tall, 14 Medium | 34 tall, 12 Medium |
 *
 * NOT ONE BIG LINK. The card holds up to three forms (heart, bag, buy), and a
 * form inside an `<a>` is invalid HTML that browsers reparent. So the artwork
 * and the name are two links to the same product page — the artwork's is
 * hidden from assistive tech and the tab order, so it is announced once — and
 * the controls are their siblings.
 *
 * ONE CARD IS ONE PRODUCT (`packagesOf`), and both its controls OPEN THE
 * PRODUCT — where the tier is chosen and the player id asked for. Cards appear
 * only in «قد يعجبك أيضًا» now: a category page is itself a purchase page
 * (`PurchasePage`), so nothing is bought from a card any more.
 *
 * A CLIENT COMPONENT FOR ITS BYTES, not for behaviour (2026-10-13). It holds
 * no state and is still drawn on the server — the HTML is the same, and the
 * heart is still a plain form. As a server component its whole element tree
 * (≈ 4.2 KB of class names, three links and a form per card) was ALSO
 * written into the page's inline RSC payload; as a client component that
 * payload carries only its props (≈ 0.6 KB). The row draws up to ten cards,
 * so that was the largest single block of the product page's HTML. Its
 * imports (messages, `formatMoney`, `next/image`) are already in the product
 * page's client bundle through `ProductPurchase`.
 */
export function PackageCard({
  locale,
  pkg,
  favourited,
}: {
  locale: Locale;
  pkg: Package;
  /** `null` when the wishlist could not be read — see `FavouriteButton`. */
  favourited: boolean | null;
}) {
  const m = messagesFor(locale);
  const href =
    `/${locale}/products/${encodeURIComponent(pkg.productSlug)}` + packQuery(pkg.pack);
  const saving = pkg.savingsPct ? m.product.save.replace("{pct}", String(pkg.savingsPct)) : null;

  return (
    <article className="flex h-full flex-col gap-2.5 rounded-[20px] bg-[var(--color-surface-subtle)] px-2 pb-2">
      <div className="relative -mx-2 aspect-[150/144] overflow-hidden rounded-[20px] lg:aspect-[184/175.68]">
        {/* The picture alone, on no plate; the brand blue only behind the placeholder. */}
        <IntentLink href={href} tabIndex={-1} aria-hidden className={`absolute inset-0 block ${pkg.image ? "" : "bg-[var(--color-brand-500)]"} transition-opacity duration-(--cq-motion-fast) ease-(--cq-ease-out) active:opacity-90`}>
          {pkg.image ? (
            <Image
              src={pkg.image.url}
              alt=""
              fill
              sizes="(min-width: 1024px) 184px, 150px"
              className="object-cover"
            />
          ) : (
            <ArtworkPlaceholder name={pkg.title} />
          )}
        </IntentLink>
        {/* The scrim the saving and the heart sit on: 64px, black at 75% fading
            to nothing (`7104:9152`). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-[12px] bg-gradient-to-b from-black/75 to-transparent"
        />
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-center justify-between">
          <span className="text-caption font-semibold leading-[1.5] text-[var(--color-error-light)] lg:text-body-l">
            {saving}
          </span>
          <div className="pointer-events-auto">
            <FavouriteButton
              locale={locale}
              productPublicId={pkg.productPublicId}
              slug={pkg.productSlug}
              favourited={favourited}
              addLabel={m.product.addFavourite}
              removeLabel={m.product.removeFavourite}
              onArtwork
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <h3 className="line-clamp-2 min-h-[36px] text-caption font-semibold leading-[1.5] text-[var(--color-ink)] lg:min-h-[48px] lg:text-body-l">
          <IntentLink href={href} className="transition-opacity duration-(--cq-motion-fast) ease-(--cq-ease-out) hover:text-[var(--color-brand-500)] active:opacity-70">
            {pkg.title}
          </IntentLink>
        </h3>
        {/* Was, then now — both the SERVER'S figures for this one tier; the
            struck figure appears only when the server reports a saving. */}
        <p className="flex flex-col items-start">
          {pkg.regularPrice ? (
            <s className="text-caption-xs leading-[1.5] text-[var(--color-error)] lg:text-caption">
              <Price locale={locale} amount={pkg.regularPrice.amount} currency={pkg.regularPrice.currency} />
            </s>
          ) : null}
          <span className="text-body-s font-bold leading-[1.5] text-[var(--color-brand-500)] lg:text-body-l">
            {pkg.from ? <span className="font-medium text-[var(--color-ink-muted)]">{m.catalog.from} </span> : null}
            <Price locale={locale} amount={pkg.price.amount} currency={pkg.price.currency} />
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <IntentLink
          href={href}
          aria-label={m.cart.addToCart}
          className="grid h-[34px] w-[31px] shrink-0 place-items-center rounded-full bg-[var(--color-secondary-wash-strong)] text-[var(--color-ink)] transition duration-(--cq-motion-fast) ease-(--cq-ease-out) hover:brightness-95 active:scale-[0.98] lg:h-[37px]"
        >
          <BagGlyph />
        </IntentLink>
        <IntentLink href={href} className={`${BUY} min-w-0 flex-1`}>
          {m.catalog.buyNow}
        </IntentLink>
      </div>
    </article>
  );
}

const BUY =
  "flex h-[34px] w-full items-center justify-center rounded-[26px] bg-[var(--color-brand-500)] px-4 text-caption font-medium leading-[1.5] whitespace-nowrap text-white transition duration-(--cq-motion-fast) ease-(--cq-ease-out) hover:bg-[var(--color-primary-hover)] active:scale-[0.98] lg:h-[37px] lg:text-body-s";

/** The comp's "Bag 1" outline at 16px, painted in the button's ink. */
function BagGlyph() {
  return (
    <span
      aria-hidden
      className="block size-4 bg-current [mask-image:url(/brand/icon-tab-cart.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
    />
  );
}
