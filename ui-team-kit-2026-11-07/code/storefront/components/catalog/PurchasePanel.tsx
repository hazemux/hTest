import { ProductViewBeacon } from "@/components/analytics/ProductViewBeacon";
import { TrackOnView } from "@/components/analytics/TrackOnView";
import { BuyBarCartLink } from "@/components/cart/CartBadge";
import { ProductPurchase } from "@/components/catalog/ProductPurchase";
import { JsonLd } from "@/components/seo/JsonLd";
import { purchaseOptionItem } from "@/lib/analytics/items";
import { packArtEnabled } from "@/lib/catalog/pack-art";
import { loadPurchase, type PurchaseSearchParams, type PurchaseShared } from "@/lib/catalog/purchase-data";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import type { Artwork } from "@/lib/catalog/product-artwork";

/**
 * THE PANEL'S ROOM — the height its fallback holds, and the least any answer
 * keeps, so nothing below the panel moves up when a price boundary resolves.
 *
 * MEASURED, NOT GUESSED (Task 12, 2026-10-11, the E2E catalogue, guest): the
 * shortest panel that offers a choice is 122px below `lg` and 142px from it
 * (a two-pack card; PUBG's five packs are 320 / 376, a tiers card 130 /
 * 149.5, with region chips 340 / 405.5) — identical at 360, 390 and 768. So
 * a choice only ever GROWS from here, never shrinks under the reader. A
 * single-price product's panel is about 10px (its buy bar is fixed), so for
 * it the room is ~112px too tall; the old 500 / 560 was 160–490px too tall
 * for every product (CLS below `lg` up to 0.30 with a slow price read).
 */
export const PANEL_ROOM = "min-h-[122px] lg:min-h-[142px]";

/**
 * What a visitor sees while the panel streams: the PACKS' OWN SHAPE, empty —
 * the «رصيد الباقة» legend and a row of three tiles in the tiles' colour, in
 * the room the panel will keep (`PANEL_ROOM`). Not blank: React holds every
 * streamed boundary until about 300 ms after the page's first paint and
 * reveals them together (its batched reveal, `$RC`/`$RV`), so this is on
 * screen for at least that long even when the prices are ready at once
 * (measured 2026-10-13: packs at first paint + ~295 ms locally, warm).
 *
 * Says nothing a visitor could misread: no price, no tier name, no count —
 * the opening region (and so which packs) is the visitor's. Static, never
 * animated here (HANDBOOK §8). Its tallest point stays inside `PANEL_ROOM`
 * (legend 21 + 10, row 8 + 72 = 111 ≤ 122 below `lg`; 27 + 12 + 8 + 84 = 131
 * ≤ 142 from it), so the page below never moves up when the panel lands.
 */
export function PurchasePanelFallback() {
  return (
    <div aria-hidden data-cq-fallback="purchase" className={PANEL_ROOM}>
      <span className="mb-2.5 block h-[21px] w-28 rounded-full bg-[var(--color-chip)] lg:mb-3 lg:h-[27px] lg:w-36" />
      <span className="grid grid-cols-3 gap-2 pt-2 lg:gap-3">
        {[0, 1, 2].map((tile) => (
          <span key={tile} data-cq-skeleton-tile className="block h-[72px] rounded-[14px] bg-[var(--color-chip)] lg:h-[84px]" />
        ))}
      </span>
    </div>
  );
}

export interface PurchasePanelProps extends PurchaseShared {
  locale: Locale;
  slug: string;
  /** The page's query, still a promise: only this boundary waits on it. */
  searchParams: Promise<PurchaseSearchParams>;
  /** The buy bar's small artwork — the main category's picture, else the hero's. */
  image: Artwork | null;
  /** The page's own picture (`productArtwork`) — pack art draws the chosen package over it. */
  heroImage?: Artwork | null;
}

/**
 * THE PRODUCT PAGE'S PERSONAL BOUNDARY (ADR 0046 §2): every price on the page,
 * the tier it opens on, the visitor's saved details, Apple Pay, a basket line
 * being completed — and the structured data, because its Offers carry the
 * visitor's prices. The page renders it inside `<Suspense>`; everything around
 * it is shared by every visitor and reads none of this.
 *
 * Googlebot (htmlLimitedBots) waits for the whole document, so the JSON-LD is
 * still in the one response a crawler reads.
 */
export async function PurchasePanel({ locale, slug, searchParams, image, heroImage = null, ...shared }: PurchasePanelProps) {
  const load = await loadPurchase({ slug, locale, searchParams: await searchParams, shared });

  if (load.kind === "unavailable") {
    // Honest, never "not found" or "no products" (HANDBOOK §5): the page is
    // there, its prices cannot be shown right now. The breadcrumb and FAQ
    // nodes need no price, so they stay; no product node is claimed.
    return (
      <>
        <JsonLd data={load.structured} />
        {/* Keeps the panel's room: the message is shorter than the fallback. */}
        <div className={PANEL_ROOM}>
          <p role="alert" className="rounded-[20px] bg-[var(--color-surface-subtle)] p-4 text-body-m">
            {messagesFor(locale).product.pricesUnavailable}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* The product's structured data carries the visitor's price, so it
          lives in the price boundary (spec §3.4) — drawn even when nothing is
          sellable, so the breadcrumb and FAQ nodes stay. */}
      <JsonLd data={load.structured} />
      {/* Nothing to offer — every pack lacks the public id an order names it
          by (`productOptions`) — draws no buy area rather than a form that
          cannot be bought from. */}
      {load.props.options.length > 0 ? (
        <ProductPurchase
          {...load.props}
          title={shared.title}
          image={image}
          // Read per request here, in the priced part — never in the prerendered shell (spec §7).
          packArt={packArtEnabled()}
          heroImage={heroImage}
          basket={<BuyBarCartLink locale={locale} />}
        />
      ) : (
        // Nothing to buy keeps the room the fallback held, so the page below
        // does not jump up into it.
        <div aria-hidden className={PANEL_ROOM} />
      )}
      {load.view ? <ProductViewBeacon locale={locale} view={load.view} /> : null}
      {load.initial ? <TrackOnView event="product" signature={load.initial.key} items={[purchaseOptionItem(load.initial, slug, locale)]} /> : null}
    </>
  );
}
