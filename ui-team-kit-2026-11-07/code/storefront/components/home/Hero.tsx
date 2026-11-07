import Image from "next/image";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The hero (Figma 6728:15731).
 *
 * The comp's thesis is a single claim set against one wide gradient plate:
 * "fast top-ups, unmatched entertainment — with ChargerQuick", with the brand
 * name lifted into brand blue mid-sentence, and a thin rule running out of the
 * headline toward the plate. No stat tiles, no badges, nothing else competing.
 *
 * The plate is the exported vector, not a CSS gradient. Its shape is a
 * rounded slab with one clipped corner and an internal light sweep; a
 * hand-written `linear-gradient` would be a near miss at every viewport, and
 * the whole reason to export is that a near miss is what makes a build look
 * "close to the design" rather than like it.
 *
 * `-scale-x-100` in the Figma output is how the comp mirrors the plate for
 * RTL. That is not reproduced with a transform here: `dir` on <html> already
 * orders the two columns, and flipping the artwork as well would mirror it
 * twice and put the clipped corner on the wrong side in English.
 *
 * SHOWN ONLY WHEN THERE ARE NO SLIDES: the banner slider takes the top of the
 * home page whenever the admin has switched one on. Desktop only — on a phone
 * the search box leads the page.
 */
export function Hero({ locale, lcp = false }: { locale: Locale; lcp?: boolean }) {
  const m = messagesFor(locale);

  return (
    // 82px under the rail on desktop, as drawn (rail ends at 232, hero at 314).
    <section className="mx-auto w-full max-w-[1248px] px-6 lg:mt-[82px]" aria-labelledby="hero-heading">
      {/* The two blocks OVERLAP, as drawn: the plate runs 0→902 and the text
          block 840→1200 of the comp's 1200, so the copy sits over the plate's
          near edge rather than beside it. Laid out as flex columns they would
          separate and the composition would read as two boxes. */}
      {/* THE DESKTOP COMPOSITION — `6728:15731`, measured on the rendered
          comp rather than read off the export's double mirroring:

          - the PLATE is 977×363 and starts 10px OUTSIDE the 1200 column, on
            the side away from the copy, with its notches facing the copy;
          - the COPY is a 360px block at the column's start edge, centred.

          The plate is the shape's own brand gradient. Published promos are
          the banner slider now, which takes this section's place whenever
          the admin has switched a slide on (`app/[locale]/page.tsx`). */}
      {/* ONE COMPOSITION THAT SCALES AS A UNIT (owner, 2026-10-08). The plate
          is a percentage of the column but the copy was fixed px, so below
          the comp's 1200 (iPad landscape, 1024–1247) the copy ran over the
          plate's notches. The frame keeps the comp's 1200×363 ratio and
          every measure of the copy is in container units — `cqw`, a
          hundredth of the frame's width — so at 1200 each one is exactly
          the comp's px (32px = 2.667cqw) and below it all shrink together. */}
      <div className="@container relative hidden lg:block lg:aspect-[1200/363]">
        <div className="absolute inset-y-0 -end-[0.83%] w-[81.42%]">
          <Image
            src="/brand/hero-shape.svg"
            alt=""
            fill
            // A lazy image under `display:none` is never fetched on a phone; on
            // desktop it loads at high priority once laid out. No preload: a
            // preload ignores `display:none` (plan F10).
            {...(lcp ? { fetchPriority: "high" as const } : {})}
            aria-hidden
            className="object-fill rtl:-scale-x-100"
          />
        </div>

        {/* At 93px from the top, as placed (`6728:15732`), not centred: the
            block's own lines overflow its 179px frame by design, and centring
            the overflowing box would lift it 4px off the comp. */}
        <div className="pointer-events-none absolute start-0 top-[7.75cqw] flex w-[30cqw] flex-col">
          {/* English is set a size down (27px at 1200): its middle line
              («entertainment, with») is longer than the Arabic one the plate's
              notch was cut for, and ran into the plate at every width. */}
          {/* Cairo SemiBold 32 at Figma's "normal" line height, which for Cairo
              is 57.5px — two lines in 115px. A browser's own `normal` for the
              same font computes 48px, so the value is pinned. 374px wide, 14px
              wider than the block as drawn, so the line breaks where the
              comp breaks it. */}
          <h1
            id="hero-heading"
            className="w-[31.17cqw] text-[2.667cqw] font-semibold leading-[4.79cqw] text-[var(--color-ink)] ltr:text-[2.25cqw]"
          >
            {m.home.heroLead}
            <span className="text-[var(--color-brand-500)]"> {m.common.storeName}</span>
          </h1>
          {/* The rule the comp runs out of the headline toward the plate:
              177×2, Theme/text-primary, round caps, 13px under the headline
              and flush with the block's start edge. Decorative. */}
          <div aria-hidden className="mt-[1.083cqw] h-[2px] w-[14.75cqw] rounded-full bg-[var(--color-ink)]" />
          {/* English again a size down, on one line: its headline takes three
              lines where the Arabic takes two, which leaves the sub-line the
              last notch only. */}
          <p className="mt-[1.583cqw] w-[27.83cqw] text-[2.333cqw] leading-[1.25] text-[var(--color-ink-subtle)] ltr:w-auto ltr:whitespace-nowrap ltr:text-[1.3cqw]">
            {m.home.heroSub}
          </p>
        </div>
      </div>
    </section>
  );
}
