"use client";

import Image from "next/image";

import { ArtworkFill } from "@/components/catalog/ArtworkFill";
import { SavingsBadge } from "@/components/catalog/SavingsBadge";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import type { GameContent } from "@/lib/catalog/game-content";
import type { PurchaseOption } from "@/lib/catalog/options";
import type { Artwork } from "@/lib/catalog/product-artwork";
import { currencyIcon } from "@/lib/catalog/currency-icon";
import { fullLabel, packHeadline, packLine, packMeter } from "@/lib/catalog/pack-art";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The chosen package drawn over the product page's picture (owner 2026-10-13;
 * spec 2026-10-13-pack-art-hero, canvas board «المقترح»): the product's art
 * blurred behind, a crisp copy as an icon, the amount and its unit, a size
 * meter, the saving, and «وش تحصل» on a strip with the ChargerQuick mark.
 *
 * WHERE IT SITS. The picture is drawn by the server (`PurchasePage`) and the
 * choice lives in this client form, so — like the «وفر» badge before it — the
 * layer is placed against `PurchasePage`'s `relative` grid, whose first thing
 * is the 230px-tall picture on the phone. The delivery pill, share and heart
 * stay above it (`z-10` there). On the desktop (owner 2026-10-13, spec §6) the
 * layer covers the 488×464 picture column at the grid's end edge, and its
 * parts stack centred: icon, amount, unit, meter, saving, then the strip.
 *
 * Nothing here is computed from prices beyond their order (the meter); the
 * saving is the server's `savings_pct`, as everywhere.
 */
