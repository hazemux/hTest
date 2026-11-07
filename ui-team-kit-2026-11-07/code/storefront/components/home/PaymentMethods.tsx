import Image from "next/image";
import type { CSSProperties } from "react";

import { tileArt } from "@/lib/checkout/method-logos";
import { schemeMarks } from "@/lib/checkout/scheme-marks";
import { splitTiles, type TileBreakpoint } from "@/lib/home/payment-tiles";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

export type PaymentMethodTile = {
  code: string;
  name: string;
  /** The API's method type — `manual_transfer` is told apart by it, not by code. */
  type?: string;
};

/**
 * «طرق الدفع» (phone 6847:98036, desktop 3909:5396).
 *
 * THE COMPS DRAW TWENTY TILES. This renders the methods `GET /payment-methods`
 * offers THIS visitor — their currency and, when it is known, their country,
 * exactly as checkout asks (`lib/currency/payment-country.ts`) — so a Kuwaiti
 * visitor sees KNET once it is switched on and a Saudi one never does. The
 * other marks in the design (PayPal, STC Pay, Fawry, InstaPay, the banks)
 * name rails no configured method serves; HANDBOOK §1 states the rule without
 * a checkout-only qualifier: never render a method the server didn't offer.
 * The strip grows into the comp on its own the day `config/payment_methods.php`
 * grows.
 *
 * «و المزيد» IS A REAL EXPANDER (owner, 2026-10-07): the first four phone
 * rows (two on desktop) show, the rest wait in a native `<details>` — the
 * server's HTML is the final state, and it opens without JavaScript. When
 * everything fits it is not drawn at all (`lib/home/payment-tiles.ts`).
 *
 * THE TILE ART IS A SEPARATE REGISTRY FROM `lib/checkout/scheme-marks.ts`, on
 * purpose. There, marks are decorative reassurance sitting BESIDE a named radio
 * button, so a method with no marks still reads correctly. Here the tile has
 * nothing else in it, so a method with no mark has to fall back to its own
 * server-supplied name — which is exactly what the comp's "Bank Transfer" tile
 * does. Sharing one map would force one of the two screens to be wrong.
 */
const TILE_GLYPHS: Readonly<Record<string, { src: string; size: number }>> = {
  manual_transfer: { src: "/brand/pay-bank-transfer.svg", size: 19 },
};

/**
 * The desktop tile is the phone's drawn ~1.88× larger (129.5 vs 69 wide), and
 * so is every logo in it — Visa 57.5 → 107.9, Mastercard 32.2 → 60.5.
 */
const DESKTOP_SCALE = 1.876;

/**
 * One TILE PER MARK, as the comps draw them: Visa and Mastercard are two
 * tiles (`6959:18586`, `6959:18594`), not one method-shaped box holding both.
 * A card method therefore spreads into its schemes; a method with no mark is
 * one tile carrying its server-supplied name. `label` is the method's name on
 * its first tile only, for a screen reader — the art itself is decorative.
 */
type TileContent = { key: string; label: string } & (
  | { kind: "art"; src: string; width: number; height: number; ownGround?: true }
  | { kind: "named"; name: string; glyph?: { src: string; size: number } }
);

function tilesFor(methods: PaymentMethodTile[], currency: string): TileContent[] {
  return methods.flatMap<TileContent>((method) => {
    // A method with its own logo (Binance Pay, NAPS, BenefitPay, KNET, mada,
    // OmanNet; SEPA on a euro transfer) or a wallet wordmark (Apple Pay,
    // Google Pay) is one tile holding that art — `method-logos.ts`.
    const art = tileArt(method, currency);
    if (art) return [{ key: method.code, label: method.name, kind: "art", ...art }];
    // The scheme marks are sized for checkout; the phone tile draws them 1.5×
    // (Visa 57.5×18.6, Mastercard 32×25 in 6959:18587 / 6959:18595).
    const marks = schemeMarks(method.code);
    if (marks.length > 0) {
      return marks.map((mark, index) => ({
        key: `${method.code}:${mark.src}`,
        label: index === 0 ? method.name : "",
        kind: "art",
        src: mark.src,
        width: mark.width * 1.5,
        height: mark.height * 1.5,
      }));
    }
    return [{ key: method.code, label: "", kind: "named", name: method.name, glyph: TILE_GLYPHS[method.code] }];
  });
}

/*
 * The two comps' tiles:
 *
 * |          | tile         | radius | hairline                  | gap | grid              |
 * |----------|--------------|--------|---------------------------|-----|-------------------|
 * | phone    | 69 × 32.37   | 4.26   | Theme/outline-border      | 12  | four across, 312  |
 * | desktop  | 129.5 × 60.75| 8      | Theme/text-primary        | 24  | centred, wrapping |
 */
/*
 * The tile takes the desktop comp's size from `md` (owner, 2026-10-08): on a
 * tablet the phone's four-up grid stretched each 69px tile to ~170×32. Which
 * tiles are open and which wait behind «و المزيد» still switches at `lg`
 * (`lib/home/payment-tiles.ts`) — a tablet keeps the phone's four rows.
 */
const TILE =
  "flex h-[32.37px] min-w-0 basis-[calc((100%-36px)/4)] items-center justify-center gap-0.5 rounded-[4.26px] border border-[var(--color-line)] px-1.5 md:h-[60.75px] md:w-[129.5px] md:basis-auto md:gap-1 md:rounded-[8px] md:border-[var(--color-ink)] md:px-2";

