"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

import { CHECKOUT_HEADING } from "@/components/checkout/styles";
import { TapCardForm, type TapCardHandle } from "@/components/checkout/TapCardForm";
import { AutoHeight } from "@/components/ui/motion/AutoHeight";
import { chargeNotice, feeLabel, isExpressWallet, methodNote, type PaymentMethodView } from "@/lib/checkout/methods";
import type { Money } from "@/lib/checkout/price-delta";
import { ABOVE_FOLD_IMAGE } from "@/lib/brand/image-priority";
import { methodLogo } from "@/lib/checkout/method-logos";
import { schemeMarks } from "@/lib/checkout/scheme-marks";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { failedBeforeAnyAttempt, reportPaymentSignal, reportPaymentSignalUnlessLeft, walletFailureTags, type WalletFailure } from "@/lib/monitoring/payment-signal";
import { appleCustomer, appleCustomerGap, type CheckoutContact } from "@/lib/wallets/apple-customer";

import { ApplePayButton, applePaySupported, type ApplePayConfig } from "./ApplePayButton";
import { GooglePayButton, googlePayReady, type GooglePayConfig } from "./GooglePayButton";

/**
 * «طريقة الدفع» — how the customer pays, in one place for every checkout
 * (the basket, a single item, and an order paid again from its page).
 *
 * ONE ROW AND A SHEET (the «Checkout Mobile» redesign, 2026-09-30, which
 * retires the always-open list of 2026-09-28): the chosen method is SUMMARISED
 * — its logo, name and what choosing it means — beside «تغيير», and every
 * method the server offers is in a bottom sheet (a centred dialog from `lg`).
 * Under the row sits ONLY the chosen method's own area: the card fields, or a
 * line saying what happens next. A signed-in customer's saved cards head the
 * sheet, above «طرق دفع أخرى»; picking one needs no card fields at all.
 *
 * WALLETS ARE LISTED only once the wallet says this browser can pay (Apple:
 * `ApplePaySession.canMakePayments()`; Google: `isReadyToPay`), and their OWN
 * button is drawn only while one is picked: Apple and Google both require the
 * sheet to open from their button, never ours. That button REPLACES the pay
 * button — it is drawn into the caller's pay bar (`walletSlot`), and picking a
 * wallet tells the caller to hide its own (`onExpressChoice`).
 *
 * Presentational: the parent owns the order and the payment, and is handed a
 * wallet's token the moment the customer approves the sheet. Nothing here
 * computes a price — `amount` is the server's quote, passed to the wallet
 * sheets and to Tap's card form for display only.
 */

export interface SavedCardView {
  /** The card's PUBLIC id — what `saved_card_public_id` takes (ADR 0037). */
  public_id: string;
  brand: string;
  last_four: string;
  expiry_month?: string | null;
  expiry_year?: string | null;
  nickname?: string | null;
  is_default?: boolean;
  chargeable?: boolean;
}

export type WalletCode = "apple_pay" | "google_pay";

function noSubscription(): () => void {
  return () => undefined;
}

/**
 * A checkout wallet's failure, counted — under the names Sentry already
 * groups (`wallet_error`, CHARGERQUICK-STOREFRONT-4; Apple refusing the
 * merchant as `applepay_merchant_validation`). Reported HERE, not in the
 * button: the wallet is dropped in answer, which unmounts the button, and a
 * report it held for the page-leave grace died with it. The grace stays
 * (#79): a request cut off because the page was being left is not a failure.
 */
function reportWalletFailure(sdk: WalletCode, failure: WalletFailure): void {
  if (failure.where === "merchant") {
    reportPaymentSignal("applepay_merchant_validation", { sdk, status: "error" });
    return;
  }
  reportPaymentSignalUnlessLeft("wallet_error", { sdk, stage: failure.where, ...walletFailureTags(failure) });
}