export function PackArt({
  locale,
  image,
  option,
  shown,
  game,
  name,
}: {
  locale: Locale;
  /** The page's own picture — the same one `PurchasePage` draws (`productArtwork`). */
  image: Artwork | null;
  option: PurchaseOption;
  /** The packages on screen now (after the region filter) — the meter ranks among these. */
  shown: readonly PurchaseOption[];
  game: GameContent;
  /** The page title, for the no-picture placeholder's initial. */
  name: string;
}) {
  const m = messagesFor(locale);
  // The whole name, never a short one or a cut one (owner, 2026-11-04).
  const { headline, numeric, unit } = packHeadline(fullLabel(option, locale));
  const meter = packMeter(option, shown, numeric);
  const icon = currencyIcon(option.currencyArt, game.currencyIcon);
  const line = packLine(option, game, locale);
  // A name that is not a number steps down as it grows, so the whole of it
  // fits the 230px frame instead of ending in «…». The longest live name
  // (69 characters) fits whole; four lines is only a guard against a far
  // longer one pushing into the bottom strip — the tile still shows it all.
  const size = !numeric
    ? headline.length > 56
      ? "text-[16px] leading-[1.2] lg:text-[22px]"
      : headline.length > 32
      ? "text-[18px] leading-[1.2] lg:text-[24px]"
      : headline.length > 16
        ? "text-[20px] leading-[1.18] lg:text-[26px]"
        : "text-[24px] leading-[1.15] lg:text-[30px]"
    : headline.length > 7
      ? "text-[30px] leading-[1.05] lg:text-[36px]"
      : "text-[38px] leading-[1.05] lg:text-[52px]";

  return (
    <div
      data-testid="pack-art"
      className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[230px] overflow-hidden rounded-[20px] bg-[var(--color-brand-700)] lg:start-auto lg:end-0 lg:h-auto lg:w-[488px] lg:aspect-[488/464] lg:rounded-[24px]"
    >
      {image ? (
        <Image src={image.drawn?.logo ?? image.url} alt="" aria-hidden fill sizes="(min-width: 1024px) 488px, 100vw" className="scale-[1.6] object-cover blur-[26px] saturate-[1.6]" />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,var(--color-brand-300),var(--color-brand-500)_55%,var(--color-brand-700))]" />
      )}
      {/* Darkest behind the amount — the start side on the phone, the lower
          half on the desktop — so white text keeps its contrast. */}
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(14,10,30,0.3),rgba(14,10,30,0.55)_45%,rgba(14,10,30,0.82))] max-lg:hidden"
      />
      <span
        aria-hidden
        className="absolute inset-0 lg:hidden bg-[linear-gradient(to_right,rgba(14,10,30,0.8),rgba(14,10,30,0.55)_55%,rgba(14,10,30,0.3))] rtl:bg-[linear-gradient(to_left,rgba(14,10,30,0.8),rgba(14,10,30,0.55)_55%,rgba(14,10,30,0.3))]"
      />
      {/* THE ART ITSELF, NO PLATE (owner 2026-10-26). The product pictures
          are 3D renders, often on a transparent ground: a grey tile, a
          rounded clip and a box shadow behind them drew a flat square around
          the depth they already have. The picture shows whole
          (`object-contain`); only the no-picture placeholder keeps its tile. */}
      <span
        aria-hidden
        className={`absolute end-4 top-14 size-[110px] lg:start-0 lg:end-0 lg:top-[72px] lg:mx-auto lg:size-[168px] ${
          image ? "" : "overflow-hidden rounded-[24px] bg-[var(--color-surface-muted)] lg:rounded-[32px]"
        }`}
      >
        {/* A live app's drawn card stands in the icon's square (owner 2026-11-04). */}
        {image?.drawn ? (
          <ArtworkFill art={image} alt="" sizes="(min-width: 1024px) 168px, 110px" />
        ) : image ? (
          <Image src={image.url} alt="" fill sizes="(min-width: 1024px) 168px, 110px" className="object-contain" />
        ) : (
          <ArtworkPlaceholder name={name} />
        )}
      </span>

      <div key={option.key} className="cq-fade-in absolute start-4 top-[54px] flex w-[180px] flex-col items-start gap-0.5 text-white lg:start-6 lg:end-6 lg:top-[252px] lg:w-auto lg:items-center lg:text-center">
        {/* The amount with what it buys — the game's own currency picture
            for this pack, else its category's icon (owner, 2026-11-05). */}
        <span className="flex items-center gap-2 lg:gap-2.5">
          {icon ? (
            <Image src={icon} alt="" aria-hidden width={56} height={56} unoptimized className="size-11 shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] lg:size-14" />
          ) : null}
          <span dir={numeric ? "ltr" : undefined} className={`${size} ${numeric ? "line-clamp-2" : "line-clamp-4 [overflow-wrap:anywhere]"} font-extrabold [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]`}>
            {headline}
          </span>
        </span>
        {/* Two lines at most: a long name's tail («شدة ببجي موبايل …») must
            never push the meter and the saving into the strip of this fixed
            230px frame. */}
        {unit ? <span className="line-clamp-2 text-body-m font-semibold leading-[1.25] lg:text-[18px]">{unit}</span> : null}
        {meter ? (
          <span role="img" aria-label={m.product.packSize} className="mt-1.5 flex gap-1 lg:mt-2 lg:gap-1.5">
            {[1, 2, 3, 4].map((bar) => (
              <span key={bar} className={`h-[5px] w-[18px] rounded-[3px] lg:h-[6px] lg:w-[24px] ${bar <= meter ? "bg-[var(--color-secondary)]" : "bg-white/30"}`} />
            ))}
          </span>
        ) : null}
        {option.savings_pct ? (
          <SavingsBadge
            pct={option.savings_pct}
            label={m.product.save.replace("{pct}", String(option.savings_pct))}
            className="mt-2.5 rounded-[8px] bg-[var(--color-surface)] px-2.5 text-body-s font-bold lg:mt-3 lg:text-body-l"
          />
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[38px] items-center justify-between gap-3 bg-black/40 px-3.5 text-white lg:h-[52px] lg:px-5">
        <span key={option.key} className="cq-fade-in truncate text-caption font-medium lg:text-body-s">
          {line}
        </span>
        {/* The one-colour white logo: the brand guide never puts the colour
            version on a dark ground. */}
        <Image src="/brand/logo-chargerquick-stacked-white.svg" alt="" aria-hidden width={24} height={28} unoptimized className="h-7 w-auto shrink-0 opacity-90 lg:h-9" />
      </div>
    </div>
  );
}
