import Image from "next/image";

import { ArtworkFill } from "@/components/catalog/ArtworkFill";

import { NumberedSteps } from "@/components/catalog/ProductPurchase";
import { FaqList } from "@/components/content/FaqList";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { LCP_IMAGE } from "@/lib/brand/image-priority";
import type { Artwork } from "@/lib/catalog/product-artwork";
import { descriptionBlocks } from "@/lib/catalog/description";
import type { GameContent } from "@/lib/catalog/game-content";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * THE PURCHASE PAGE — «Product Page Mobile» (2026-09-30) over the Figma
 * structure (`6847:97051` / `6883:31202`), drawn for two routes that sell the
 * same way:
 *
 *   - `/products/[slug]` — one product, its tiers as tiles;
 *   - `/categories/…/[leaf]` — a leaf holding SEVERAL products, every option
 *     of every product as tiles on one page (`lib/catalog/options.ts`).
 *
 * The phone, top to bottom: the artwork (230 tall, 20 corners) with the
 * delivery pill, share and the heart on it; the title line; region, package
 * and the player id; the usage / reviews card; «قد ينال إعجابك أيضاً»; and the
 * buy bar fixed at the bottom in the tab bar's place (fixed on the desktop too). From `lg` the buyable
 * column sits at the START edge and the artwork with the card under it at the
 * end. DOM order is phone order.
 *
 * SHARED BY EVERY VISITOR (ADR 0046 §2): this layout draws no price and reads
 * no cookie. Everything priced or personal — the purchase form, the basket,
 * Apple Pay, the structured data — arrives as `purchaseSlot`, the page's
 * `PurchasePanel` already wrapped in its Suspense boundary.
 */
/** Each panel shows while its tab's radio is checked — literal classes, so Tailwind sees them. */
const PANEL = {
  details: "group-has-[#product-tab-details:checked]/tabs:block",
  usage: "group-has-[#product-tab-usage:checked]/tabs:flex",
  terms: "group-has-[#product-tab-terms:checked]/tabs:flex",
  faqs: "group-has-[#product-tab-faqs:checked]/tabs:block",
  reviews: "group-has-[#product-tab-reviews:checked]/tabs:block",
} as const;