export function PaymentSection({
  locale,
  currency,
  methods,
  method,
  onMethod,
  amount,
  signedIn,
  savedCards,
  savedCardId,
  onSavedCard,
  saveCard,
  onSaveCard,
  cardHandle,
  onCardValid,
  onCardFallback,
  disabled,
  priceSettling = false,
  onWalletToken,
  onWalletProblem,
  onExpressChoice,
  walletSlot,
  contact,
  applePayDetailsFrom,
  walletBlocked = false,
  onWalletBlocked,
}: {
  locale: Locale;
  currency: string;
  methods: PaymentMethodView[];
  /** The chosen non-wallet method's code — what the order is priced with. */
  method: string;
  onMethod: (code: string) => void;
  /** The server's total for this order, or null before it is known. */
  amount: string | null;
  signedIn: boolean;
  savedCards: SavedCardView[];
  /** A saved card chosen instead of typing one; null for a new card. */
  savedCardId: string | null;
  onSavedCard: (publicId: string | null) => void;
  saveCard: boolean;
  onSaveCard: (save: boolean) => void;
  cardHandle: Ref<TapCardHandle>;
  onCardValid: (valid: boolean) => void;
  /**
   * The card form could not be drawn: pay on Tap's hosted page instead —
   * the same order, its frozen amount. Offered only when given.
   */
  onCardFallback?: () => void;
  /** An order is being placed or paid: nothing may change underneath it. */
  disabled: boolean;
  /**
   * The server is still pricing the method just picked. A wallet's sheet
   * shows `amount`, so its button waits for the wallet's own total.
   */
  priceSettling?: boolean;
  /**
   * A wallet's approved token, with the figure its sheet SHOWED (sent on as
   * `expected_total`). Return the payment's promise: Apple's sheet reports
   * what it settles to.
   */
  onWalletToken: (wallet: WalletCode, token: string, shown: Money) => Promise<unknown> | void;
  onWalletProblem: (problem: "cancelled" | "failed") => void;
  /** A wallet picked (its own button now pays), or null for any other method. */
  onExpressChoice?: (wallet: WalletCode | null) => void;
  /**
   * Where a picked wallet's own button is drawn — the caller's pay bar, in
   * place of its pay button. `null` while that element has not mounted yet;
   * left out, the button is drawn under the method row instead.
   */
  walletSlot?: HTMLElement | null;
  /** Who is paying — for Apple Pay's required `customer`. */
  contact?: CheckoutContact | null;
  /**
   * Where this customer can give what Apple Pay needs — a first name, and an
   * email or a phone (Tap refuses its setup otherwise: 1130/1139,
   * `appleCustomerGap`): `checkout` — the guest's own contact fields on this
   * page; `account` — the account's profile. Apple Pay is then offered
   * while they are missing, with a short hint where its button would be
   * naming what is. Left out (a guest paying an order again: no field
   * here), such a customer is not offered Apple Pay at all. Never anything
   * invented.
   */
  applePayDetailsFrom?: "checkout" | "account";
  /**
   * The order cannot be placed yet — a guest's contact or a line's details
   * are missing — so a wallet's sheet must not open: the customer would
   * approve a payment for an order the server then refuses. A press is
   * handed to `onWalletBlocked` instead, which shows what is missing.
   */
  walletBlocked?: boolean;
  onWalletBlocked?: () => void;
}) {
  const m = messagesFor(locale);
  const [wallet, setWallet] = useState<WalletCode | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Read on the client only: the server lists no wallet, and neither does a
  // browser without one, so hydration never disagrees.
  const appleCan = useSyncExternalStore(noSubscription, applePaySupported, () => false);
  const [googleCan, setGoogleCan] = useState(false);
  /** A wallet whose script failed to load after it was picked. */
  const [broken, setBroken] = useState<Partial<Record<WalletCode, boolean>>>({});

  const googleConfig = methods.find((option) => option.code === "google_pay")?.wallet as GooglePayConfig | undefined;
  useEffect(() => {
    if (!googleConfig || !amount) return;
    let cancelled = false;
    googlePayReady(googleConfig).then((ready) => {
      if (!cancelled) setGoogleCan(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [googleConfig, amount]);

  /*
   * APPLE PAY NEEDS A FIRST NAME AND AN EMAIL OR PHONE (`appleCustomerGap`):
   * Tap refuses its setup otherwise. Its button is drawn once that customer
   * has held still for a moment (a guest typing — not a Tap setup per
   * keystroke), stays while the customer is complete (the button settles
   * later edits itself), and goes the moment something is cleared — so Tap
   * is never asked without them. Until then a hint stands in its place.
   */
  const appleGap = appleCustomerGap(contact);
  const appleKey = appleGap === null ? JSON.stringify(appleCustomer(contact, locale)) : null;
  const [settledAppleKey, setSettledAppleKey] = useState(appleKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledAppleKey(appleKey), 600);
    return () => window.clearTimeout(timer);
  }, [appleKey]);
  const [appleReady, setAppleReady] = useState(appleKey !== null);
  if (appleKey === null && appleReady) setAppleReady(false);
  if (appleKey !== null && !appleReady && settledAppleKey === appleKey) setAppleReady(true);
  // Offered while incomplete only where this page lets the customer complete it.
  const appleReachable = appleGap === null || applePayDetailsFrom !== undefined;

  const walletCan = (code: string): boolean =>
    Boolean(amount) &&
    !broken[code as WalletCode] &&
    (code === "apple_pay" ? appleCan && appleReachable : code === "google_pay" ? googleCan : false);

  // The server's order, wallets included where this browser can pay.
  const rows = methods.filter((option) => !isExpressWallet(option) || (option.wallet && walletCan(option.code)));
  const chosen = methods.find((option) => option.code === (wallet ?? method));

  // SAVED CARDS are a way to pay with the method that has the card form — the
  // one whose code the order is placed with. None when no such method is
  // offered: a saved card cannot be charged through a rail that is not there.
  const cardMethod = methods.find((option) => Boolean(option.card_sdk) && !isExpressWallet(option));
  const saved = signedIn && cardMethod ? savedCards : [];
  const savedChosen = !wallet && chosen?.card_sdk ? (saved.find((card) => card.public_id === savedCardId) ?? null) : null;

  function openSheet() {
    const dialog = sheet.current;
    if (!dialog || dialog.open) return;
    // `showModal` traps focus, closes on Escape and makes the page behind
    // inert; a browser without it still shows the sheet, unmodally.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeSheet() {
    const dialog = sheet.current;
    if (!dialog?.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  // A payment starting underneath must not leave the sheet open over it.
  useEffect(() => {
    const dialog = sheet.current;
    if (!disabled || !dialog?.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }, [disabled]);

  /*
   * APPLE PAY FIRST, where it can pay (owner, 2026-10-02: «the Apple Pay
   * button directly in front of the customer»). Once this browser says it
   * can, the wallet is chosen and its own button stands in the pay bar — no
   * trip through «تغيير». Only while the customer has chosen nothing
   * themselves; «تغيير» still offers every other method, and a saved card
   * or the card form is one tap away.
   */
  const customerChose = useRef(false);
  const appleOption = methods.find((option) => option.code === "apple_pay" && isExpressWallet(option) && option.wallet);
  const applePreferred = Boolean(appleOption) && walletCan("apple_pay") && !disabled;
  useEffect(() => {
    if (!applePreferred || customerChose.current || wallet !== null) return;
    customerChose.current = true;
    setWallet("apple_pay");
    onExpressChoice?.("apple_pay");
  }, [applePreferred, wallet, onExpressChoice]);

  // A pick the CUSTOMER made — not the Apple Pay preselection above, nor a
  // wallet falling back — is what lets the area under the row animate:
  // height and fade follow a customer's action, never the page's own
  // decision at load (HANDBOOK «Motion»).
  const [customerPicked, setCustomerPicked] = useState(false);

  function pickMethod(option: PaymentMethodView) {
    customerChose.current = true;
    setCustomerPicked(true);
    if (isExpressWallet(option)) {
      setWallet(option.code as WalletCode);
      onExpressChoice?.(option.code as WalletCode);
      return;
    }
    setWallet(null);
    onExpressChoice?.(null);
    // The card method's own row is a NEW card; a saved card is its own row.
    if (option.card_sdk) onSavedCard(null);
    onMethod(option.code);
  }

  function pickSaved(card: SavedCardView) {
    if (!cardMethod) return;
    customerChose.current = true;
    setCustomerPicked(true);
    setWallet(null);
    onExpressChoice?.(null);
    onSavedCard(card.public_id);
    onMethod(cardMethod.code);
  }

  function walletFailed(code: WalletCode) {
    // Its script would not load, or it failed: the row goes, the pay button
    // comes back, and the order is priced with the method again.
    setBroken((now) => ({ ...now, [code]: true }));
    setWallet(null);
    onExpressChoice?.(null);
    if (method) onMethod(method);
  }

  const walletButton =
    wallet && chosen?.wallet && amount ? (
      chosen.code === "apple_pay" ? (
        !appleReady ? (
          applePayDetailsFrom ? <ApplePayNeedsCustomer locale={locale} from={applePayDetailsFrom} missing={appleGap} /> : null
        ) : (
        <ApplePayButton
          locale={locale}
          config={chosen.wallet as unknown as ApplePayConfig}
          amount={amount}
          currency={currency}
          contact={contact}
          disabled={disabled || priceSettling}
          onToken={(token, shown) => onWalletToken("apple_pay", token, shown)}
          onCancel={(sheet) => {
            // Closing Apple's sheet after a refused payment is a cancel too:
            // the checkout has already said what happened to that payment,
            // and "nothing was charged" is not ours to add.
            if (!sheet.afterToken) onWalletProblem("cancelled");
          }}
          onError={(failure) => {
            reportWalletFailure("apple_pay", failure);
            // After a token the payment's own answer stands — it may have
            // started, so neither "nothing was charged" nor dropping the
            // wallet (a new attempt) follows.
            if (failure.afterToken) return;
            // Chosen for the customer, so a failure — Apple refusing the
            // merchant, the SDK breaking — must not leave them stuck on it:
            // the card and the pay button come back, with the notice.
            walletFailed("apple_pay");
            // A button that never set itself up (nobody pressed it — Apple Pay
            // is even chosen for the customer on an iPhone) is dropped
            // silently: «payment failed» says a payment was tried.
            if (!failedBeforeAnyAttempt(failure)) onWalletProblem("failed");
          }}
          onAvailable={(yes) => {
            if (!yes) walletFailed("apple_pay");
          }}
        />
        )
      ) : (
        <GooglePayButton
          locale={locale}
          config={chosen.wallet as unknown as GooglePayConfig}
          amount={amount}
          currency={currency}
          disabled={disabled || priceSettling}
          onToken={(token, shown) => onWalletToken("google_pay", token, shown)}
          onCancel={() => onWalletProblem("cancelled")}
          onError={(failure) => {
            reportWalletFailure("google_pay", failure);
            // As for Apple Pay: never over a payment that may have started.
            if (failure.afterToken) return;
            // As for Apple Pay: a broken wallet must not stay chosen.
            walletFailed("google_pay");
            if (!failedBeforeAnyAttempt(failure)) onWalletProblem("failed");
          }}
        />
      )
    ) : null;

  // Locked, the wallet's button is covered by one of ours: a press says
  // what is missing rather than opening a sheet for an order the server
  // would refuse.
  const walletPay =
    walletButton && walletBlocked ? (
      <div className="relative w-full">
        {walletButton}
        <button type="button" data-wallet-blocked aria-label={m.payment.walletLocked} onClick={() => onWalletBlocked?.()} className="absolute inset-0 z-10 cursor-pointer rounded-[12px]" />
      </div>
    ) : (
      walletButton
    );

  const summaryNotice = chosen ? chargeNotice(chosen, currency, locale) : null;

  /*
   * WHICH AREA IS UNDER THE ROW, as a key. It drives two things and nothing
   * else: the height easing (`AutoHeight`) and the fade the incoming area
   * plays. It decides no payment path — every one of them reads `method`,
   * `wallet` and the quote, never this string or the DOM.
   *
   * `areaMoved` turns on once the area has CHANGED after the first paint, so
   * the server's HTML (and the first client render) carries no animation.
   * Derived during render, the documented way to adjust state from a prop:
   * the very render that swaps the area also marks it, so the new element is
   * born with its fade.
   */
  const areaVariant = chosen ? methodAreaVariant(chosen, wallet, savedChosen, amount) : null;
  const [shownVariant, setShownVariant] = useState(areaVariant);
  const [areaMoved, setAreaMoved] = useState(false);
  if (areaVariant !== shownVariant) {
    setShownVariant(areaVariant);
    if (areaVariant !== null && shownVariant !== null && customerPicked) setAreaMoved(true);
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={`${CHECKOUT_HEADING} mb-3`}>{m.checkout.paymentMethod}</legend>
      <div className="flex flex-col gap-3">

      {/* THE ROW: what pays now, and «تغيير». One tap opens every choice. */}
      <button
        type="button"
        data-change-method
        aria-haspopup="dialog"
        onClick={openSheet}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[12px] bg-[var(--color-bg-subtle)] p-2 text-start transition-colors hover:bg-[var(--color-border)] disabled:cursor-default disabled:opacity-60"
      >
        {savedChosen ? <SavedCardLogo card={savedChosen} /> : chosen ? <MethodLogo method={chosen} currency={currency} /> : <CardGlyphTile />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span dir="auto" className="text-body-s font-extrabold leading-[18px] text-[var(--color-ink)] lg:text-body-l lg:font-bold lg:leading-[1.4]">
            {savedChosen ? savedCardName(savedChosen) : chosen ? methodName(chosen, locale) : m.checkout.chooseMethod}
          </span>
          {savedChosen || chosen ? (
            <span className="text-caption font-medium leading-[15px] text-[var(--color-ink-subtle)] lg:text-body-s lg:font-semibold lg:leading-[1.4]">
              {savedChosen ? savedCardHint(savedChosen, locale) : chosen ? methodHint(chosen, locale) : null}
            </span>
          ) : null}
          {summaryNotice ? (
            <span className="text-caption font-medium text-[var(--color-brand-700)] lg:text-body-s">
              {m.checkout.chargedIn} {summaryNotice}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 px-2.5 py-2 text-caption font-extrabold text-[var(--color-brand-500)] lg:text-body-s">
          {m.checkout.change}
        </span>
      </button>

      {/* ONLY THE CHOSEN METHOD'S OWN AREA — the card fields, or what happens next. */}
      {/* NOTHING IS KEPT FOR AN EXIT (HANDBOOK «Motion», rule 8): the old area
          is gone the moment the choice changes — Tap's card form is a
          singleton (`window.CardSDK`, one iframe id), so two copies must never
          coexist. Only the height eases, and the new area fades in. The key
          sits on a wrapper AROUND the area, and `card` is one constant key:
          the card form is remounted exactly when it was before this wrapper
          existed (the area changing away from, or back to, a card). */}
      {chosen && areaVariant ? (
        <AutoHeight animateKey={customerPicked ? areaVariant : "before-a-pick"}>
          <div key={areaVariant} data-method-area="" data-method-variant={areaVariant} className={`flex flex-col gap-3 ${areaMoved ? "cq-fade-in" : ""}`}>
            <MethodArea
              option={chosen}
              wallet={wallet}
              savedChosen={savedChosen}
              locale={locale}
              currency={currency}
              amount={amount}
              signedIn={signedIn}
              saveCard={saveCard}
              onSaveCard={onSaveCard}
              cardHandle={cardHandle}
              onCardValid={onCardValid}
              onCardFallback={onCardFallback}
              // No slot to draw it in: the wallet's button sits under its note.
              walletButton={walletSlot === undefined ? walletPay : null}
            />
          </div>
        </AutoHeight>
      ) : null}

      {walletSlot && walletPay ? createPortal(walletPay, walletSlot) : null}

      {/* THE SHEET. Picked with a tap it closes; with the keyboard, arrows move
          the choice and Enter (or Escape, or «اغلاق») closes it. */}
      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        onClick={(event) => {
          // The dialog element itself is only ever hit on its backdrop: its
          // whole box is covered by the panel inside.
          if (event.target === event.currentTarget) closeSheet();
        }}
        className="cq-sheet m-0 mt-auto max-h-[86dvh] w-full max-w-none overflow-hidden rounded-t-[20px] bg-[var(--background)] p-0 text-[var(--color-ink)] backdrop:bg-[var(--color-backdrop)] lg:m-auto lg:max-h-[80dvh] lg:max-w-[440px] lg:rounded-[20px]"
      >
        <div className="flex max-h-[inherit] flex-col gap-1.5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 lg:pt-5">
          <span aria-hidden className="mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-body-l font-bold leading-[1.5] lg:text-heading-m">
              {m.checkout.chooseMethod}
            </h2>
            <button
              type="button"
              onClick={closeSheet}
              aria-label={m.checkout.dismiss}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-[var(--color-bg-subtle)]"
            >
              <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </button>
          </div>

          <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-1.5">
            {saved.length > 0 ? <SheetHeader>{m.payment.savedCardsTitle}</SheetHeader> : null}
            {saved.map((card, index) => {
              const usable = card.chargeable !== false;
              const fee = index === 0 && cardMethod ? feeLabel(cardMethod, locale) : null;
              return (
                <SheetRow
                  key={`card-${card.public_id}`}
                  data={{ "data-saved-card": card.public_id }}
                  checked={savedChosen?.public_id === card.public_id}
                  disabled={!usable}
                  onPick={() => pickSaved(card)}
                  onDone={closeSheet}
                  logo={<SavedCardLogo card={card} />}
                  title={savedCardName(card)}
                  badge={card.is_default ? m.payment.defaultBadge : null}
                  hint={usable ? savedCardHint(card, locale) : m.payment.reenterCard}
                  fee={fee ? `${m.checkout.fee}: ${fee}` : null}
                />
              );
            })}

            {saved.length > 0 ? <SheetHeader>{m.checkout.otherMethods}</SheetHeader> : null}
            {rows.map((option) => {
              const fee = feeLabel(option, locale);
              const notice = chargeNotice(option, currency, locale);
              const checked = option.code === (wallet ?? method) && !(option.card_sdk && savedChosen);
              return (
                <SheetRow
                  key={option.code}
                  data={{ "data-method": option.code }}
                  checked={checked}
                  disabled={false}
                  onPick={() => pickMethod(option)}
                  onDone={closeSheet}
                  logo={<MethodLogo method={option} currency={currency} />}
                  title={methodName(option, locale)}
                  badge={null}
                  hint={
                    option.card_sdk && saved.length > 0
                      ? `${m.payment.newCard} · ${methodHint(option, locale)}`
                      : methodHint(option, locale)
                  }
                  fee={fee ? `${m.checkout.fee}: ${fee}` : null}
                  notice={notice ? `${m.checkout.chargedIn} ${notice}` : null}
                />
              );
            })}
          </div>
        </div>
      </dialog>
      </div>
    </fieldset>
  );
}

/**
 * Where Apple Pay's button would be, while Tap would refuse its setup
 * (`appleCustomerGap`): it names what is missing — the first name, or an
 * email or phone. A guest is told to type it (a press on the locked pay bar
 * points at the field); an account is sent to its profile, where they are
 * kept. Complete but still settling (`missing` null): the button's own
 * placeholder. No comp: built to the pay bar's 48-tall, 12-corner shape.
 */
function ApplePayNeedsCustomer({ locale, from, missing }: { locale: Locale; from: "checkout" | "account"; missing: "name" | "contact" | null }) {
  const m = messagesFor(locale);
  if (missing === null) {
    return <div aria-hidden className="min-h-[48px] w-full motion-safe:animate-pulse rounded-[12px] bg-[var(--color-chip)]" />;
  }
  const box =
    "flex min-h-[48px] w-full items-center justify-center rounded-[12px] bg-[var(--color-bg-subtle)] px-3 py-2 text-center text-body-s font-semibold leading-[1.4] text-[var(--color-ink-subtle)]";
  if (from === "account") {
    return (
      <Link href={`/${locale}/account/profile`} data-apple-pay-needs={missing} className={`${box} underline underline-offset-4`}>
        {missing === "name" ? m.payment.applePayNeedsAccountName : m.payment.applePayNeedsAccountContact}
      </Link>
    );
  }
  return (
    <p data-apple-pay-needs={missing} className={box}>
      {missing === "name" ? m.payment.applePayNeedsName : m.payment.applePayNeedsContact}
    </p>
  );
}

function SheetHeader({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-caption font-bold text-[var(--color-ink-subtle)]">{children}</p>;
}

/**
 * One choice in the sheet: a real radio (so the group is announced, and the
 * arrows move through it), drawn as the comp's row — the logo tile, the name
 * with its badge, what choosing it means, its fee, and the ring at the end.
 */
function SheetRow({
  data,
  checked,
  disabled,
  onPick,
  onDone,
  logo,
  title,
  badge,
  hint,
  fee,
  notice = null,
}: {
  data: Record<string, string | number>;
  checked: boolean;
  disabled: boolean;
  onPick: () => void;
  onDone: () => void;
  logo: ReactNode;
  title: string;
  badge: string | null;
  hint: string;
  fee: string | null;
  notice?: string | null;
}) {
  return (
    <label
      {...data}
      // A TAP closes the sheet — the current choice included. Read on the
      // LABEL, whose own click carries the tap's `detail` in every engine;
      // the click a browser forwards to the hidden radio need not (WebKit).
      // A keyboard "click" (arrows, Space) bubbles here with `detail` 0 and
      // only moves the choice.
      onClick={(event) => {
        if (event.detail > 0) onDone();
      }}
      className={`flex items-center gap-3 rounded-[12px] p-2 transition-colors duration-200 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-[var(--color-primary)] ${
        checked ? "bg-[var(--color-primary-wash-light)]" : "hover:bg-[var(--color-chip)]"
      } ${disabled ? "cursor-default opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name="payment-choice"
        checked={checked}
        disabled={disabled}
        onChange={onPick}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onDone();
          }
        }}
        className="sr-only"
      />
      {logo}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            dir="auto"
            className={`text-body-s font-extrabold leading-[18px] lg:text-body-l lg:leading-[1.4] lg:font-bold ${checked ? "text-[var(--color-brand-500)]" : "text-[var(--color-ink)]"}`}
          >
            {title}
          </span>
          {badge ? (
            <span className="rounded-full bg-[var(--color-action-disabled-bg)] px-1.5 text-caption-xs font-bold leading-4 text-[var(--color-ink-muted)]">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-caption font-medium leading-[15px] text-[var(--color-ink-subtle)] lg:text-body-s lg:leading-[1.4] lg:font-semibold">{hint}</span>
        {fee ? <span className="text-caption leading-[15px] text-[var(--color-ink-muted)] lg:text-body-s lg:leading-[1.4]">{fee}</span> : null}
        {notice ? <span className="text-caption font-medium leading-[15px] text-[var(--color-brand-700)] lg:text-body-s lg:leading-[1.4]">{notice}</span> : null}
      </span>
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
          checked ? "border-[var(--color-brand-500)]" : "border-[var(--color-line)]"
        }`}
      >
        <span className={`size-2.5 rounded-full ${checked ? "bg-[var(--color-brand-500)]" : ""}`} />
      </span>
    </label>
  );
}

/**
 * Which of MethodArea's shapes is on screen — `card`, `saved:<id>`,
 * `wallet:<code>` or `note:<code>`. MUST follow MethodArea's own branches
 * (same order, same conditions): it keys the area's fade and height easing,
 * and a key that disagreed with the content would animate the wrong change.
 */
export function methodAreaVariant(
  option: PaymentMethodView,
  wallet: WalletCode | null,
  savedChosen: SavedCardView | null,
  amount: string | null,
): string {
  if (wallet) return `wallet:${wallet}`;
  if (savedChosen) return `saved:${savedChosen.public_id}`;
  if (!option.card_sdk || !amount) return `note:${option.code}`;
  return "card";
}

/** What opens under the row. */
function MethodArea({
  option,
  wallet,
  savedChosen,
  locale,
  currency,
  amount,
  signedIn,
  saveCard,
  onSaveCard,
  cardHandle,
  onCardValid,
  onCardFallback,
  walletButton,
}: {
  option: PaymentMethodView;
  wallet: WalletCode | null;
  savedChosen: SavedCardView | null;
  locale: Locale;
  currency: string;
  amount: string | null;
  signedIn: boolean;
  saveCard: boolean;
  onSaveCard: (save: boolean) => void;
  cardHandle: Ref<TapCardHandle>;
  onCardValid: (valid: boolean) => void;
  onCardFallback?: () => void;
  walletButton: ReactNode;
}) {
  const m = messagesFor(locale);

  if (wallet) {
    return (
      <>
        <MethodNote>{m.payment.walletNote}</MethodNote>
        {walletButton}
      </>
    );
  }

  // A saved card: no fields, and the reassurance in the success green.
  if (savedChosen) return <MethodNote secure>{m.payment.secureShort}</MethodNote>;

  const cardSdk = option.card_sdk ?? null;
  if (!cardSdk || !amount) {
    return (
      <MethodNote>
        {option.type === "manual_transfer"
          ? m.payment.transferNext
          : option.code === "benefit_pay"
            ? m.payment.benefitPayNext
            : m.payment.hostedNext}
      </MethodNote>
    );
  }

  // The card block (`7416:42433` / «Checkout Mobile»): Background/subtle,
  // 12px corners and padding — Tap's fields, then the consent.
  return (
    <div className="flex flex-col gap-3 rounded-[12px] bg-[var(--color-bg-subtle)] p-3">
      <TapCardForm
        handle={cardHandle}
        locale={locale}
        sdk={cardSdk}
        amount={amount}
        currency={currency}
        onValidChange={onCardValid}
        onFallback={onCardFallback}
      />

      {/* NO «نحن ندعم» ROW OF OUR OWN: Tap's form draws the accepted schemes
          inside its own frame (`displayPaymentBrands`), and a second row of
          the same marks under it read as a mistake. */}

      {/* Consent, UNCHECKED by default, only for an account the card could be
          saved to, and only while saving is switched on — a tick that cannot
          save anything is not offered. The server keeps a card only if this
          was ticked AND the bank verified it (3-D Secure). */}
      {signedIn && cardSdk.save_card ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-[8px] bg-[var(--color-surface)] p-3">
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="block text-caption font-extrabold leading-4 text-[var(--color-ink)] lg:text-body-s lg:font-bold lg:leading-[1.4]">
              {m.payment.saveCardConsent}
            </span>
            <span className="block text-caption-xs font-medium leading-[15px] text-[var(--color-ink-subtle)] lg:text-caption lg:leading-[1.5]">
              {m.payment.saveCardNote}
            </span>
          </span>
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(event) => onSaveCard(event.target.checked)}
            className="grid size-6 shrink-0 cursor-pointer appearance-none place-items-center rounded-[8px] border border-[var(--color-brand-500)] bg-[var(--color-surface)] checked:bg-[var(--color-brand-500)] checked:[background-image:url(/brand/icon-check-white.svg)] checked:bg-center checked:bg-no-repeat"
          />
        </label>
      ) : null}
    </div>
  );
}

/** A line under the row saying what happens next — with the lock, green when it reassures. */
function MethodNote({ children, secure = false }: { children: ReactNode; secure?: boolean }) {
  return (
    <p
      className={`flex items-start gap-2 text-caption leading-[1.6] lg:text-body-s ${
        secure ? "font-bold text-[var(--color-success)]" : "text-[var(--color-ink-muted)]"
      }`}
    >
      <span
        aria-hidden
        className="mt-[3px] block size-3.5 shrink-0 bg-current [mask-image:url(/brand/icon-lock.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
      />
      <span>{children}</span>
    </p>
  );
}

export function methodName(method: PaymentMethodView, locale: Locale): string {
  return method.name[locale] ?? method.name.en ?? method.code;
}

/** The line under a method's name — what choosing it means. */
function methodHint(method: PaymentMethodView, locale: Locale): string {
  const m = messagesFor(locale);
  const note = methodNote(method, locale);
  if (note) return note;
  if (method.code === "google_pay") return m.payment.methodHintGooglePay;
  if (method.code === "apple_pay") return m.payment.methodHintApplePay;
  if (method.type === "manual_transfer") return m.payment.methodHintTransfer;
  if (method.code === "benefit_pay") return m.payment.methodHintBenefitPay;
  if (method.card_sdk) return m.payment.methodHintCard;
  return m.payment.methodHintHosted;
}

/** «Visa •••• 4242», or the customer's own name for the card. */
function savedCardName(card: SavedCardView): string {
  return `${card.nickname || card.brand} •••• ${card.last_four}`;
}

/** «صالحة حتى 08/27» — or nothing to say when the gateway gave no expiry. */
function savedCardHint(card: SavedCardView, locale: Locale): string {
  const m = messagesFor(locale);
  if (!card.expiry_month || !card.expiry_year) return m.payment.methodHintCard;
  // U+2066/U+2069 isolate the date LTR inside the Arabic sentence.
  return m.payment.cardExpiry.replace("{expiry}", `⁦${card.expiry_month.padStart(2, "0")}/${card.expiry_year.slice(-2)}⁩`);
}

const TILE = "flex h-10 w-14 shrink-0 items-center justify-center rounded-[8px] bg-[var(--color-action-disabled-bg)] px-2";
const GLYPH = "bg-[var(--color-ink)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]";

function CardGlyphTile() {
  return (
    <span className={TILE}>
      <span aria-hidden className={`block h-[14.58px] w-[17.92px] ${GLYPH} [mask-image:url(/brand/icon-card.svg)]`} />
    </span>
  );
}

/** A saved card's scheme mark, where it is one we ship; the card glyph otherwise. */
function SavedCardLogo({ card }: { card: SavedCardView }) {
  const brand = card.brand.toLowerCase();
  const mark = brand.includes("visa")
    ? { src: "/brand/visa.svg", width: 38, height: 12 }
    : brand.includes("master")
      ? { src: "/brand/mastercard.svg", width: 26, height: 16 }
      : null;
  if (!mark) return <CardGlyphTile />;
  return (
    <span className={TILE}>
      <Image src={mark.src} width={mark.width} height={mark.height} alt="" aria-hidden {...ABOVE_FOLD_IMAGE} className="cq-mark-plate h-auto max-h-4 w-auto" />
    </span>
  );
}

/**
 * The logo tile: the method's own mark where one exists, the bank and card
 * glyphs in the text colour (so they read in both themes) otherwise.
 * Decorative — the name beside it carries the meaning.
 */
export function MethodLogo({ method, currency }: { method: PaymentMethodView; currency?: string }) {
  // The method's own logo (Binance Pay, NAPS, BenefitPay; SEPA on a euro
  // transfer) — `lib/checkout/method-logos.ts` decides which method has one.
  const own = methodLogo(method, currency);
  if (own) {
    return (
      <span className={TILE}>
        <Image src={own.mark.src} width={own.mark.width} height={own.mark.height} alt="" aria-hidden {...ABOVE_FOLD_IMAGE} className="cq-mark-plate cq-mark-plate-tight" />
      </span>
    );
  }
  // The two wallet marks are files from public/, served as themselves, never
  // through `/_next/image` (HANDBOOK §7 item 8). Google Pay's is GOOGLE'S OWN
  // acceptance mark, whole and unaltered (its Pay API review, 2026-10-23):
  // never cropped, no plate — it carries its own white ground and outline.
  if (method.code === "google_pay") {
    return (
      <span className={TILE}>
        <Image src="/brand/google-pay-mark.svg" width={39} height={24} alt="" aria-hidden {...ABOVE_FOLD_IMAGE} unoptimized className="h-6 w-auto" />
      </span>
    );
  }
  if (method.code === "apple_pay") {
    return (
      <span className={`${TILE} cq-mark-plate`}>
        <Image src="/brand/method-apple-pay.png" width={35} height={14} alt="" aria-hidden {...ABOVE_FOLD_IMAGE} unoptimized className="h-[14px] w-[35px] object-cover" />
      </span>
    );
  }
  if (method.type === "manual_transfer") {
    return (
      <span className={TILE}>
        <span aria-hidden className={`block size-6 ${GLYPH} [mask-image:url(/brand/method-bank.svg)]`} />
      </span>
    );
  }
  const marks = schemeMarks(method.code);
  if (method.card_sdk || marks.length > 0) {
    // Both schemes side by side inside the 56px tile: each at 70% of its
    // own drawn height (Visa 8, Mastercard 11), on the tight dark-theme plate
    // — at full size, plated, the pair ran 22px past the tile's edges.
    return (
      <span className={`${TILE} gap-[3px] px-0`}>
        {marks.length > 0 ? (
          marks.map((mark) => {
            const height = Math.round(mark.height * 0.7);
            return (
              <Image
                key={mark.src}
                src={mark.src}
                width={Math.round((mark.width * height) / mark.height)}
                height={height}
                alt=""
                aria-hidden
                {...ABOVE_FOLD_IMAGE}
                className="cq-mark-plate cq-mark-plate-tight"
              />
            );
          })
        ) : (
          <Image src="/brand/method-visa.svg" width={36} height={16} alt="" aria-hidden {...ABOVE_FOLD_IMAGE} className="h-4 w-[35.93px]" />
        )}
      </span>
    );
  }
  return <CardGlyphTile />;
}

/**
 * The pay button's words for the chosen method — what pressing it will do.
 * The amount is the server's, already formatted by the caller.
 */
export function payLabel(
  locale: Locale,
  method: PaymentMethodView | undefined,
  formattedAmount: string | null,
): string {
  const m = messagesFor(locale);
  if (!method) return m.checkout.placeOrder;
  if (method.type === "manual_transfer") return m.payment.continueTransfer;
  if (method.code === "benefit_pay") return m.payment.continueBenefitPay;
  if (method.card_sdk) return formattedAmount ? m.payment.payAmount.replace("{amount}", formattedAmount) : m.payment.payNow;
  return m.payment.continueToPayment;
}
