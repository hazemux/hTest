import Image from "next/image";

import { CategoryArt } from "@/components/catalog/CategoryArt";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { IntentLink } from "@/components/ui/IntentLink";
import { LCP_IMAGE } from "@/lib/brand/image-priority";
import { artName, categoryArtEnabled } from "@/lib/catalog/category-art";
import type { TileVariant } from "@/lib/catalog/layout";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

export type Tile = {
  slug: string;
  name: string;
  /**
   * Where this tile goes — carried BY the tile rather than built in here.
   *
   * The row lists categories now and listed products before it, and a
   * `/products/${slug}` template hidden inside the card was the reason that
   * could not simply change. The caller knows what it is handing over and how
   * to address it; a category's URL is its whole ancestor chain rather than one
   * slug (`lib/catalog/tree.ts`).
   */
  href: string;
  image: { url: string; alt: string } | null;
  /**
   * A live app's logo (`images.logo`): with `CATEGORY_ART_ENABLED`, an apps
   * row draws the card from it and the name (`CategoryArt`).
   */
  logo?: { url: string } | null;
};

export type { TileVariant };

/**
 * The three CARD styles the home comp draws — one per kind of row, measured
 * from `3840:6218` (games), `3840:6278` (apps) and `3840:6346` (gift cards) on
 * desktop and from `6847:97788` / `97827` / `97883` on the phone.
 *
 * |        | desktop card        | ground               | gap to label | phone              |
 * |--------|---------------------|----------------------|--------------|--------------------|
 * | game   | 172×192, square     | none (the art carries its own) | 12 | 64×72 grid, 4 up |
 * | app    | 183×227, r16        | "Silver Cards" ramp  | 8            | 66×66 grid, 4 up   |
 * | card   | 183×254.6, square   | none (the art is the card shape) | 12 | 92×128 scroller |
 *
 * GAMES are hard-coded to the 512×576 upload: no ground, no radius, no
 * clipping — the uploaded picture brings its own background and corners, and
 * is shown whole (`object-contain`) at 64×72 on the phone and 172×192 on
 * desktop — or narrower at the same ratio where six 172s do not fit the row
 * (1024–1131px), so the grid never scrolls sideways.
 *
 * The GROUND shows only where artwork is transparent or missing: every card
 * in the comp is covered by its art, which is uploaded per category in the
 * media library, never committed here.
 */

/*
 * THE TABLET STEP (owner, 2026-10-08). Between 768 and 1023 the home rows
 * used to keep the phone's shapes — four 64px games spread across 720px,
 * apps and gift cards in thin scrollers. From `md` a home row takes the
 * desktop comp's six-up grid at the desktop card ratios, a size between the
 * two comps. Only the home's `row` mode: the category and choice pages keep
 * their own phone grids.
 */
const CARD_FROM_TABLET: Record<TileVariant, string> = {
  game: "md:aspect-[172/192] md:h-auto md:w-full md:max-w-[172px]",
  app: "md:aspect-[183/227] md:bg-[image:var(--gradient-silver)]",
  card: "md:aspect-[183/254.6]",
};

const CARD: Record<TileVariant, string> = {
  game: "mx-auto h-[72px] w-[64px] lg:aspect-[172/192] lg:h-auto lg:w-full lg:max-w-[172px]",
  app: "overflow-hidden aspect-square rounded-[16px] bg-[var(--color-border-subtle)] lg:aspect-[183/227] lg:bg-[image:var(--gradient-silver)]",
  card: "overflow-hidden aspect-[92/128] lg:aspect-[183/254.6]",
};

/**
 * A titled row of catalogue tiles.
 *
 * ONE COMPONENT, three card styles. The heading, the chip, the six-up desktop
 * grid and the label type are shared by all three rows; what differs is the
 * card itself and, on the phone, whether the row is a grid (games and apps)
 * or a horizontal scroller (gift cards).
 */