export function PurchasePage({
  locale,
  title,
  image,
  icons,
  purchaseSlot,
  game,
  description,
  instructions,
  recommendations,
  reviews,
}: {
  locale: Locale;
  title: string;
  image: Artwork | null;
  /** Share (and the heart, on a product), on the artwork's scrim. */
  icons: (onArtwork: boolean) => React.ReactNode;
  /**
   * Everything buyable — the page's `PurchasePanel`, already wrapped in its
   * Suspense boundary, its fallback reserving the panel's room.
   */
  purchaseSlot: React.ReactNode;
  /** The sub category's game content — the delivery pill and the tabs. */
  game: GameContent;
  description: string | null | undefined;
  instructions: readonly { url: string; alt: Record<string, string> }[];
  /** «قد ينال إعجابك أيضاً», already wrapped in its Suspense boundary. */
  recommendations?: React.ReactNode;
  /** «تقييمات» (v0.1.57), already wrapped in its Suspense boundary. */
  reviews?: React.ReactNode;
}) {
  const m = messagesFor(locale);
  const name = title;

  // The usage tab: the game's own steps when staff wrote them (v0.1.62), else
  // the product's description — numbered when it reads as steps — and the
  // product's instruction screenshots.
  const described = description ? steps(description) : null;
  // A brand with its own steps keeps its description on a «التفاصيل» tab of its
  // own (owner, 2026-10-07): it used to vanish whenever it read like steps,
  // while the structured data still claimed it — text the page did not show.
  const detailsTab = game.usageSteps.length > 0 && Boolean(description);
  const hasUsageCard = game.usageSteps.length > 0 || (Boolean(description) && !detailsTab) || instructions.length > 0;
  const usageLabel = m.product.usageDetails;
  // `short` is the tab's label at EVERY width: five full labels fit neither a
  // 360px phone nor the desktop's 488px column under the artwork, and a row
  // that scrolled hid its last tabs behind the edge («الأ…», 2026-10-10). The
  // full label stays the heading when there is only one tab.
  const tabs = [
    detailsTab ? { key: "details", label: m.product.detailsTab, short: m.product.detailsTab } : null,
    hasUsageCard ? { key: "usage", label: usageLabel, short: m.product.usageTabShort } : null,
    game.terms.length > 0 ? { key: "terms", label: m.product.termsTab, short: m.product.termsTabShort } : null,
    game.faqs.length > 0 ? { key: "faqs", label: m.product.faqsTab, short: m.product.faqsTabShort } : null,
    reviews ? { key: "reviews", label: m.product.reviewsTab, short: m.product.reviewsTab } : null,
  ].filter((tab): tab is { key: string; label: string; short: string } => tab !== null);

  // NO BOTTOM PADDING FOR THE BUY BAR on `main`: the clearance sits under the
  // footer (the layout's spacer, sized to the bar in globals.css), so the page
  // reads content → footer with no empty band between them.
  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-5 pt-1 lg:px-6 lg:pb-12 lg:pt-[70px]">
      {/* `auto 1fr` ROWS FROM `lg`: the buyable column spans both rows, and a
          long tier list used to share its height across them — the artwork's
          row grew with it and left a tall empty band above the usage card.
          A spanning item's extra height goes to the flexible track, so the
          artwork's row stays its own height and the card follows it.
          ON THE PHONE, ONE `minmax(0,1fr)` COLUMN (2026-10-03): with no column
          given, the implicit track sized itself to its widest item's content,
          and a row that scrolls sideways — the region chips — is that wide.
          The whole page grew to ~630px on a 375px phone and slid sideways. */}
      <div className="relative grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[474px_488px] lg:grid-rows-[auto_1fr] lg:items-start lg:justify-between lg:gap-x-0 lg:gap-y-6">
        {/* ── The artwork ── 230 tall on the phone (20 corners), 488×464 on
            the desktop (24). A dark fade at the top carries the delivery pill
            at the start and share and the heart at the end. */}
        <div className="lg:col-start-2 lg:row-start-1">
          {/* The picture alone, on no plate (owner 2026-10-26); the grey only behind the placeholder. */}
          <div className={`relative h-[230px] overflow-hidden rounded-[20px] ${image ? "" : "bg-[var(--color-surface-muted)]"} lg:aspect-[488/464] lg:h-auto lg:rounded-[24px]`}>
            {image?.drawn ? (
              <>
                {/* A live app's drawn card (owner 2026-11-04) on its own logo,
                    blurred — the card is taller than the hero is wide-short. */}
                <Image src={image.drawn.logo} alt="" aria-hidden fill sizes="(max-width: 1024px) 100vw, 488px" className="scale-[1.5] object-cover blur-[26px] saturate-[1.4]" />
                <span className="absolute inset-x-0 bottom-3 top-12 lg:bottom-8 lg:top-[100px]">
                  <ArtworkFill art={image} alt={image.alt || name} sizes="(max-width: 1024px) 160px, 300px" lcp />
                </span>
              </>
            ) : image ? (
              <Image src={image.url} alt={image.alt || name} fill sizes="(max-width: 1024px) 100vw, 488px" className="object-cover" {...LCP_IMAGE} />
            ) : (
              <ArtworkPlaceholder name={name} />
            )}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent lg:h-[134px]" />
            {game.deliveryMethod ? (
              <span className="absolute start-3 top-3 z-10 flex h-7 items-center gap-1.5 rounded-full bg-black/35 px-2.5 text-body-s font-bold text-white ring-1 ring-inset ring-white/50 backdrop-blur-md lg:start-5 lg:top-5 lg:h-8">
                <span aria-hidden className="block size-3.5 bg-current [mask-image:url(/brand/icon-info-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                {m.deliveryMethod[game.deliveryMethod]}
              </span>
            ) : null}
            {/* Each control on its own 34px translucent disc, as drawn. The pill
                and the controls sit above pack art (`z-10`), which the purchase
                form lays over this picture (owner 2026-10-13). */}
            <div className="absolute end-2.5 top-2.5 z-10 flex items-center gap-1.5 [&>*]:grid [&>*]:size-[34px] [&>*]:place-items-center [&>*]:rounded-full [&>*]:bg-black/35 lg:end-5 lg:top-5 lg:gap-3 lg:[&>*]:size-10">
              {icons(true)}
            </div>
          </div>
        </div>

        {/* ── Everything buyable ── */}
        {/* The title is SHARED (ADR 0046 §2): drawn with the page, before the
            purchase panel streams in. The column spaces it from the panel as
            the purchase form spaces its own rows (gap-5, gap-6 from `lg`);
            the form's facts row tucks itself back to 8px under it. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:gap-6">
          <h1 className="text-heading-m font-bold leading-[1.45] text-pretty text-[var(--color-ink)] lg:text-display lg:leading-[1.4]">{name}</h1>
          {purchaseSlot}
        </div>

        {/* ── Usage / terms / FAQs / reviews ── a segmented control over one
            card. The tabs are RADIOS and the panels follow them in CSS
            (`group-has`), so they switch with no script and keep whatever the
            purchase form holds; a link to `#reviews` opens that tab
            (OpenReviewsFromLink). Only tabs with something to say are drawn.
            NO COMP for the terms and FAQ tabs (2026-10-07): they are drawn as
            two more segments of the drawn control, the terms as a checked
            list and the FAQs with the /faq page's own list («FAQ Mobile»). */}
        {tabs.length > 0 ? (
          <section
            id="reviews"
            className="group/tabs flex scroll-mt-24 flex-col gap-3.5 rounded-[18px] bg-[var(--color-chip)] p-3.5 lg:col-start-2 lg:row-start-2 lg:p-5"
          >
            {tabs.length > 1 ? (
              // UNDERLINED TABS, EVERY ONE IN VIEW (owner, 2026-10-10): equal
              // shares of the width, the short labels, a brand bar
              // under the open one. The row still scrolls rather than clip if
              // a translation ever outgrows it. `relative`: each radio is
              // `sr-only` — absolutely placed — and an unpositioned scroller
              // does not clip it; the hidden radios widened the whole page in
              // Arabic at 360 (the region chips' 2026-10-03 bug).
              <div
                role="radiogroup"
                aria-label={m.product.infoTabs}
                className="relative -mx-3.5 -mt-3.5 flex overflow-x-auto border-b border-[var(--color-border-subtle)] px-1.5 [scrollbar-width:none] lg:-mx-5 lg:-mt-5 lg:px-3 [&::-webkit-scrollbar]:hidden"
              >
                {tabs.map((tab, index) => (
                  <label
                    key={tab.key}
                    className="relative flex h-12 min-w-fit flex-1 cursor-pointer items-center justify-center whitespace-nowrap px-2 text-caption font-semibold text-[var(--color-ink-muted)] transition after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-t-full after:bg-transparent after:transition hover:text-[var(--color-ink)] has-[:checked]:font-bold has-[:checked]:text-[var(--color-brand-500)] has-[:checked]:after:bg-[var(--color-brand-500)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[var(--color-brand-500)] lg:h-14 lg:px-4 lg:text-body-m"
                  >
                    <input id={`product-tab-${tab.key}`} type="radio" name="product-tab" value={tab.key} defaultChecked={index === 0} className="sr-only" />
                    {tab.short}
                  </label>
                ))}
              </div>
            ) : (
              <h2 className="text-body-m font-bold text-[var(--color-ink)] lg:text-heading-m">{tabs[0]!.label}</h2>
            )}

            {detailsTab && description ? (
              <div className={tabs.length > 1 ? `hidden ${PANEL.details}` : ""}>
                <DescriptionBody description={description} />
              </div>
            ) : null}

            {hasUsageCard ? (
              <div className={tabs.length > 1 ? `hidden flex-col gap-4 ${PANEL.usage}` : "flex flex-col gap-4"}>
                {game.usageSteps.length > 0 ? <NumberedSteps steps={game.usageSteps} /> : null}
                {/* The product's own text: numbered when it reads as steps
                    (JoyGames wrote most descriptions one step per line), a
                    paragraph otherwise — and never repeated under the game's
                    own steps as a second list. */}
                {description && !detailsTab ? (
                  described ? (
                    <NumberedSteps steps={described} />
                  ) : (
                    <DescriptionBody description={description} />
                  )
                ) : null}
                {instructions.length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {instructions.map((item) => (
                      <li key={item.url} className="relative aspect-video overflow-hidden rounded-[12px]">
                        <Image src={item.url} alt={item.alt[locale] || ""} fill sizes="(max-width: 1024px) 100vw, 456px" className="object-contain" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {game.terms.length > 0 ? (
              <ul className={tabs.length > 1 ? `hidden flex-col gap-3 ${PANEL.terms}` : "flex flex-col gap-3"}>
                {game.terms.map((term, index) => (
                  <li key={index} className="flex items-start gap-2.5">
                    <span className="mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full bg-[var(--color-brand-50)]">
                      <span aria-hidden className="block size-2.5 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-check.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                    </span>
                    <span className="text-body-s font-medium leading-[1.7] text-[var(--color-ink-muted)] lg:text-body-l">{term}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {game.faqs.length > 0 ? (
              <div className={tabs.length > 1 ? `hidden ${PANEL.faqs}` : ""}>
                <FaqList
                  entries={game.faqs.map((faq, index) => ({ id: `faq-${index}`, ...faq }))}
                  labels={{ search: m.faq.search, noMatch: m.faq.noMatch }}
                  searchable={false}
                />
              </div>
            ) : null}

            {reviews ? <div className={tabs.length > 1 ? `hidden ${PANEL.reviews}` : ""}>{reviews}</div> : null}
          </section>
        ) : null}
      </div>

      {/* ── «قد ينال إعجابك أيضاً» ── streamed in by the page, so the
          purchase above never waits on it. */}
      {recommendations}
    </main>
  );
}

/**
 * A description as the blocks it is written in (`lib/catalog/description.ts`):
 * the opening paragraph in ink as its lead, the rest muted, bullets on brand
 * dots and steps numbered like the usage steps.
 */
function DescriptionBody({ description }: { description: string }) {
  const blocks = descriptionBlocks(description);
  const body = "text-body-s font-medium leading-[1.8] lg:text-body-l";

  return (
    <div className="flex flex-col gap-3.5">
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p
            key={index}
            className={`whitespace-pre-line ${body} ${index === 0 ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}
          >
            {block.text}
          </p>
        ) : block.kind === "steps" ? (
          <NumberedSteps key={index} steps={block.items} />
        ) : (
          <ul key={index} className="flex flex-col gap-2">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className={`flex items-start gap-2.5 text-[var(--color-ink-muted)] ${body}`}>
                <span aria-hidden className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/**
 * The description as numbered steps when that is what it is: at least three
 * lines, none of them a paragraph. Null otherwise.
 */
function steps(description: string): string[] | null {
  const lines = description
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)-]|[-•])\s*/, "").trim())
    .filter((line) => line !== "");

  if (lines.length < 3 || lines.some((line) => line.length > 160)) return null;

  return lines;
}