/*
 * CENTRED ON EVERY BREAKPOINT. The phone's four-across used to be a CSS grid,
 * and a grid cannot centre a short last row: a lone tile (Google Pay, with
 * the visitor's five methods) sat at the start edge — the right, in Arabic.
 * A wrapping flex row of quarter-width tiles (four tiles, three 12px gaps) is
 * the same four-across at every phone width, and centres what is left over.
 */
const GRID = "flex flex-wrap justify-center gap-3 md:items-center md:gap-6";

/** A copy that belongs on one breakpoint only (see `lib/home/payment-tiles.ts`). */
function onlyOn(only: TileBreakpoint): string {
  if (only === "phone") return "lg:hidden";
  if (only === "desktop") return "max-lg:hidden";
  return "";
}

function Tile({ tile, only }: { tile: TileContent; only: TileBreakpoint }) {
  return (
    <li className={`${TILE} ${onlyOn(only)}`}>
      {tile.label ? <span className="sr-only">{tile.label}</span> : null}
      {tile.kind === "art" ? (
        // The height is pinned per breakpoint and the width follows the
        // artwork, so no breakpoint falls back to the SVG's own size. On the
        // dark theme each sits on a white plate, as banks and wallets show
        // them (`.cq-mark-plate`) — except a mark with its own white ground
        // (Google Pay's), which must be shown unaltered.
        <Image
          src={tile.src}
          alt=""
          width={Math.round(tile.width * DESKTOP_SCALE)}
          height={Math.round(tile.height * DESKTOP_SCALE)}
          aria-hidden
          className={`${tile.ownGround ? "" : "cq-mark-plate "}h-[var(--mark-h)] w-auto md:h-[var(--mark-h-lg)]`}
          style={
            {
              "--mark-h": `${tile.height}px`,
              "--mark-h-lg": `${Math.round(tile.height * DESKTOP_SCALE)}px`,
            } as CSSProperties
          }
        />
      ) : (
        <>
          {/* A mask in the tile's ink: the glyph is drawn in #212121 and
              vanished on the dark theme as an <img>. */}
          {tile.glyph ? (
            <span
              aria-hidden
              className="block size-3 shrink-0 bg-[var(--color-ink)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] md:size-[var(--glyph)]"
              style={
                {
                  "--glyph": `${tile.glyph.size}px`,
                  maskImage: `url(${tile.glyph.src})`,
                  WebkitMaskImage: `url(${tile.glyph.src})`,
                } as CSSProperties
              }
            />
          ) : null}
          {/* No mark for this code — the method's own name from the API
              is the tile. Never a hardcoded label: the server already
              translates it. */}
          <span className="whitespace-nowrap text-center text-[8px] font-bold leading-tight text-[var(--color-ink)] md:text-caption md:font-medium">
            {tile.name}
          </span>
        </>
      )}
    </li>
  );
}

export function PaymentMethods({
  locale,
  currency,
  methods,
}: {
  locale: Locale;
  /** The visitor's currency — the one `methods` was listed for. */
  currency: string;
  methods: PaymentMethodTile[];
}) {
  const m = messagesFor(locale);

  if (methods.length === 0) return null;

  const split = splitTiles(tilesFor(methods, currency));
  const hasMore = split.moreOn.phone || split.moreOn.desktop;

  return (
    <section
      className="mx-auto mt-6 w-full max-w-[1248px] px-6 lg:mt-12 lg:py-6"
      aria-labelledby="payment-methods-heading"
    >
      {/* «طرق الدفع» / «طرق الدفع المدعومة» — what the STORE accepts, not
          buttons: nothing here pays. Checkout draws only what this device
          can use as well (an Apple Pay tile here does not mean an Apple Pay
          button on Android), and the note under the title says so.
          Body/Bold-S 14 on the phone; Heading/Bold-L 20 on desktop. */}
      <h2
        id="payment-methods-heading"
        className="text-center text-body-s font-bold leading-[1.5] text-[var(--color-ink)] md:text-heading-m lg:text-heading-l lg:leading-[1.4]"
      >
        <span className="lg:hidden">{m.home.paymentMethodsTitle}</span>
        <span className="hidden lg:inline">{m.home.paymentMethodsTitleWide}</span>
      </h2>
      <p className="mb-4 mt-1 text-center text-caption leading-[1.5] text-[var(--color-ink-muted)] md:mb-6 md:text-body-s">
        {m.home.paymentMethodsNote}
      </p>

      <ul className={GRID}>
        {split.open.map(({ tile, only }) => (
          <Tile key={`${tile.key}:${only ?? "all"}`} tile={tile} only={only} />
        ))}
      </ul>

      {hasMore ? (
        <details
          className={`cq-pay-more group mt-3 md:mt-6 ${split.moreOn.phone ? "" : "max-lg:hidden"} ${split.moreOn.desktop ? "" : "lg:hidden"}`}
        >
          {/* The comp's «و المزيد» tile (77×40 on the phone, 6959:18961;
              129×60.75 on desktop, 6957:15092). Opening it is the whole job,
              so it steps aside once the rest is showing. */}
          <summary className="mx-auto flex h-10 w-[77px] cursor-pointer flex-col items-center justify-center rounded-[8px] border border-[var(--color-line)] group-open:hidden md:h-[60.75px] md:w-[129.5px] md:gap-1 md:border-[var(--color-ink)]">
            <Image src="/brand/icon-add-square.svg" alt="" width={24} height={24} aria-hidden className="size-5 md:size-6" />
            <span className="text-[8px] font-bold leading-[1.5] text-[var(--color-ink-muted)] md:text-body-s">
              {m.home.paymentMore}
            </span>
          </summary>
          <ul className={GRID}>
            {split.more.map(({ tile, only }) => (
              <Tile key={`${tile.key}:${only ?? "all"}`} tile={tile} only={only} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