export function TileSection({
  locale,
  title,
  href,
  tiles,
  variant = "game",
  hideHeader = false,
  phone = "row",
  spacing = "mt-6 lg:mt-12",
  lcp = false,
}: {
  locale: Locale;
  title: string;
  href: string;
  tiles: Tile[];
  variant?: TileVariant;
  /**
   * Draw the grid alone — for search results, which have no "view all"
   * destination because they already are all of them.
   */
  hideHeader?: boolean;
  /**
   * How the phone lays the tiles out. `row` is the home comp's per-kind shape
   * (below); `grid` is the category comp's (`6847:96404`): every kind four up
   * at 66px with 16 across and 12 down — three up for gift cards, whose card
   * is taller than it is wide. `pair` is a game's choice page: two up,
   * each card filling its half of the column at the games card's ratio, and
   * every name shown in full — a game's options differ only at the end of
   * their names («… عبر الآيدي» / «… عبر الدخول»).
   */
  phone?: "row" | "grid" | "pair";
  /** The section's own top margin — the home rhythm by default. */
  spacing?: string;
  /** This section holds the page's LCP image: its first tile is preloaded at high priority. */
  lcp?: boolean;
}) {
  const m = messagesFor(locale);

  if (tiles.length === 0) return null;

  // The phone comp gives each row its own shape (`6847:97787` / `97826` /
  // `97883`): games sit in a four-up grid; gift cards scroll sideways, past
  // the column to the screen edge (the comp's rows start at x=-120), so they
  // bleed through the 24px gutter. From `lg` every row is the comp's six-up
  // grid: 20px across, 24px down.
  //
  // APPS TAKE THE GAMES' GRID (owner, 2026-10-10), not the comp's two-row
  // scroller: its columns were as many as half the apps, 66px each from the
  // start edge, so ten apps drew five columns that stopped short of the end
  // edge and lined up with nothing in the games row above. Four up with the
  // games' `justify-between`, the two rows share their columns edge to edge.
  const pair = phone === "pair";
  const phoneList = pair
    ? "grid grid-cols-2 gap-x-4 gap-y-6"
    : phone === "grid"
    ? variant === "card"
      ? "grid grid-cols-3 gap-x-3 gap-y-3"
      : "grid grid-cols-[repeat(4,66px)] justify-between gap-y-3"
    : {
        game: "grid grid-cols-[repeat(4,66px)] justify-between gap-y-3",
        app: "grid grid-cols-[repeat(4,66px)] justify-between gap-y-4",
        card: "-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none]",
      }[variant];
  const homeRow = phone === "row";
  // THE DRAWN APPS ROW (owner 2026-11-04): a live app's card is drawn from its
  // logo at the games card's 512×576 shape. The whole row takes that shape, so
  // an app with no logo yet shows its old card image whole in the same box and
  // the row keeps one height.
  const drawn = variant === "app" && !pair && categoryArtEnabled();

  return (
    <section className={`mx-auto w-full max-w-[1248px] px-6 ${spacing}`}>
      <div className={`mb-5 items-center justify-between lg:mb-6 ${hideHeader ? "hidden" : "flex"}`}>
        {/* Body/Bold 14/1.5 on the phone, Heading/Bold-L 20/1.4 on desktop. */}
        <h2
          className={`text-body-s font-bold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:leading-[1.4] ${
            homeRow ? "md:text-heading-m" : ""
          }`}
        >
          {title}
        </h2>
        {/* «عرض الكل» — Background/secondary/Default under Theme/text-primary:
            Caption/SemiBold 12 in a 21px chip on the phone, Body/SemiBold-L 16
            with 16×8 padding (40px) on desktop. */}
        <IntentLink
          href={href}
          className={`rounded-[8px] bg-[var(--color-secondary)] px-2 text-caption font-semibold leading-[1.5] text-[var(--color-ink)] transition hover:bg-[var(--color-secondary-hover)] lg:px-4 lg:py-2 lg:text-body-l ${
            homeRow ? "md:px-3 md:py-1 md:text-body-s" : ""
          }`}
        >
          {m.home.viewAll}
        </IntentLink>
      </div>

      <ul
        className={`${phoneList} lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-x-5 lg:gap-y-6 lg:overflow-visible lg:px-0 lg:pb-0 ${
          homeRow ? "md:mx-0 md:grid md:grid-cols-6 md:gap-x-4 md:gap-y-5 md:overflow-visible md:px-0 md:pb-0" : ""
        }`}
      >
        {tiles.map((tile, index) => (
          <li
            key={tile.slug}
            className={variant === "card" && homeRow ? "w-[92px] shrink-0 md:w-auto" : "min-w-0 shrink-0"}
          >
            <IntentLink href={tile.href} className="group block">
              <div
                className={`relative transition group-hover:brightness-95 ${
                  pair ? "mx-auto aspect-[172/192] w-full lg:max-w-[172px]" : drawn ? "aspect-[512/576] w-full" : CARD[variant]
                } ${homeRow && !drawn ? CARD_FROM_TABLET[variant] : ""}`}
              >
                {drawn && tile.logo ? (
                  <CategoryArt
                    logo={tile.logo}
                    name={artName(tile.name)}
                    sizes={`(min-width: 1024px) 183px, ${homeRow ? "(min-width: 768px) 120px, " : ""}66px`}
                    lcp={lcp && index === 0}
                  />
                ) : tile.image ? (
                  <Image
                    src={tile.image.url}
                    alt={tile.image.alt || tile.name}
                    fill
                    sizes={
                      pair
                        ? "(min-width: 1024px) 172px, 50vw"
                        : variant === "game"
                          ? `(min-width: 1024px) 172px, ${homeRow ? "(min-width: 768px) 120px, " : ""}64px`
                          : `(min-width: 1024px) 183px, ${homeRow ? "(min-width: 768px) 120px, " : ""}92px`
                    }
                    className={variant === "game" || drawn ? "object-contain" : "object-cover"}
                    {...(lcp && index === 0 ? LCP_IMAGE : {})}
                  />
                ) : (
                  <ArtworkPlaceholder name={tile.name} />
                )}
              </div>
              {/* Caption/Medium 12/1.5 on the phone and Heading/Medium-M 18/1.4
                  on desktop, 12px under the card (8px for apps); a `pair` at
                  14/1.5 on the phone. ALWAYS THE WHOLE NAME: no clamp and no
                  ellipsis at any width — a cut «بطاقات ستيم…» is a name the
                  customer has to guess, so a long one wraps instead, balanced. */}
              <p
                className={`mt-2 text-center font-medium leading-[1.5] text-balance break-words text-[var(--color-ink)] lg:text-heading-m lg:leading-[1.4] ${
                  pair ? "text-body-s" : "text-caption"
                } ${homeRow ? "md:text-body-s" : ""} ${
                  variant === "app" ? "lg:mt-2" : "lg:mt-3"
                }`}
              >
                {tile.name}
              </p>
            </IntentLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
