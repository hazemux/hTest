"use client";

import { AnimatePresence } from "motion/react";
import * as mo from "motion/react-m";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import Image from "next/image";
import { Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { CustomFields, type CategoryField } from "@/components/checkout/CustomFields";
import type { SavedEntry } from "@/lib/account/saved-fields";
import { savableFields as accountFieldsOf } from "@/lib/account/saved-accounts";
import { displayFieldValue } from "@/lib/fields/options";
import { rememberAddedItem } from "@/lib/analytics/added-item";
import { CLARITY_MASK } from "@/lib/analytics/clarity";
import { purchaseOptionItem } from "@/lib/analytics/items";
import { addToCart, buyNow } from "@/lib/cart/actions";
import { requestStockAlertAction } from "@/lib/stock-alerts/actions";
import type { GameContent } from "@/lib/catalog/game-content";
import { chosenOptionPrice } from "@/lib/catalog/option-price";
import { optionsOnScreen, type PurchaseOption } from "@/lib/catalog/options";
import { currencyIcon } from "@/lib/catalog/currency-icon";
import { fullLabel, isLongPack } from "@/lib/catalog/pack-art";
import { regionFlag } from "@/lib/catalog/region-flag";
import { submittableValues, type FieldValues } from "@/lib/fields/visible-when";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { agreePointsUnits } from "@/lib/i18n/points-plural";
import { EarnBadge } from "@/components/loyalty/EarnBadge";
import { earnWith } from "@/lib/loyalty/map";
import { Coin } from "@/components/loyalty/parts";
import { BuyGuide } from "@/components/catalog/BuyGuide";

import { ExpressSlot, type ExpressApplePayOffer } from "@/components/catalog/ExpressApplePay";
import { ExpressGoogleSlot, type ExpressGooglePayOffer } from "@/components/catalog/ExpressGooglePay";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { AutoHeight } from "@/components/ui/motion/AutoHeight";
import { useLeaving } from "@/components/ui/motion/Leaving";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { useMotionTransition } from "@/lib/motion/useMotionTransition";
import { tierInCountry } from "@/lib/catalog/pack-link";
import { isResidenceCountry } from "@/lib/currency/countries";
import { visitorCountryInBrowser } from "@/lib/edge/visitor-country";

import { PackArt } from "./PackArt";
import { SavingsBadge } from "./SavingsBadge";
import { ReturnPathInput } from "@/components/ui/ReturnPathInput";
import { ArtworkFill } from "@/components/catalog/ArtworkFill";
import type { Artwork } from "@/lib/catalog/product-artwork";

/**
 * Everything a customer decides on the product page — «Product Page Mobile»
 * (2026-09-30): the rating, delivery line and «few left» under the title (the
 * title itself is the shared page's `<h1>`, `PurchasePage`); the region
 * chips; the package TILES, each with its own price; the category's
 * fields with «أين أجده؟» and the saved IDs; and the BUY BAR, fixed at the
 * bottom of the phone (it takes the tab bar's place on this page) with the
 * live price, the struck regular price, the points and both buttons.
 *
 * ONE FORM, TWO SUBMIT BUTTONS. «شراء سريع» and «أضف للسلة» post the SAME
 * inputs to two Server Actions, chosen by `formAction` on the button — plain
 * HTML that needs no JavaScript. The buy bar is inside this form for exactly
 * that reason: fixed on screen, but still part of what posts.
 *
 * WHY THE DENOMINATION IS A RADIO AND NOT A LINK. A `?pack=` link per
 * tile would wipe the player id already typed. Radios keep the selection and
 * the id in one form, and `has-[:checked]` styles the chosen tile in CSS — so
 * the selection is visible, and submits correctly, before any JavaScript
 * runs. Hydration adds the buy bar's figures following the selection.
 *
 * MOTION (HANDBOOK «Motion»). The chosen tile and chip are drawn by CSS from
 * their radios, as before; what moves is added on top and never decides
 * anything. A tick badge pops onto the chosen tile so the choice is not told
 * by colour alone; a region change swaps the package grid AT ONCE (its radios
 * are what the form posts — an exiting grid would still be in the form) and
 * only the incoming grid fades in; the bar's price rises when it changes; the
 * points pill and «وفر» ease open and shut. None of it plays on first render:
 * the server's HTML is the final state.
 *
 * NO ARITHMETIC ANYWHERE IN HERE. A tile's price, its saving, its tag, «few
 * left» and the points are each the server's own figure for that tier; the
 * page picks one, it never scales, compares or converts (HANDBOOK §1).
 */

export interface RegionView {
  code: string;
  name: Record<string, string>;
}

export interface ProductPurchaseProps {
  locale: Locale;
  /** The product posted when an option carries no slug of its own (never, today). */
  slug: string;
  /**
   * The page's title — the buy bar's name and the placeholder artwork's. The
   * `<h1>` is the shared page's (`PurchasePage`, ADR 0046 §2), drawn before
   * this form streams in.
   */
  title: string;
  /** The page's artwork, repeated small in the buy bar beside the name. */
  image?: Artwork | null;
  /**
   * Pack art (owner 2026-10-13, `PACK_ART_ENABLED`): the picture follows the
   * chosen package, long names get a short tile name and an ⓘ. Off draws the
   * page exactly as before.
   */
  packArt?: boolean;
  /** The page's own picture (`productArtwork`) — what pack art draws the package over. */
  heroImage?: Artwork | null;
  /**
   * The basket beside «أضف للسلة» — the page's `BuyBarCartLink`, its own
   * streamed boundary, because its count is the visitor's cart cookie
   * (ADR 0046 §2). Drawn by the server and handed in, never counted here.
   */
  basket?: React.ReactNode;
  /**
   * Apple Pay in «شراء سريع»'s place, when the gateway offers it to this
   * signed-in customer — a PROMISE the server never waits for, so the packs
   * stream without it; drawn in its own Suspense (`ExpressSlot`) whose
   * fallback is the ordinary «شراء سريع». Null for a guest.
   */
  express?: Promise<ExpressApplePayOffer | null> | null;
  /**
   * Google Pay in the same place (owner, 2026-10-14), on the same terms — a
   * promise, its own Suspense — drawn only where Apple Pay is not: it is
   * Apple Pay's fallback, and «شراء سريع» is its own. Null for a guest.
   */
  expressGoogle?: Promise<ExpressGooglePayOffer | null> | null;
  /** Approved reviews (v0.1.57); the rating links to the reviews tab. */
  rating?: { average: string | null; count: number } | null;
  /** The sub category's game content (v0.1.62) — the help sheet, the tile icon, the delivery line. */
  game: GameContent;
  /**
   * Everything buyable on this page (`lib/catalog/options.ts`): one product's
   * tiers on a product page, or every product of a leaf category — each
   * option names its own product, so one form can offer several.
   */
  options: PurchaseOption[];
  /**
   * Which option is selected on first paint — from `?pack=` on a
   * product page or `?option=` on a category's, so a shared link opens on
   * what it names; else the first.
   */
  initialKey: string | null;
  /** The CATEGORY's custom fields (spec §4.1) — the «رقم الايدي» box and friends. */
  fields: CategoryField[];
  /**
   * A live campaign's multiplier on EVERYTHING (ADR 0043 §9), from the cached
   * programme — the earn badge's «2×». Never personal: this page is
   * catalogue-cached, so the badge is the entry level's estimate.
   */
  campaignMultiplier?: string | null;
  /** Which region's chips to open on, from `?region=`; ignored without regional pricing. */
  initialRegion: string | null;
  /** Which query parameter keeps the URL honest: the product page's or the category's. */
  urlParam: "pack" | "option";
  /**
   * A SIGNED-IN customer's saved details for this category (`/me/saved-fields`,
   * several per field since v0.1.62) — the newest prefilled, every one a chip,
   * «احفظ معلوماتي» beneath. Absent for a guest, who has no account to save to.
   */
  saved?: { prefill: Record<string, string>; entries: SavedEntry[] };
  /**
   * The out-of-stock products — and single packs (v0.1.101) — here the
   * signed-in customer already waits for (`GET /me/stock-alerts`), by public
   * id — their button reads «تم تفعيل التنبيه».
   */
  waiting?: readonly string[];
  /**
   * A BASKET LINE BEING COMPLETED (`?line=`): checkout found its password no
   * longer held and sent the customer here, the one place details are typed.
   * Its fields are filled in, the form replaces that line (`completeLine`),
   * and one button saves and goes back to paying.
   */
  editing?: { lineId: string; values: Record<string, string> };
  /**
   * A SHARED COPY whose link names no tier (ADR 0052, D9): it opened on the
   * tier of its currency's country, so once hydrated it opens on the
   * visitor's own country's tier instead (`visitorCountryInBrowser`) — what
   * the server does for a page drawn for its visitor.
   */
  followVisitorCountry?: boolean;
}

export function ProductPurchase({
  locale,
  slug,
  title,
  image = null,
  packArt = false,
  heroImage = null,
  basket = null,
  express = null,
  expressGoogle = null,
  rating = null,
  game,
  options,
  initialKey,
  fields,
  initialRegion,
  urlParam,
  saved,
  waiting = [],
  editing,
  campaignMultiplier = null,
  followVisitorCountry = false,
}: ProductPurchaseProps) {
  const m = messagesFor(locale);
  const help = useRef<HTMLDialogElement>(null);
  const helpTitleId = useId();
  const savedTitleId = useId();
  const [helpField, setHelpField] = useState<string>("");

  const buyBar = useBuyBarClearance();
  const formRef = useRef<HTMLFormElement>(null);
  // What the express button has to say, drawn on its own line in the bar
  // (`BarNotice`) — set and cleared by `ExpressApplePay` / `ExpressGooglePay`.
  const [barNotice, setBarNotice] = useState<string | null>(null);
  // The express wallet's processing fee, as a sentence (`WalletFeeNote`) — set
  // and cleared by `ExpressApplePay` / `ExpressGooglePay` (owner, 2026-10-17).
  const [feeNote, setFeeNote] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  // Whether the customer has chosen anything yet — the tick badge pops only
  // for a choice, never on the first paint of the server's own selection.
  const [chose, setChose] = useState(false);
  // Whether the region has been changed: only then does the new grid fade in.
  const [changedRegion, setChangedRegion] = useState(false);
  // What the polite live region says after a region change — empty until then.
  const [announcement, setAnnouncement] = useState("");
  const [values, setValues] = useState<FieldValues>({ ...saved?.prefill, ...editing?.values });
  const [tappedAccount, setTappedAccount] = useState<string | null>(null);

  // Completing a line: straight to the first required box still empty — the
  // password, as a rule — so the customer does not hunt for what was asked.
  const editingLine = editing?.lineId;
  useEffect(() => {
    if (!editingLine) return;
    const empty = [...(formRef.current?.querySelectorAll<HTMLInputElement>("input[required]") ?? [])].find((input) => input.value === "");
    empty?.scrollIntoView({ block: "center" });
    empty?.focus({ preventScroll: true });
  }, [editingLine]);

  /*
   * THE REGION CHIPS ARE DERIVED, never configured — from the options, in
   * the API's order. A chip can never be tapped to find nothing behind it.
   * ONE REGION IS NO CHOICE: with one (or none) the row is not drawn.
   */
  const regions: RegionView[] = [];
  for (const line of options) {
    const own = line.region;
    if (own && !regions.some((r) => r.code === own.code)) regions.push(own);
  }
  const hasRegions = regions.length > 1;

  // COMPLETING A BASKET LINE, the line's region wins: the form replaces that
  // line with what it posts, and opening on the visitor's local region would
  // hide its pack and post that region's first tier in its place. Every other
  // visit opens on the region the page names (`optionsOnScreen`, its JSON-LD).
  const initialKeyRegion = options.find((o) => o.key === initialKey)?.region?.code ?? null;
  const [regionChoice, setRegion] = useState<string | null>(
    editing ? (initialKeyRegion ?? initialRegion) : (initialRegion ?? initialKeyRegion),
  );

  // THE VISITOR'S OWN COUNTRY'S TIER on a shared copy (D9): read from the
  // browser after hydration (null while the server's HTML is matched), and
  // only until the customer chooses — never over a basket line or a tier the
  // link named (the server says so with `followVisitorCountry`).
  const visitorCountry = useSyncExternalStore(neverChanges, visitorCountryInBrowser, noCountryOnServer);
  const visitorTier =
    followVisitorCountry && !editing && visitorCountry && isResidenceCountry(visitorCountry) ? tierInCountry(options, visitorCountry) : undefined;
  const followsVisitor = visitorTier !== undefined && !chose && !changedRegion;
  const openRegion = followsVisitor ? (visitorTier.region?.code ?? null) : regionChoice;
  // The page's structured data lists exactly these (`optionsOnScreen`, spec §3.5).
  const region = regions.some((r) => r.code === openRegion) ? openRegion : (regions[0]?.code ?? null);
  const shown = optionsOnScreen(options, { region: openRegion, key: null });

  /*
   * The selected option, but only if it is one ON SCREEN. Switching region
   * changes what exists; falling back to the first shown means the buy bar
   * never shows, and the form never posts, a choice the customer cannot see.
   */
  const selected = shown.find((o) => o.key === (followsVisitor ? visitorTier.key : selectedKey)) ?? shown[0] ?? null;

  function select(option: PurchaseOption) {
    setSelectedKey(option.key);
    setChose(true);
    // `?pack=<pack code>` with the tier's own `?region=` on a product page
    // (`lib/catalog/pack-link.ts`); the option key on a category's.
    if (urlParam === "option") writeUrl({ option: option.key });
    // A stale `?denomination=` from a link made before public ids is dropped,
    // so it never rides along into a shared link.
    else writeUrl({ pack: option.packParam, ...(option.region ? { region: option.region.code } : {}), denomination: null });
  }

  function selectRegion(code: string) {
    const first = options.find((o) => o.region?.code === code);
    setRegion(code);
    setSelectedKey(first?.key ?? null);
    setChose(true);
    setChangedRegion(true);
    // The package that is now selected is a consequence the customer did not
    // tap, so it is said aloud — with the region, so the same package name in
    // two regions still changes the text and is announced again.
    const chosen = regions.find((r) => r.code === code);
    const packageName = first ? (first.label[locale] ?? first.label.en ?? "") : "";
    if (chosen && packageName) {
      setAnnouncement(
        m.product.regionPackageChosen.replace("{region}", chosen.name[locale] ?? chosen.name.en ?? chosen.code).replace("{package}", packageName),
      );
    }
    writeUrl({ region: code, [urlParam]: null, ...(urlParam === "pack" ? { denomination: null } : {}) });
  }

  /**
   * Keep the URL describing what is on screen. `?region=` and `?pack=`
   * are ENTRY POINTS — a link naming either opens on it — and `ShareButton`
   * reads `location.href`, so they have to stay honest. `replaceState`, not a
   * router call: a router navigation would remount this form and throw away
   * the player id already typed.
   */
  function writeUrl(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(params)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", url);
  }

  // EVERY field the category asks for, a game login's password included
  // (owner, 2026-10-01): the customer fills them here, once. A credential
  // never reaches the basket cookie — `addToCart`/`buyNow` put it in the
  // short-lived encrypted vault, and checkout does not ask again.
  const basketFields = fields;
  // «احفظ معلوماتي» saves one ACCOUNT (v0.1.117): never a credential, an
  // upload or a one-option confirmation.
  const savableFields = accountFieldsOf(fields);
  // The saved account the form holds right now: every one of its values in
  // place and every other savable field empty — so its card reads as chosen.
  // The card last tapped wins a tie — two accounts holding the same values.
  const holds = (entry: SavedEntry) =>
    savableFields.some((field) => entry.values[field.key]) &&
    savableFields.every((field) => (values[field.key] ?? "") === (entry.values[field.key] ?? ""));
  const entries = saved?.entries ?? [];
  const tappedEntry = entries.find((entry) => entry.id === tappedAccount);
  const chosenAccount = (tappedEntry && holds(tappedEntry) ? tappedEntry : entries.find(holds))?.id;
  /** Fills EVERY savable field from one account — never one field from one beside another's. */
  function fillFromAccount(accountValues: Record<string, string>, id: string | null) {
    setTappedAccount(id);
    setValues((current) => {
      const next = { ...current };
      for (const field of savableFields) delete next[field.key];
      return { ...next, ...accountValues };
    });
  }
  // A priced option the customer picked (v0.1.166): the server's figure for
  // this package WITH it — the basket charges the same. Two priced choices
  // at once have no single figure here; the basket prices them.
  // Only fields still on screen: a value kept for a field `visible_when` has
  // since hidden is never posted, so it never prices the basket either.
  const pricedValues = submittableValues(fields, values);
  const multiselect = new Set(fields.filter((field) => field.type === "multiselect").map((field) => field.key));
  const optionPrice = chosenOptionPrice(selected?.optionPrices, pricedValues, multiselect);
  const withOption = optionPrice !== null && optionPrice !== "several" ? optionPrice : null;
  const shownPrice = withOption?.price ?? selected?.price ?? options[0]!.price;
  // v0.1.87 — what the price carries in VAT, as the server says it; never derived.
  const shownTax = selected?.taxTreatment ?? options[0]!.taxTreatment;
  const taxNote =
    shownTax === "exempt" ? m.product.vatExempt : shownTax === "standard" ? m.product.vatIncluded : shownTax === "zero_rated" ? m.product.vatZeroRated : null;
  const shownRegular = withOption ? (withOption.regular_price ?? null) : (selected?.regular_price ?? null);
  // The bar's figures as drawn — each is keyed by its text, so a change
  // restarts the rise, and only once the customer has changed something.
  const priceText = formatMoney(locale, shownPrice.amount, shownPrice.currency);
  const regularText = shownRegular ? formatMoney(locale, shownRegular.amount, shownRegular.currency) : "";
  const priceMoved = useChangedSinceMount(priceText);
  const regularMoved = useChangedSinceMount(regularText);
  const shownSavings = withOption ? (withOption.savings_pct ?? null) : (selected?.savings_pct ?? null);
  // A figure that would PRINT as «≈ 0» — a real estimate under what the
  // format shows, on a small tier — says nothing true, so it is not drawn.
  // The earn badge for the selected tier: its display-points estimate, and a
  // storewide campaign's boost when one runs (`earnWith` — points, not money).
  // The accessible name says the SAME figure the badge shows.
  const earn = earnWith(withOption ? (withOption.points_estimate_pts ?? null) : (selected?.pointsEstimate ?? null), campaignMultiplier ?? null);
  const points = earn && earn.kind !== "none" ? formatPoints(locale, String(earn.pts)) : null;
  // The bar draws only «≈ 0.04» and the coin; what it means — and, for a
  // guest, that it needs an account — is the figure's name.
  const pointsTitle = points
    ? `${agreePointsUnits(m.product.pointsAbout.replace("{points}", points))}${saved === undefined ? ` (${m.product.pointsWithAccount})` : ""}`
    : null;
  // A tile row whenever there is a tier to choose (one tier still draws one
  // tile, selected). A product sold at its own price posts from a hidden input.
  const tierRow = shown.length > 1 || shown[0]?.packPublicId != null;
  // The goods' line in an express wallet's sheet, named as the bar names it:
  // a long package by its whole name, else the product, then the package.
  const walletGoodsLabel =
    packArt && tierRow && selected && isLongPack(selected, locale)
      ? fullLabel(selected, locale)
      : tierRow && selected
        ? `${title} · ${selected.label[locale] ?? selected.label.en ?? ""}`
        : title;
  // «أين أجده؟» for every field marked `help`: the game's own steps and
  // picture when staff wrote them, the general steps otherwise — never an
  // empty sheet (273 games carried an empty entry, 2026-11-03).
  const fieldHelp = game.fieldHelp ?? { steps: m.product.fieldHelpGeneric, warning: m.product.fieldHelpGenericWarning, image: null };
  const helpOn = basketFields.some((field) => field.help);
  const barIcon = selected ? currencyIcon(selected.currencyArt, game.currencyIcon) : null;

  function openHelp(label: string) {
    setHelpField(label);
    const dialog = help.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeHelp() {
    const dialog = help.current;
    if (!dialog?.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  // Title-line facts, each only when there is something to say.
  const facts: React.ReactNode[] = [];
  if (rating && rating.count > 0 && rating.average) {
    const countText = (rating.count === 1 ? m.product.reviewsCountOne : m.product.reviewsCount).replace("{count}", String(rating.count));
    facts.push(
      <a
        key="rating"
        href="#reviews"
        aria-label={m.product.ratingLink.replace("{rating}", Number(rating.average).toFixed(1)).replace("{count}", countText)}
        className="flex items-center gap-1 font-bold text-[var(--color-ink)]"
      >
        <span aria-hidden className="block size-3.5 bg-[var(--color-warning)] [mask-image:url(/brand/icon-star.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        <bdi dir="ltr">{Number(rating.average).toFixed(1)}</bdi>
        <span className="font-medium text-[var(--color-ink-subtle)]">({countText})</span>
      </a>,
    );
  }
  if (game.deliveryNote) {
    facts.push(
      <span key="delivery" className="flex items-center gap-1 font-bold text-[var(--color-success)]">
        <span aria-hidden className="block size-3.5 bg-current [mask-image:url(/brand/icon-quick-buy.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        {game.deliveryNote}
      </span>,
    );
  }
  if (selected?.lowStock && selected.inStock) {
    facts.push(
      <span key="low" className="rounded-full bg-[var(--color-warning-wash)] px-2 font-bold leading-5 text-[var(--color-warning-strong)]">
        {m.product.lowStock}
      </span>,
    );
  }

  // The ordinary «شراء سريع»: Apple Pay's fallback, and its stand-in while
  // the offer is still on its way.
  const quickBuy = (
    <SubmitButton
      formAction={buyNow}
      className={`${BAR_BUTTON} bg-[var(--color-primary)] text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]`}
    >
      <span aria-hidden className="block size-[17px] shrink-0 bg-current [mask-image:url(/brand/icon-quick-buy.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      {m.product.quickBuy}
    </SubmitButton>
  );

  return (
    <form ref={formRef} className="flex min-w-0 flex-col gap-5 lg:gap-6">
      <input type="hidden" name="locale" value={locale} />
      <ReturnPathInput name="return_to" fallback={`/${locale}/cart`} omit={["added", "stock_alert"]} />
      <input type="hidden" name="slug" value={selected?.slug ?? slug} />
      {!tierRow && selected ? <input type="hidden" name="option" value={selected.key} /> : null}
      {editing ? <input type="hidden" name="line" value={editing.lineId} /> : null}

      {/* The title line's facts, under the shared page's `<h1>`. That column
          spaces the h1 from this form as this form spaces its own rows
          (gap-5, gap-6 from `lg`); the negative margin pulls the facts back up
          to the 8px they always sat under the title, so the gaps match the
          drawn ones whether this row is there or not. */}
      {facts.length > 0 ? (
        <div className="-mt-3 flex flex-wrap items-center gap-2 text-caption lg:-mt-4 lg:text-body-s">
          {facts.flatMap((fact, index) =>
            index === 0 ? [fact] : [<span key={`dot-${index}`} aria-hidden className="size-[3px] rounded-full bg-[var(--color-line)]" />, fact],
          )}
        </div>
      ) : null}

      {/* «كيف تشحن؟» for a first purchase (owner, 2026-11-03): above the
          packages, closable, hidden before paint once done (`BuyGuide`). Not
          while editing a basket line — that customer has bought before. */}
      {editing ? null : <BuyGuide locale={locale} needsId={basketFields.length > 0} />}

      {/* «وفر ٪» ON THE ARTWORK, at its bottom-start corner — lifted there by
          CSS from here, where it can follow the selected tier. The artwork is
          the first thing in `PurchasePage`'s positioned grid, 230 tall on the
          phone and 464 on the desktop. */}
      {/* Pack art (owner 2026-10-13): the chosen package drawn over the
          picture on the phone and the desktop; it carries the saving, so the
          badge below is then not drawn at all. */}
      {packArt && tierRow && selected ? (
        <PackArt locale={locale} image={heroImage} option={selected} shown={shown} game={game} name={title} />
      ) : null}
      <MotionScope><AnimatePresence initial={false}>
        {shownSavings && !(packArt && tierRow) ? (
          <Reveal key="artwork-saving" className="absolute start-3 top-[194px] z-10 lg:top-[420px] lg:[inset-inline-start:calc(100%-488px+16px)]">
            <SavingsBadge
              pct={shownSavings}
              label={m.product.save.replace("{pct}", String(shownSavings))}
              className="rounded-[8px] bg-[var(--color-surface)] px-2.5 text-body-s font-bold lg:text-body-l"
            />
          </Reveal>
        ) : null}
      </AnimatePresence></MotionScope>

      {/* ── Region ── chips choose WHICH tiers are on screen; they post
          nothing themselves, so `option` stays the single thing submitted. */}
      {hasRegions ? (
        <fieldset className="flex min-w-0 flex-col">
          <legend className={LEGEND}>
            <LegendIcon src="/brand/icon-region.svg" />
            {m.product.region}
          </legend>
          {/* `relative`: each chip's radio is `sr-only` — ABSOLUTELY placed —
              and an unpositioned scroller does not clip it. The hidden radios
              of the chips scrolled out of view sat up to ~630px off the
              phone's edge and widened the whole page (2026-10-03). */}
          <div className="relative -mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
            {regions.map((r) => (
              <label key={r.code} className={REGION_CHIP}>
                {/* ONE NAME, ONE NATIVE GROUP: the arrow keys move between the
                    chips and select as they go (`onChange` fires for each). The
                    name is one no cart action reads — they take `option`,
                    `quantity`, `save_fields` and `field_*`. */}
                <input type="radio" name="region_choice" value={r.code} checked={region === r.code} onChange={() => selectRegion(r.code)} className="sr-only" />
                {/* The card's country flag (Daleel-style chips, owner 2026-10-07);
                    none for a region that is not a country. Fixed box, as in
                    the country picker, so an SVG never sizes the pill. */}
                {regionFlag(r.code) ? (
                  <Image src={regionFlag(r.code)!} alt="" aria-hidden width={21} height={15} className="me-2 h-[15px] w-[21px] shrink-0 rounded-[3px]" />
                ) : null}
                {r.name[locale] ?? r.name.en ?? r.code}
              </label>
            ))}
          </div>
          {/* After a region change, which package that left selected. Present
              from the first render and empty, so the change is announced and
              the page load is not. */}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </fieldset>
      ) : null}

      {/* ── Tiers ── every tile with its own price, so customers compare
          without tapping each one. The radio's NAME is the tier's label alone
          (`aria-labelledby`) — the price and tag describe it — so it reads
          as the tier it is, and the tile text stays findable as written. */}
      {tierRow ? (
        <fieldset className="flex min-w-0 flex-col">
          <legend className={LEGEND}>
            <LegendIcon src="/brand/icon-package-balance.svg" />
            {m.product.packageBalance}
          </legend>
          {/* The OLD region's grid is not kept for an exit: its radios are what
              the form posts, so it is gone at once and only the incoming grid
              fades in (keyed by region). `AutoHeight` eases the box between
              the two heights. */}
          <AutoHeight animateKey={region ?? ""}>
          <div key={region ?? ""} className={`${changedRegion ? "cq-fade-in " : ""}grid grid-cols-3 gap-2 pt-2 lg:gap-3`}>
            {shown.map((option, index) => {
              const id = `tier-${index}`;
              const tag = !option.inStock
                ? m.product.soldOut
                : option.badge === "best_value"
                  ? m.product.badgeBestValue
                  : option.badge === "popular"
                    ? m.product.badgePopular
                    : null;
              // What THIS package earns (owner, 2026-11-03): the buy bar's own
              // estimate and campaign, on every tile, so the choice shows it.
              const tileIcon = currencyIcon(option.currencyArt, game.currencyIcon);
              // With a priced option chosen, every tile shows its price WITH it (v0.1.166).
              const tileOption = chosenOptionPrice(option.optionPrices, pricedValues, multiselect);
              const tilePriced = tileOption !== null && tileOption !== "several" ? tileOption : null;
              const tilePrice = tilePriced?.price ?? option.price;
              const earned = earnWith(tilePriced ? (tilePriced.points_estimate_pts ?? null) : option.pointsEstimate, campaignMultiplier ?? null);
              const tileEarn = earned && earned.kind !== "none" ? earned : null;
              const tile = (
                <label key={option.key} className={`${TILE} ${packArt ? "flex-1 " : ""}${option.inStock ? "" : "[&:not(:has(:checked))]:opacity-55"}`}>
                  <input
                    type="radio"
                    name="option"
                    value={option.key}
                    checked={selected?.key === option.key}
                    onChange={() => select(option)}
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-price${tileEarn ? ` ${id}-pts` : ""}${tag ? ` ${id}-tag` : ""}`}
                    className="sr-only"
                  />
                  {tag ? (
                    <span
                      id={`${id}-tag`}
                      className={`absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-[7px] text-caption-xs font-bold leading-4 lg:text-caption lg:leading-5 ${
                        option.inStock ? "bg-[var(--color-danger)] text-[var(--color-on-primary)]" : "bg-[var(--color-ink)] text-[var(--background)]"
                      }`}
                    >
                      {tag}
                    </span>
                  ) : null}
                  {/* The game's own currency picture for this pack's price — big
                      enough to tell a bag from a chest (owner, 2026-11-05). */}
                  {tileIcon ? <Image src={tileIcon} alt="" aria-hidden width={48} height={48} unoptimized className="size-10 object-contain lg:size-12" /> : null}
                  {/* The choice told by shape as well as colour; rendered for
                      the chosen tile only and keyed by its option, so a new
                      choice pops a new mark. */}
                  {selected?.key === option.key ? (
                    <span
                      key={option.key}
                      aria-hidden
                      data-chosen-mark
                      className={`${chose ? "cq-pop " : ""}absolute end-1 top-1 grid size-3.5 place-items-center rounded-full bg-[var(--color-on-cta)] text-[var(--color-primary)]`}
                    >
                      <span aria-hidden className="block size-2 bg-current [mask-image:url(/brand/icon-check.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                    </span>
                  ) : null}
                  {/* The WHOLE name, never cut (owner, 2026-11-04): the tile grows
                      and its row grows with it, so no one has to open anything
                      to read what a package is. */}
                  <span id={`${id}-label`} className="text-body-s font-bold leading-[1.3] [overflow-wrap:anywhere] lg:text-body-m">
                    {fullLabel(option, locale)}
                  </span>
                  <span
                    id={`${id}-price`}
                    dir="ltr"
                    className="mt-0.5 text-caption font-bold tabular-nums text-[var(--color-brand-500)] group-has-[:checked]:text-[var(--color-on-cta)] lg:text-body-s"
                  >
                    {formatMoney(locale, tilePrice.amount, tilePrice.currency)}
                  </span>
                  {tileEarn ? (
                    <span
                      id={`${id}-pts`}
                      className="mt-0.5 flex items-center gap-[3px] text-caption-xs font-bold tabular-nums text-[var(--color-ink-muted)] group-has-[:checked]:text-[var(--color-on-cta)] lg:text-caption"
                    >
                      <Coin size={12} />
                      <bdi dir="ltr" aria-hidden>
                        +{formatPoints(locale, String(tileEarn.pts))}
                      </bdi>
                      <span className="sr-only">{agreePointsUnits(m.product.pointsAbout.replace("{points}", formatPoints(locale, String(tileEarn.pts))))}</span>
                    </span>
                  ) : null}
                </label>
              );
              return tile;
            })}
          </div>
          </AutoHeight>
          {/* «وش تحصل» (owner 2026-10-13): only for a package whose contents
              staff wrote down — no box, and the page as before, otherwise. */}
          {packArt && selected?.contents && (selected.contents[locale] ?? selected.contents.en ?? "").trim() !== "" ? (
            <p key={selected.key} className="cq-fade-in mt-3 flex flex-col gap-1 rounded-[12px] bg-[var(--color-brand-50)] px-3.5 py-3 ring-1 ring-inset ring-[var(--color-line)]">
              <span className="text-caption font-bold text-[var(--color-primary)]">{m.product.whatYouGet}</span>
              <span className="text-body-s font-semibold leading-[1.6]">{selected.contents[locale] ?? selected.contents.en}</span>
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* ── The category's own fields: «رقم الايدي» and friends — the REAL
          inputs, posted as `field_<key>`. «أين أجده؟» beside a field marked
          `help`, the saved IDs as chips under it, and — pressed Buy with it
          empty — the field outlined and the reason said, instead of the order
          failing later at checkout. */}
      {editing ? (
        <p role="status" className="flex items-start gap-2 rounded-[12px] bg-[var(--color-warning-wash)] px-3.5 py-3 text-body-s font-bold leading-[1.5] text-[var(--color-warning-strong)] lg:text-body-l">
          <span aria-hidden className="mt-0.5 block size-4 shrink-0 bg-current [mask-image:url(/brand/icon-info-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          {m.product.completeLine}
        </p>
      ) : null}

      {/* «اشحن لـ» — the signed-in customer's saved ACCOUNTS for this game
          (v0.1.117): one card each, one tap fills all of its fields, and
          «حساب جديد» empties them for someone else. */}
      {saved !== undefined && saved.entries.length > 0 && savableFields.length > 0 ? (
        <section aria-labelledby={savedTitleId} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={savedTitleId} className="text-body-l font-bold text-[var(--color-ink)]">
              {m.product.savedFor}
            </h2>
            <a href={`/${locale}/account/saved-accounts`} className="text-body-s font-bold text-[var(--color-brand-500)]">
              {m.product.manageSaved}
            </a>
          </div>
          <div role="group" aria-labelledby={savedTitleId} className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
            {saved.entries.map((entry) => {
              const on = chosenAccount === entry.id;
              const summary = savableFields.flatMap((field) => {
                const value = entry.values[field.key];
                if (!value) return [];
                const shown = displayFieldValue(field, value, locale) ?? value;
                return [/^\d+$/.test(shown) ? shortValue(shown) : shown];
              });
              return (
                <button
                  key={entry.id}
                  {...CLARITY_MASK}
                  type="button"
                  aria-pressed={on}
                  onClick={() => fillFromAccount(entry.values, entry.id)}
                  className={`flex w-[168px] shrink-0 flex-col items-start gap-1 rounded-[14px] p-3 text-start transition ${
                    on
                      ? "bg-[var(--color-primary-wash-lighter)] shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]"
                      : "bg-[var(--color-surface-raised)] shadow-[inset_0_0_0_1px_var(--color-line)]"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <b className={`truncate text-body-s ${entry.label ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}>
                      {entry.label ?? m.product.unnamedAccount}
                    </b>
                    {on ? (
                      <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)] text-[var(--color-on-primary)]">
                        <span className="block size-3 bg-current [mask-image:url(/brand/icon-check.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                      </span>
                    ) : null}
                  </span>
                  <span className="w-full truncate text-caption text-[var(--color-ink-muted)]">
                    {summary.map((part, index) => (
                      <span key={index}>
                        {index > 0 ? " · " : null}
                        <bdi>{part}</bdi>
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={chosenAccount === undefined}
              onClick={() => fillFromAccount({}, null)}
              className="flex w-[132px] shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-[var(--color-input-border)] p-3 text-body-s font-bold text-[var(--color-brand-500)] aria-pressed:border-[var(--color-brand-500)]"
            >
              <span aria-hidden className="block size-[18px] bg-current [mask-image:url(/brand/icon-add-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.product.newAccount}
            </button>
          </div>
        </section>
      ) : null}

      {basketFields.length > 0 ? (
        <CustomFields
          locale={locale}
          fields={basketFields}
          values={values}
          onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
          namePrefix="field_"
          invalidText={(_, label) => m.product.fieldRequired.replace("{field}", label)}
          labelAccessory={(field) =>
            field.help ? (
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => openHelp(field.label?.[locale] || field.label?.en || field.key)}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-primary-wash-lighter)] px-2.5 text-caption font-bold text-[var(--color-brand-500)]"
              >
                <span aria-hidden className="block size-[15px] bg-current [mask-image:url(/brand/icon-info-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                {m.product.whereToFind}
              </button>
            ) : null
          }
        />
      ) : null}

      {/* «احفظ معلوماتي»: for a signed-in customer, ticked by default — the
          details are ADDED to the account's saved IDs for this game (several
          per game since v0.1.62). Never a credential. */}
      {saved !== undefined && savableFields.length > 0 ? (
        <label className="-mt-2 flex items-center gap-2 text-body-s font-bold text-[var(--color-ink)]">
          <input type="checkbox" name="save_fields" value="1" defaultChecked className="size-5 accent-[var(--color-brand-500)]" />
          {m.product.saveDetails}
        </label>
      ) : null}

      {/* What the price carries in VAT (v0.1.87), as the server says it. The
          Figma bar (`7490:9006`) has no room for it, so it sits just above. */}
      {taxNote ? (
        <p data-testid="vat-note" className="-mt-2 text-caption font-medium text-[var(--color-ink-subtle)] lg:text-body-s">
          {taxNote}
        </p>
      ) : null}
      {optionPrice === "several" ? (
        <p data-testid="options-priced-in-basket" className="-mt-2 text-caption font-medium text-[var(--color-ink-subtle)] lg:text-body-s">
          {m.product.optionsPricedInBasket}
        </p>
      ) : null}

      {/* ── THE BUY BAR ── (Figma `7490:9006`, «Sticky Purchase Bar») fixed at
          the bottom of the screen on the phone (where it takes the tab bar's
          place — globals.css, `data-buy-bar`) AND on the desktop, so the
          buttons stay in reach through a long tier list. The product name on
          the top line with the chosen package after it, over the price and the
          points; the artwork beside them with «وفر ٪» on its foot; then the
          basket, «أضف للسلة» and «شراء سريع», or «نبهني» when it is out of stock. No desktop
          comp: from `lg` the same pieces sit in one row in the 1248 column. */}
      <div ref={buyBar} data-buy-bar className={BUY_BAR}>
        <div className="mx-auto flex w-full max-w-[1248px] flex-col gap-3 lg:flex-row lg:items-center lg:gap-6 lg:px-6">
          <div className="flex min-w-0 items-center gap-3 lg:flex-1">
            {/* The picture alone; the grey only behind the placeholder. */}
            <span className={`relative size-16 shrink-0 overflow-hidden rounded-[12px] ${image ? "" : "bg-[var(--color-surface-subtle)]"}`}>
              {image ? (
                <ArtworkFill art={image} alt="" sizes="64px" />
              ) : (
                <ArtworkPlaceholder name={title} className="[&>span]:!text-heading-l" />
              )}
              {/* «وفر ٪» as a ribbon on the artwork's foot — the server's figure, never derived. */}
              <MotionScope><AnimatePresence initial={false}>
                {shownSavings ? (
                  <Reveal key="bar-saving" className="absolute inset-x-0 bottom-0">
                    <SavingsBadge
                      pct={shownSavings}
                      label={m.product.save.replace("{pct}", String(shownSavings))}
                      className="w-full justify-center !rounded-none !border-0 bg-[var(--color-danger)] !px-1 !py-0 !text-caption !font-bold !leading-[16px] !text-[var(--color-on-primary)]"
                    />
                  </Reveal>
                ) : null}
              </AnimatePresence></MotionScope>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {/* The name, then the chosen package after it on the same line. */}
              {packArt && tierRow && selected && isLongPack(selected, locale) ? (
                // A long package's whole name, on up to two lines — the tile
                // shows its short name, so the bar says exactly what is bought.
                <span className="line-clamp-2 text-body-s font-semibold leading-[1.4] text-[var(--color-ink)] lg:text-body-l">
                  {barIcon ? <Image src={barIcon} alt="" aria-hidden width={24} height={24} unoptimized className="me-1 inline-block size-6 align-[-0.35em] object-contain" /> : null}
                  {fullLabel(selected, locale)}
                </span>
              ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-body-s lg:text-body-l">
                <span className="truncate font-medium text-[var(--color-ink-muted)]">{title}</span>
                {tierRow && selected ? (
                  <span className="flex min-w-0 max-w-[50%] shrink-0 items-center gap-1 font-semibold text-[var(--color-ink)]">
                    <span aria-hidden className="text-[var(--color-ink-subtle)]">·</span>
                    {barIcon ? <Image src={barIcon} alt="" aria-hidden width={24} height={24} unoptimized className="size-6 shrink-0 object-contain" /> : null}
                    <span className="truncate">{selected.label[locale] ?? selected.label.en ?? ""}</span>
                  </span>
                ) : null}
              </span>
              )}
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    key={priceText}
                    dir="ltr"
                    className={`${priceMoved ? "cq-rise " : ""}whitespace-nowrap text-heading-m font-bold tabular-nums text-[var(--color-brand-500)] lg:text-heading-l`}
                  >
                    {priceText}
                  </span>
                  {shownRegular ? (
                    <s
                      key={regularText}
                      dir="ltr"
                      className={`${regularMoved ? "cq-rise " : ""}whitespace-nowrap text-body-s font-medium leading-[1.5] tabular-nums lg:text-body-l text-[var(--color-danger)]`}
                    >
                      {regularText}
                    </s>
                  ) : null}
                </span>
                <MotionScope><AnimatePresence initial={false}>
                  {points ? (
                    // ≈ — an estimate at a NEW account's rate (v0.1.62); a guest
                    // earns nothing without an account, and is told so here.
                    <Reveal key="points" className="shrink-0">
                      <span title={pointsTitle ?? undefined} aria-label={pointsTitle ?? undefined} role="img" className="flex">
                        {earn ? <EarnBadge locale={locale} earn={earn} compactOnPhone /> : null}
                      </span>
                    </Reveal>
                  ) : null}
                </AnimatePresence></MotionScope>
              </span>
            </span>
          </div>

          {/* THE ACTIONS: the buttons' row, then — on its OWN full-width
              line under it — what the express button has to say. Never a
              third item in the row: a sentence there took the buttons' width
              and squeezed their labels over each other (owner, iPhone,
              2026-10-14). The bar grows with the line, and the page's
              clearance follows (`useBuyBarClearance`). */}
          <div className="flex min-w-0 flex-col gap-2 lg:w-[460px] lg:shrink-0">
            <div data-buy-bar-buttons className="flex gap-2 lg:gap-3">
              {/* THE BASKET, a 48 square before «أضف للسلة»: where the line just
                  added went, with the count — it bumps when that count changes
                  (`CartLinkView`, components/cart/CartBadge.tsx). */}
              {basket}

              {selected && !selected.inStock ? (
                <div className="min-w-0 flex-1">
                  <OutOfStock locale={locale} option={selected} waiting={waiting} />
                </div>
              ) : editing ? (
                <SubmitButton
                  formAction={buyNow}
                  className={`${BAR_BUTTON} bg-[var(--color-primary)] text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]`}
                >
                  {m.product.saveAndPay}
                </SubmitButton>
              ) : (
                <>
                  <SubmitButton
                    formAction={addToCart}
                    // Hands the item across the redirect to ToastHost.
                    onClick={() => {
                      if (selected) rememberAddedItem(purchaseOptionItem(selected, selected.slug, locale));
                    }}
                    className={`${BAR_BUTTON} border border-[var(--color-brand-500)] bg-[var(--background)] text-[var(--color-brand-500)] hover:bg-[var(--color-primary-wash-lighter)]`}
                  >
                    <span aria-hidden className="block size-[22px] shrink-0 bg-current [mask-image:url(/brand/icon-cart.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                    {m.cart.addToCart}
                  </SubmitButton>
                  {/* Its own boundary: the offer is a promise the server never
                      waited for, and until it lands this is the ordinary
                      «شراء سريع» — what Apple Pay's place shows before the
                      browser says it can pay anyway. */}
                  <Suspense fallback={quickBuy}>
                    <ExpressSlot
                      locale={locale}
                      offer={express}
                      form={formRef}
                      option={selected?.key ?? null}
                      fields={values}
                      listed={selected ? shownPrice : null}
                      // Where Apple Pay is not: Google Pay, whose own
                      // fallback is «شراء سريع». Never both.
                      fallback={
                        <Suspense fallback={quickBuy}>
                          <ExpressGoogleSlot
                            locale={locale}
                            offer={expressGoogle}
                            form={formRef}
                            option={selected?.key ?? null}
                            fields={values}
                            listed={selected ? shownPrice : null}
                            fallback={quickBuy}
                            onNotice={setBarNotice}
                            goodsLabel={walletGoodsLabel}
                            onFeeNote={setFeeNote}
                          />
                        </Suspense>
                      }
                      onNotice={setBarNotice}
                      goodsLabel={walletGoodsLabel}
                      onFeeNote={setFeeNote}
                    />
                  </Suspense>
                </>
              )}
            </div>
            {/* Only beside the express button that set it — never under
                «نبهني» or «حفظ ومتابعة». */}
            {barNotice && !editing && !(selected && !selected.inStock) ? <BarNotice text={barNotice} /> : null}
            {/* The wallet's fee, before its sheet — quiet, and never beside a
                notice that has something more urgent to say. */}
            {feeNote && !barNotice && !editing && !(selected && !selected.inStock) ? <WalletFeeNote text={feeNote} /> : null}
          </div>
        </div>
      </div>

      {/* «أين أجده؟» — a native dialog: bottom sheet on the phone, centred
          from `lg`; focus trap, Escape and the inert page from the browser. */}
      {helpOn ? (
        <dialog
          ref={help}
          aria-labelledby={helpTitleId}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeHelp();
          }}
          className="cq-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[22px] bg-[var(--background)] p-0 text-[var(--color-ink)] backdrop:bg-[var(--color-backdrop)] lg:m-auto lg:max-w-[440px] lg:rounded-[22px]"
        >
          <div className="flex max-h-[inherit] flex-col gap-3.5 overflow-y-auto px-5 pb-[calc(22px+env(safe-area-inset-bottom))] pt-2 lg:pt-5">
            <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
            <div className="flex items-start justify-between gap-3">
              <h2 id={helpTitleId} className="text-heading-m font-bold leading-[1.4] lg:text-heading-l">
                {m.product.whereToFindTitle.replace("{field}", helpField)}
              </h2>
              <button
                type="button"
                onClick={closeHelp}
                aria-label={m.checkout.dismiss}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-chip)]"
              >
                <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </button>
            </div>
            {fieldHelp.image ? (
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] bg-[var(--color-chip)]">
                <Image src={fieldHelp.image.url} alt={fieldHelp.image.alt} fill sizes="440px" className="object-contain" />
              </div>
            ) : null}
            {fieldHelp.steps.length > 0 ? <NumberedSteps steps={fieldHelp.steps} /> : null}
            {fieldHelp.warning ? (
              <p className="flex items-start gap-2 rounded-[12px] bg-[var(--color-warning-wash)] px-3 py-2.5 text-caption font-semibold leading-[1.6] text-[var(--color-warning-strong)] lg:text-body-s">
                <span aria-hidden className="mt-0.5 block size-4 shrink-0 bg-current [mask-image:url(/brand/icon-info-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                {fieldHelp.warning}
              </p>
            ) : null}
            <button
              type="button"
              onClick={closeHelp}
              className="h-12 rounded-[12px] bg-[var(--color-primary)] text-body-s font-bold text-[var(--color-on-cta)] lg:text-body-l"
            >
              {m.product.gotIt}
            </button>
          </div>
        </dialog>
      ) : null}

    </form>
  );
}

/**
 * THE BUY BAR'S HEIGHT, FOR THE CLEARANCE UNDER THE FOOTER. The bar is fixed
 * on the phone, so the page needs room at its very end for it — and that room
 * lives under the footer (the layout's spacer), not as padding inside the
 * page, where it showed as an empty band between the content and the footer.
 * The bar's height follows what it holds (a long name wraps, out of stock is a
 * different block), so it is measured rather than assumed; until this runs the
 * spacer uses the bar's usual height (globals.css).
 */
function useBuyBarClearance() {
  const ref = useRef<HTMLDivElement>(null);

  // Mount: mark the page and watch the bar for size changes it makes on its
  // own (fonts arriving, the viewport turning).
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    root.dataset.buyBarShown = "";
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => writeBuyBarHeight(bar)) : null;
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      delete root.dataset.buyBarShown;
      root.style.removeProperty("--cq-buy-bar-height");
    };
  }, []);

  // Every render: a new tier can add or drop a line (the points, «وفر»), and
  // the clearance must follow at once, not whenever an observer next runs.
  useEffect(() => {
    if (ref.current) writeBuyBarHeight(ref.current);
  });

  return ref;
}

function writeBuyBarHeight(bar: HTMLElement) {
  document.documentElement.style.setProperty("--cq-buy-bar-height", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
}

/** «8123…4410» — a long saved value shortened for its card; short ones whole. */
function shortValue(value: string): string {
  return value.length > 9 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

/** Numbered steps, each number in a brand circle — the usage tab and the help sheet. */
export function NumberedSteps({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)] text-caption font-bold text-[var(--color-on-cta)]"
          >
            {index + 1}
          </span>
          <span className="text-body-s font-medium leading-[1.7] text-[var(--color-ink-muted)] lg:text-body-l">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The out-of-stock bar (`7422:37550`, the pack's `7422:37654`): «هذا المنتج
 * غير متوفر الأن» over one full-width yellow «نبهني عند التوفير» — and, once
 * asked, the same button greyed and disabled. Per PACK when only the chosen
 * pack is out. `formNoValidate`: waiting for a product needs no
 * player id, so a required field left empty must not block it.
 */
function OutOfStock({ locale, option, waiting: waitingFor }: { locale: Locale; option: PurchaseOption; waiting: readonly string[] }) {
  const m = messagesFor(locale);
  // ONE PACK out of a product on sale (owner, 2026-10-07): wait for THAT
  // pack — the product's own alert is refused while the product is in stock.
  // The whole product out: wait for the product, as before.
  const packId = option.productInStock === true ? option.packPublicId : null;
  const watched = packId ?? option.productPublicId;
  const waiting = watched !== null && waitingFor.includes(watched);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-l font-semibold text-[var(--color-ink-muted)]">{m.product.outOfStock}</p>
      <input type="hidden" name="stock_product_public_id" value={option.productPublicId ?? ""} />
      {packId ? <input type="hidden" name="stock_pack_public_id" value={packId} /> : null}
      <input type="hidden" name="stock_slug" value={option.slug} />
      <SubmitButton
        formAction={requestStockAlertAction}
        formNoValidate
        disabled={waiting}
        className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-secondary)] px-4 text-body-s font-bold text-[var(--color-on-secondary)] transition hover:bg-[var(--color-secondary-hover)] disabled:cursor-default disabled:bg-[var(--color-button-disabled)] disabled:text-[var(--color-ink-muted)] lg:h-[57px] lg:text-heading-m"
      >
        {waiting ? m.product.notifyOn : m.product.notifyMe}
        <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-bell.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      </SubmitButton>
    </div>
  );
}

/**
 * A package tile: 14 corners, the card grey; the chosen one filled in primary
 * with `--color-on-cta` on it — white on the light blue, dark ink on the dark
 * theme's lifted #0991dc, where white falls short of 4.5:1. Styled from its
 * radio, so it works before hydration.
 */
const TILE =
  "group relative flex cursor-pointer flex-col items-center justify-start gap-px rounded-[14px] bg-[var(--color-chip)] px-1 pb-2.5 pt-3 text-center text-[var(--color-ink)] transition duration-(--cq-motion-fast) ease-(--cq-ease-out) active:scale-[0.98] " +
  "has-[:checked]:bg-[var(--color-primary)] has-[:checked]:text-[var(--color-on-cta)] " +
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-primary)]";

/** A region chip: a 38-tall pill, hairline; the chosen one filled. */
const REGION_CHIP =
  "flex h-[38px] shrink-0 cursor-pointer items-center rounded-full border border-[var(--color-line)] px-4 text-body-s font-bold text-[var(--color-ink)] transition duration-(--cq-motion-fast) ease-(--cq-ease-out) active:scale-[0.98] lg:h-11 " +
  "has-[:checked]:border-transparent has-[:checked]:bg-[var(--color-primary)] has-[:checked]:text-[var(--color-on-cta)] " +
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-primary)]";

/**
 * The buy bar (`7490:9006`): fixed at the bottom on the page's ground at every
 * width, lifted by the comp's 0 -4 8 shadow; 12 / 16 around it plus the home
 * indicator on the phone, 12 above and below the page's own 1248 column from
 * `lg`. The page reserves its height under the footer (globals.css).
 */
const BUY_BAR =
  "fixed inset-x-0 bottom-0 z-30 bg-[var(--background)] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] " +
  "shadow-[0_-4px_8px_rgba(0,0,0,0.12)] lg:px-0 lg:py-3";

/**
 * What the express button has to say, on its own line under the bar's
 * buttons and as wide as they are together — the checkout's wallet notice
 * (`CartCheckoutForm`, a washed block in the column), tightened for the bar.
 * No comp draws it; it wraps to as many lines as it needs and the bar grows.
 */
/** «الدفع بـ Apple Pay: … شامل رسوم المعالجة …» — a caption under the bar's buttons, not a notice. */
function WalletFeeNote({ text }: { text: string }) {
  return (
    <p data-buy-bar-fee className="flex items-center gap-1.5 text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">
      <span aria-hidden className="block size-3.5 shrink-0 bg-current [mask-image:url(/brand/icon-info.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      {text}
    </p>
  );
}

function BarNotice({ text }: { text: string }) {
  return (
    <p
      role="status"
      data-buy-bar-notice
      className="rounded-[12px] bg-[var(--color-bg-subtle)] px-3 py-2 text-caption font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-body-s"
    >
      {text}
    </p>
  );
}

/** «أضف للسلة» / «شراء سريع» in the bar: 48 tall, 12 corners, Bold 15 on the phone (the comp's SemiBold 14 read too light at arm's length), SemiBold 18 on desktop, the glyph first; 12 inside so both fit beside the basket at 360. */
const BAR_BUTTON =
  "flex h-12 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[12px] px-3 text-body-m font-bold transition lg:text-heading-m lg:font-semibold";

/** «النطاق» / «رصيد الباقة» — Bold 14 after an 18px glyph, Bold 18 on desktop (the comp draws SemiBold; kept heavier so a section label outweighs the chips under it). */
const LEGEND =
  "mb-2.5 flex items-center gap-1.5 text-body-s font-bold leading-[1.5] text-[var(--color-ink)] lg:mb-3 lg:text-heading-m";

/** The glyph before each legend, painted in the text's ink. */
function LegendIcon({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-[18px] shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}

/**
 * Whether `value` has changed since this component first drew it. The bar's
 * figures rise only after the customer changed something — the server's own
 * first paint stays still. Held in state (set while rendering, the pattern
 * React documents for derived state) so no effect or timer decides it.
 */
function useChangedSinceMount(value: string): boolean {
  const [first] = useState(value);
  const [changed, setChanged] = useState(false);
  if (!changed && value !== first) setChanged(true);
  return changed;
}

/**
 * A piece of the bar that eases open and shut — height and opacity — when the
 * selection adds or drops it (the points, «وفر»). The caller wraps it in an
 * `AnimatePresence initial={false}`, so it is drawn at once on the first
 * paint. While it is only still here for its exit it is `inert`: it has
 * already left, and nothing in it takes focus or a click. The exit never
 * holds up anything — the bar's own height is re-measured as it moves.
 */
function Reveal({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const leaving = useLeaving();
  const enter = useMotionTransition("base");
  const exit = useMotionTransition("exit");

  return (
    <mo.span
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1, transition: enter }}
      exit={{ height: 0, opacity: 0, transition: exit }}
      inert={leaving}
      className={`flex overflow-hidden ${className}`}
    >
      {children}
    </mo.span>
  );
}

/** The browser's cookies are read once per render; nothing here subscribes to their changes. */
function neverChanges(): () => void {
  return () => undefined;
}

/** On the server and while hydrating: no visitor country, so the HTML matches the server's. */
function noCountryOnServer(): null {
  return null;
}
