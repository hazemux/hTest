import Image from "next/image";

import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";

import { IntentLink } from "@/components/ui/IntentLink";
import { LCP_IMAGE } from "@/lib/brand/image-priority";
import type { Locale } from "@/lib/i18n/locales";

type Product = {
  slug: string;
  name: Record<string, string>;
  images?: {
    primary_image?: { url: string; alt: Record<string, string> } | null;
  } | null;
};

/**
 * One catalogue tile — the card the category listing and the favourites page
 * both render.
 *
 * ONE CARD, EXTENDED, not a second one. The favourites comp draws the same tile
 * with a control on top of the artwork, so this component grew an `overlay`
 * slot rather than being copied; a second product card would be a second place
 * to fix the next price or image change in.
 *
 * `overlay` IS A SIBLING OF THE ANCHOR, NEVER A CHILD. The whole card is a
 * `<Link>`, and a `<form>` with a submit button nested inside an `<a>` is
 * invalid HTML — browsers reparent it, and the click target becomes ambiguous
 * between "open the product" and "press the button". So the anchor and the
 * overlay are two children of one positioned wrapper, which also means the
 * overlay is reachable by keyboard in its own right instead of being swallowed
 * by the link.
 *
 * NO FRAME, NO PRICE (owner, 2026-10-09): the artwork and the product's name
 * centred under it. The product page is where a tier and its price are
 * chosen, so the tile states neither a «من» figure nor a saving.
 */
export function ProductCard({
  locale,
  product,
  overlay,
  lcp = false,
}: {
  locale: Locale;
  product: Product;
  /** Rendered over the top of the card — see the note above on why it is a sibling. */
  overlay?: React.ReactNode;
  /** The page's LCP image: preloaded at high priority. One card per page, at most. */
  lcp?: boolean;
}) {
  const image = product.images?.primary_image;

  const card = (
    <IntentLink
      href={`/${locale}/products/${product.slug}`}
      className="group flex flex-col gap-3 transition duration-(--cq-motion-fast) ease-(--cq-ease-out) hover:text-[var(--color-brand-500)] active:scale-[0.98]"
    >
      {/* The picture alone, on no plate (owner 2026-10-26: the 3D product
          art is drawn as it is); the pale blue only behind the placeholder. */}
      <div className={`relative aspect-square overflow-hidden rounded-xl ${image ? "" : "bg-[var(--color-brand-50)]"}`}>
        {image ? (
          <Image
            src={image.url}
            // Alt text comes from the admin in both languages (CC1). An
            // image whose alt was never filled in gets the product name
            // rather than an empty string, which a screen reader announces
            // as nothing at all.
            alt={image.alt[locale] || product.name[locale] || product.slug}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover"
            {...(lcp ? LCP_IMAGE : {})}
          />
        ) : (
          <ArtworkPlaceholder name={product.name[locale] ?? product.slug} />
        )}
      </div>

      <h3 className="line-clamp-2 text-center text-body-s font-medium lg:text-body-l">
        {product.name[locale] ?? product.slug}
      </h3>
    </IntentLink>
  );

  if (!overlay) return card;

  return (
    <div className="relative">
      {card}
      {/* `end`/`top`, never `right` — the comp puts this at the artwork's end
          edge, which is the LEFT of an Arabic card and the RIGHT of an English
          one. A logical property gets both from one declaration. */}
      <div className="absolute end-4 top-4">{overlay}</div>
    </div>
  );
}
