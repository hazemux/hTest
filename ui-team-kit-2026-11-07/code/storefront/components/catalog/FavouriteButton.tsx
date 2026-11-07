import { setFavouriteAction } from "@/lib/favourites/actions";
import type { Locale } from "@/lib/i18n/locales";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * The heart above the product title (Figma 6847:97162).
 *
 * A FORM, NOT A CLIENT COMPONENT. It posts the desired end state to a Server
 * Action and re-renders from the server's answer, so it works with the bundle
 * blocked and there is no optimistic local flip that can end up disagreeing
 * with the wishlist. The action revalidates this product's path, which is what
 * swaps the outline for the filled heart.
 *
 * A GUEST STILL GETS THE HEART. Hiding it would mean a signed-out customer
 * cannot discover that favourites exist; pressing it sends them to sign in with
 * a `next` back to this product, which is what the action does when it finds no
 * session.
 */
export function FavouriteButton({
  locale,
  productPublicId,
  slug,
  favourited,
  addLabel,
  removeLabel,
  back,
  onArtwork = false,
}: {
  locale: Locale;
  /** The product's PUBLIC id (ADR 0037); null only in a malformed answer — no heart then. */
  productPublicId: string | null;
  slug: string;
  /**
   * Whether it is saved — or `null` when the wishlist could not be read. Null
   * is drawn as an outline WITHOUT a pressed state (it claims nothing) and
   * posts "1": the PUT is idempotent, so a tap on something already saved
   * changes nothing and the re-render shows the truth.
   */
  favourited: boolean | null;
  addLabel: string;
  removeLabel: string;
  /** The category page a package card sits on — see `lib/favourites/return-path.ts`. */
  back?: string;
  /**
   * White over a card's artwork, under its dark scrim (`7104:9154`), rather
   * than ink on the page's ground. A saved heart stays red either way.
   */
  onArtwork?: boolean;
}) {
  const pressed = favourited === true;
  const label = pressed ? removeLabel : addLabel;
  // A product without a public id cannot be named to the wishlist any more:
  // a heart that posts nothing would be a control wired to nothing.
  if (productPublicId === null) return null;

  return (
    <form action={setFavouriteAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="product_public_id" value={productPublicId} />
      <input type="hidden" name="slug" value={slug} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      {/* The state WANTED, not a toggle flag. `PUT /me/favourites/{id}` and its
          DELETE are both idempotent, so a double-tap or a connection retry
          lands on the same end state — which an invert-what-you-find toggle
          would turn into a coin flip. */}
      <input type="hidden" name="favourite" value={pressed ? "0" : "1"} />
      <SubmitButton
        title={label}
        aria-label={label}
        aria-pressed={favourited === null ? undefined : pressed}
        className={`grid place-items-center rounded-full transition ${
          onArtwork ? "size-6 hover:opacity-80" : "size-9 hover:bg-[var(--color-chip)]"
        } ${
          pressed ? "text-[var(--color-danger)]" : onArtwork ? "text-white" : "text-[var(--color-ink)]"
        }`}
      >
        {/*
         * THE ASSET AS A MASK, NOT AN <img>.
         *
         * Both heart exports are `fill="white"` — they were drawn for the blue
         * tab bar and for the overlay on a product tile's artwork. Dropped onto
         * this page as an image, the heart is white on white: present, sized,
         * clickable, and completely invisible. Masking paints the exported
         * glyph in `currentColor`, so the same file serves a dark heart here
         * and a red one once it is saved, with no second export and nothing
         * hand-drawn.
         */}
        <span
          aria-hidden="true"
          className="block size-6 bg-current"
          style={{
            maskImage: `url(${pressed ? "/brand/icon-favourite-filled.svg" : "/brand/icon-tab-favourites.svg"})`,
            WebkitMaskImage: `url(${pressed ? "/brand/icon-favourite-filled.svg" : "/brand/icon-tab-favourites.svg"})`,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
        />
      </SubmitButton>
    </form>
  );
}
