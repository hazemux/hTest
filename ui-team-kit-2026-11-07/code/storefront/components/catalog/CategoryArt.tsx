import Image from "next/image";
import { useId } from "react";

import { LCP_IMAGE } from "@/lib/brand/image-priority";

/**
 * A live app's card DRAWN BY THE STORE from its logo and name (owner
 * 2026-11-04, `CATEGORY_ART_ENABLED`): staff upload only the square Play Store
 * icon and the store draws the rest.
 *
 * MEASURED FROM THE HAND-MADE CARD (owner: «تطابقها ١٠٠٪», the «نيتا شات»
 * card, 512×576). Every number below is a pixel of that file: the frame from
 * y 66 with a 92 radius; two 6px light stripes and two blocks of 2×3 dots each
 * side; the logo 366px square at x 73, radius 90, no shadow; the torn edge
 * traced from the file, a translucent light band, and the silver panel 22px
 * under it with the file's own 45° shading; the name centred at y ≈ 503.
 *
 * ONE SVG, ONE PICTURE, ONE LINE OF TEXT. The frame is a single inline SVG on
 * the 512×576 viewBox, so it is crisp at any size; the logo is a `next/image`;
 * the name is HTML, so it wraps by word and reads right to left, and is set in
 * `cqw` so it scales with the card.
 *
 * THE SAME IN BOTH THEMES, as the uploaded card it replaces was: the colours are
 * the `--color-art-*` tokens, which the dark theme does not redefine.
 *
 * SVG ids come from `useId()`: a page draws dozens of these, and a shared id
 * would make every card paint with the first card's gradient.
 *
 * DECORATIVE TO A SCREEN READER: the tile's label under the card says the name
 * in full, so the whole card is `aria-hidden` rather than read twice.
 */
const TEAR =
  "M0 351 L20 334 L24 334 L32 343 L48 355 L64 357 L65 372 L68 372 L80 381 L108 373 L120 360 L136 363 L148 372 L152 373 L168 369 L176 368 L180 369 L200 384 L208 383 L224 377 L240 412 L244 416 L260 424 L272 415 L276 409 L288 382 L292 378 L312 384 L316 383 L336 368 L364 373 L384 359 L392 357 L404 371 L420 377 L436 381 L448 371 L449 357 L464 356 L468 354 L480 345 L492 332 L512 351 L512 576 L0 576 Z";

const DOT_ROWS = [128, 138.2, 148.1, 275.5, 285.5, 295.5];
const DOT_COLUMNS = [4.2, 13.2, 58.5, 67.5, 76.5, 434.5, 443.5, 452.5, 497.8, 506.8];

export function CategoryArt({
  logo,
  name,
  sizes = "(min-width: 1024px) 183px, 66px",
  lcp = false,
}: {
  logo: { url: string } | null;
  /** The name drawn in the panel — the app's own name (`artName`), not the tile label. */
  name: string;
  sizes?: string;
  /** The page's LCP image: preloaded at high priority. One card per page, at most. */
  lcp?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  // Cairo Bold, 700 (owner 2026-11-04), sized and narrowed to the hand-made
  // name's box. «نيتا شات» (8) is the measured size: 57% of the card's width. A longer
  // name steps down rather than being clamped or broken inside a word, and
  // the longest real names land on two lines. A Latin letter (Poppins) is
  // about 1.4 Arabic ones wide, so it counts for more.
  const length = [...name].reduce((sum, letter) => sum + (/[A-Za-z0-9]/.test(letter) ? 1.4 : 1), 0);
  const size =
    length <= 12 ? "text-[15.9cqw]" : length <= 15 ? "text-[12.6cqw]" : length <= 20 ? "text-[10.4cqw]" : length <= 28 ? "text-[8.8cqw]" : "text-[7.2cqw]";

  return (
    <span aria-hidden className="@container relative block aspect-[512/576] w-full">
      <svg viewBox="0 0 512 576" className="absolute inset-0 size-full">
        <defs>
          <clipPath id={`${id}-frame`}>
            <rect x="0" y="66" width="512" height="510" rx="92" />
          </clipPath>
          {/* The panel's shading runs at 45° (constant along x − y). */}
          <linearGradient id={`${id}-silver`} gradientUnits="userSpaceOnUse" x1="0" y1="576" x2="394" y2="182">
            <stop offset="0" style={{ stopColor: "var(--color-art-silver-1)" }} />
            <stop offset="0.414" style={{ stopColor: "var(--color-art-silver-2)" }} />
            <stop offset="0.477" style={{ stopColor: "var(--color-art-silver-3)" }} />
            <stop offset="0.604" style={{ stopColor: "var(--color-art-silver-4)" }} />
            <stop offset="0.731" style={{ stopColor: "var(--color-art-silver-5)" }} />
            <stop offset="0.858" style={{ stopColor: "var(--color-art-silver-6)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-art-silver-7)" }} />
          </linearGradient>
          {/* The torn band: translucent, lighter towards the bottom of the V. */}
          <linearGradient id={`${id}-band`} gradientUnits="userSpaceOnUse" x1="0" y1="340" x2="0" y2="445">
            <stop offset="0" style={{ stopColor: "var(--color-art-band-top)" }} />
            <stop offset="1" style={{ stopColor: "var(--color-art-band-bottom)" }} />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${id}-frame)`}>
          <rect x="0" y="66" width="512" height="510" style={{ fill: "var(--color-art-frame)" }} />
          <g style={{ fill: "var(--color-art-stripe)" }}>
            <rect x="27" y="66" width="6" height="510" />
            <rect x="41" y="66" width="6" height="510" />
            <rect x="466" y="66" width="6" height="510" />
            <rect x="480" y="66" width="6" height="510" />
            {DOT_ROWS.flatMap((cy) => DOT_COLUMNS.map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.4" />))}
          </g>
          <path d={TEAR} fill={`url(#${id}-band)`} fillOpacity="0.46" />
          <path d={TEAR} transform="translate(0 22)" fill={`url(#${id}-silver)`} />
        </g>
      </svg>

      {/* The logo: 366 of 512 wide, at x 73, from the top edge. */}
      <span className="absolute start-[14.26%] top-0 aspect-square w-[71.48%] overflow-hidden rounded-[24.6%]">
        {logo ? <Image src={logo.url} alt="" fill sizes={sizes} className="object-cover" {...(lcp ? LCP_IMAGE : {})} /> : null}
      </span>

      {/* The name, centred where the hand-made card centres it. */}
      <span
        className={`absolute inset-x-[6%] top-[77.4%] flex h-[19.1%] items-center justify-center text-center font-bold leading-none text-balance text-[var(--color-art-name)] [overflow-wrap:normal] ${size}`}
      >
        <span className="inline-block scale-x-[0.985] text-balance">{name}</span>
      </span>
    </span>
  );
}
