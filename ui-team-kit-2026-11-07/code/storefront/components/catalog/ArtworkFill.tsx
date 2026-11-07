import Image from "next/image";

import { CategoryArt } from "@/components/catalog/CategoryArt";
import { LCP_IMAGE } from "@/lib/brand/image-priority";
import type { Artwork } from "@/lib/catalog/product-artwork";

/**
 * A product's picture filling its slot — the basket line, the order rows, the
 * order page, the payment result, the buy bar (owner 2026-11-04).
 *
 * A LIVE APP'S PICTURE IS ITS DRAWN CARD (`Artwork.drawn`, only with
 * `CATEGORY_ART_ENABLED`): the whole 512×576 card stands in the slot at the
 * slot's height, centred, so a square thumbnail shows the same card as the home
 * row. Anything else is the picture as before, cropped to fill.
 *
 * The parent is the slot: `relative`, sized, clipped and rounded by the caller.
 */
export function ArtworkFill({
  art,
  sizes,
  alt,
  lcp = false,
  className = "",
}: {
  art: Pick<Artwork, "url" | "drawn">;
  sizes: string;
  /** The picture's alt text; "" marks it decorative (its name is written beside it). */
  alt: string;
  lcp?: boolean;
  /** Extra classes on what is drawn (a line no longer for sale is greyed). */
  className?: string;
}) {
  if (art.drawn) {
    return (
      <span className={`absolute inset-0 flex items-center justify-center ${className}`}>
        <span className="block aspect-[512/576] h-full">
          <CategoryArt logo={{ url: art.drawn.logo }} name={art.drawn.name} sizes={sizes} lcp={lcp} />
        </span>
        {alt ? <span className="sr-only">{alt}</span> : null}
      </span>
    );
  }

  return <Image src={art.url} alt={alt} aria-hidden={alt === "" ? true : undefined} fill sizes={sizes} className={`object-cover ${className}`} {...(lcp ? LCP_IMAGE : {})} />;
}
