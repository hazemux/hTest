import Image from "next/image";

import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { IntentLink } from "@/components/ui/IntentLink";
import { ABOVE_FOLD_IMAGE, LCP_IMAGE } from "@/lib/brand/image-priority";

/**
 * The 144×165 tile of the categories index and the method choice
 * (`6877:142154`, `6877:140016`; phone `6904:22758`, `6847:96288`).
 *
 * A 144px square of artwork, radius 16, on primary blue where the art is
 * transparent or missing; the name under it, centred — Body/SemiBold 16 on
 * desktop, 14 on the phone, 21/24px tall so the tile is 165 as drawn.
 *
 * FLUID ON THE PHONE, 144 FROM `lg`. The 360 comp puts two in the 312 column
 * with 24 between them — 144 + 24 + 144 — but a fixed 144 on a wider phone
 * (390, 414) left the pair at the start edge with an empty band at the end,
 * which read as misaligned. On the phone the tile fills its grid column (the
 * list is `CATEGORY_TILE_GRID`), so the pair spans the column at any width;
 * desktop keeps the drawn size and lets the row run from the start edge.
 */
export const CATEGORY_TILE_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-6 min-[560px]:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:gap-6";

export function CategoryTile({
  name,
  href,
  image,
  lcp = false,
  eager = false,
  framed = true,
}: {
  name: string;
  href: string;
  image: { url: string; alt: string } | null;
  /** The page's LCP image: preloaded at high priority. One tile per page, at most. */
  lcp?: boolean;
  /** Above the fold but not the LCP: fetched at once, at low priority, with no preload. */
  eager?: boolean;
  /**
   * The picture sits in a 16-radius brand-blue well, cropped to fill it (the
   * sections index). `false` is the FRAMELESS tile of a branch page's sub
   * categories (owner 2026-10-21, as the product tiles of #252): the picture is
   * shown whole on the page itself — no well, no radius, no clip — because the
   * uploaded art brings its own background and corners, as a game's card does
   * (`TileSection`). The name, the size and the link stay the same.
   */
  framed?: boolean;
}) {
  return (
    <IntentLink href={href} className="group flex w-full flex-col items-center transition-transform duration-(--cq-motion-fast) ease-(--cq-ease-out) active:scale-[0.98] lg:w-[144px]">
      <span
        className={`relative block aspect-square w-full transition group-hover:brightness-95 ${
          framed ? "overflow-hidden rounded-[16px] bg-[var(--color-brand-500)]" : ""
        }`}
      >
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || name}
            fill
            sizes="(max-width: 1023px) 50vw, 144px"
            {...(lcp ? LCP_IMAGE : eager ? ABOVE_FOLD_IMAGE : {})}
            className={framed ? "object-cover" : "object-contain"}
          />
        ) : (
          <ArtworkPlaceholder name={name} className={framed ? "" : "rounded-[16px]"} />
        )}
      </span>
      <span className="text-center text-balance break-words text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-body-l">
        {name}
      </span>
    </IntentLink>
  );
}
