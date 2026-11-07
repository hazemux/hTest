import { Suspense } from "react";

import { FavouriteButton } from "@/components/catalog/FavouriteButton";
import { hasPublicId } from "@/lib/api/public-id";
import { favouritedAmong } from "@/lib/favourites/queries";
import type { Locale } from "@/lib/i18n/locales";

type FavouriteSlotProps = {
  locale: Locale;
  /** The product's PUBLIC id (ADR 0037); null draws no heart. */
  productPublicId: string | null;
  slug: string;
  addLabel: string;
  removeLabel: string;
  onArtwork?: boolean;
};

/**
 * The product page's heart, in its OWN boundary (ADR 0046 §2): whether it is
 * saved is the visitor's wishlist, which the shared page never reads. Until
 * it is known the heart is drawn claiming nothing (`favourited={null}`) —
 * the same outline a wishlist that could not be read draws, never a false
 * "not saved" (HANDBOOK §8) — and a press still works: the PUT is idempotent.
 */
export function FavouriteSlot(props: FavouriteSlotProps) {
  // No public id, nothing an order or a wishlist can name: no heart, no read.
  if (props.productPublicId === null) return null;
  return (
    <Suspense fallback={<FavouriteButton {...props} favourited={null} />}>
      <SavedHeart {...props} />
    </Suspense>
  );
}

async function SavedHeart(props: FavouriteSlotProps) {
  const hearts = await favouritedAmong([props.productPublicId], { locale: props.locale });
  return <FavouriteButton {...props} favourited={hearts === null ? null : hasPublicId(hearts, props.productPublicId)} />;
}
