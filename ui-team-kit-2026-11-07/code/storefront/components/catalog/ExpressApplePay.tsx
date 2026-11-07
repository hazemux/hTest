"use client";

import { unstable_rethrow } from "next/navigation";
import { use, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { ApplePayButton, applePaySupported, type ApplePayConfig } from "@/components/checkout/payment/ApplePayButton";
import { payExpressWithApplePay, quoteExpressBuy, type ExpressPayResult } from "@/lib/catalog/express-buy";
import { recoverFromDeploySkew } from "@/lib/navigation/deploy-skew";
import { attemptFor, type PlacementAttempt } from "@/lib/checkout/attempt-key";
import type { Money } from "@/lib/checkout/price-delta";
import { SheetRefusal } from "@/lib/checkout/sheet-refusal";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { failedBeforeAnyAttempt, reportPaymentSignal, reportPaymentSignalUnlessLeft, walletFailureTags } from "@/lib/monitoring/payment-signal";
import { appleCustomerGap, type CheckoutContact } from "@/lib/wallets/apple-customer";
import { useExpressDropSignal } from "@/lib/wallets/express-drop";
import { walletFeeLines, walletFeeNote, type QuotedLine } from "@/lib/wallets/express-fee";

export interface ExpressApplePayOffer {
  /** The `apple_pay` method's public wallet configuration (`GET /payment-methods`). */
  config: ApplePayConfig;
  /** The signed-in customer — Apple Pay's `customer`. */
  contact: CheckoutContact;
  /**
   * The currency the gateway's list was asked for and Apple Pay qualified in
   * (the opening pack's, which `apple_pay.charge_currency` matched). A pack
   * priced in another currency is NOT offered on the strength of it: that
   * rail might charge in a currency the button never says (HANDBOOK §1), so
   * «شراء سريع» — whose checkout says it — stands in.
   */
  currency: string;
}

/**
 * Apple Pay once the server's offer has landed (`use` suspends this slot, and
 * only this slot, until it does — the product page draws it inside its own
 * `<Suspense>` whose fallback is «شراء سريع»). Null — a guest, or a line being
 * completed — draws the ordinary button at once.
 */
export function ExpressSlot({
  offer,
  ...rest
}: Omit<React.ComponentProps<typeof ExpressApplePay>, "offer"> & { offer: Promise<ExpressApplePayOffer | null> | null }) {
  return <ExpressApplePay {...rest} offer={offer ? use(offer) : null} />;
}

function noSubscription(): () => void {
  return () => undefined;
}

/**
 * «شراء سريع» — or, where it can work, Apple Pay in its place (owner,
 * 2026-10-01).
 *
 * APPLE PAY WHERE IT CAN PAY: this browser can pay with Apple Pay; the
 * gateway offers it for this currency (the page passed an `offer`, which
 * exists only when `GET /payment-methods` listed `apple_pay` with its wallet
 * configuration); and a signed-in customer whose account has a first name
 * and an email or a phone (Tap's setup refuses one without). Then Apple's button stands in
 * «شراء سريع»'s place from the first paint (owner, 2026-10-02).
 *
 * ITS SHEET OPENS ONLY ON THE SERVER'S FIGURE. The server cannot price a line
 * without its required fields, and Apple's sheet must show what will be
 * charged (`quoteExpressBuy`) — so until the form is complete and quoted, a
 * press lands on a cover of ours that points at the missing field
 * (`reportValidity`) instead of opening a sheet.
 *
 * After the sheet: the order is placed and charged on the server
 * (`payExpressWithApplePay`), which goes on to the payment's result. A total
 * that moved is never charged — the new one is shown and the next sheet
 * carries it.
 */
export function ExpressApplePay({
  locale,
  offer,
  form,
  option,
  fields,
  listed,
  fallback,
  onNotice,
  goodsLabel,
  onFeeNote,
}: {
  locale: Locale;
  offer: ExpressApplePayOffer | null;
  /** The product form, whose own validity says whether the line is complete. */
  form: React.RefObject<HTMLFormElement | null>;
  option: string | null;
  fields: Record<string, string | undefined>;
  /** The selected package's catalogue price — drawn on the button until the quote lands. */
  listed: Money | null;
  /** The ordinary «شراء سريع». */
  fallback: React.ReactNode;
  /**
   * What the button has to say (a failed or cancelled sheet, a new total, an
   * unconfirmed order), or null to clear it. DRAWN BY THE BUY BAR on its own
   * line under the buttons — never here: this sits in the buttons' row, and
   * a sentence beside them squeezed «أضف للسلة» and «شراء سريع» into
   * overlapping pills (owner, iPhone, 2026-10-14).
   */
  onNotice: (text: string | null) => void;
  /** The goods' line in the wallet's sheet — the product and its package, as the buy bar names them. */
  goodsLabel?: string;
  /** The processing fee this wallet adds, as one sentence for the buy bar — or null to clear it (owner, 2026-10-17). */
  onFeeNote?: (text: string | null) => void;
}) {
  const m = messagesFor(locale);
  const canPay = useSyncExternalStore(noSubscription, applePaySupported, () => false);
  const [quote, setQuote] = useState<{ key: string; money: QuotedLine } | null>(null);
  const setNotice = onNotice;
  // Why «شراء سريع» took this place back, or null while Apple Pay stands.
  const [brokenBy, setBrokenBy] = useState<"quote_none" | "quote_rejected" | "sdk_error" | null>(null);
  const broken = brokenBy !== null;
  const [paying, startPaying] = useTransition();
  // This line's checkout attempt — kept until the API answers for certain or
  // the line changes (`lib/checkout/attempt-key.ts`).
  const attempt = useRef<PlacementAttempt | null>(null);

  // Only in the currency the offer qualified in (`ExpressApplePayOffer.currency`),
  // and only for an account with a first name and an email or a phone: Tap
  // refuses Apple Pay's setup otherwise (1130/1139, `appleCustomerGap`), so
  // such an account gets «شراء سريع» exactly as where Apple Pay cannot pay —
  // no notice, no failed setup. Its checkout says what to add.
  const offered =
    offer !== null && canPay && !broken && option !== null && listed !== null && listed.currency === offer.currency && appleCustomerGap(offer.contact) === null;
  const filled = Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const lineKey = JSON.stringify([option, filled]);

  // A button that was drawn and then went away for a failed quote says which
  // (an SDK error is already `express_pay_failed`).
  useExpressDropSignal("apple_pay", offered, brokenBy === "sdk_error" ? null : brokenBy);

  // Priced once the form is complete and has settled for a moment — not per
  // keystroke in the player ID.
  useEffect(() => {
    if (!offered) return;
    // Keyed on the serialised line, so a re-render with the same choices
    // (a quote arriving) does not ask again.
    const [chosen, typed] = JSON.parse(lineKey) as [string, Record<string, string>];
    const timer = window.setTimeout(() => {
      if (!formComplete(form.current)) return;
      void quoteExpressBuy({ locale, option: chosen, fields: typed }).then(
        (money) => {
          // A complete line the server will not price: Apple Pay cannot show
          // its figure, so «شراء سريع» comes back rather than a dead button.
          if (money) setQuote({ key: lineKey, money });
          else setBrokenBy("quote_none");
        },
        // No answer at all — the network, or a response the router could
        // not read (Sentry CHARGERQUICK-STOREFRONT-F, iPhone Safari): the
        // same, never an unhandled rejection under a button priced by nothing.
        // UNLESS this page is from an older release than the server (deploy
        // skew, 2026-10-16: «Server Action unavailable»): no sheet is open and
        // nothing ran, so the page reloads ONCE onto the new release and
        // Apple Pay comes back — rather than quietly giving way to «شراء سريع».
        (error: unknown) => {
          if (recoverFromDeploySkew(error)) return;
          setBrokenBy("quote_rejected");
        },
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [offered, lineKey, locale, form]);

  const current = offered && quote?.key === lineKey ? quote.money : null;
  // THE FEE, SAID BEFORE THE SHEET (owner, 2026-10-17): the bar's own line
  // names this wallet's total and its «رسوم المعالجة», from the server's
  // quote — and is cleared whenever the button goes or the line changes.
  const feeNote = walletFeeNote(locale, "Apple Pay", current);
  useEffect(() => {
    onFeeNote?.(feeNote);
    return () => onFeeNote?.(null);
  }, [onFeeNote, feeNote]);
  const sheetLines = walletFeeLines(locale, current, goodsLabel ?? "");
  // The drawing's figure: the quote, else the package's own price — never
  // charged, because the sheet cannot open until `current` exists.
  const drawn = current ?? listed;
  if (!offered || !drawn) return fallback;

  return (
    <div className="flex min-w-0 flex-1 flex-col px-3">
      {/* THE SAME SHARE OF THE BAR AS «شراء سريع», whose place this takes: a
          flex item with a zero basis never shrinks below its own padding, so
          the bar's buttons (px-3, BAR_BUTTON) win 24px over a wrapper with
          none — the wallet came out ~26px narrower than «أضف للسلة» on a
          360px phone (owner, 2026-10-16). The wrapper carries the same px-3;
          the button inside takes it back (-mx-3) and fills the slot. */}
      {/* INSIDE THE PRODUCT FORM: a button Tap draws without a `type` would
          submit it — a reload, or an add to the basket nobody asked for.
          Its default is cancelled here; Tap's own handler still runs. */}
      <div
        className={`relative -mx-3 ${paying ? "pointer-events-none opacity-60" : ""}`}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("button, input[type=submit]")) event.preventDefault();
        }}
      >
        <ApplePayButton
          items={sheetLines}
          locale={locale}
          config={offer.config}
          amount={drawn.amount}
          currency={drawn.currency}
          contact={offer.contact}
          onToken={(token, shown) => {
            setNotice(null);
            if (!current) return Promise.reject(new Error("not priced"));
            // A payment that started LEAVES this page (the action redirects),
            // so this only ever rejects: an answer here is a refusal, and
            // Apple's sheet says so. A leaving page settles by the button's cap.
            return new Promise<void>((_started, reject) =>
              startPaying(async () => {
                // The figure the SHEET showed is the one compared, never a
                // newer quote the sheet did not display.
                // Kept across a price change too: that order exists, and the
                // next tap must pay IT rather than place a second. The
                // currency is in it because the API's fingerprint is: a
                // visitor who switched it is asking for another order.
                attempt.current = attemptFor(attempt.current, JSON.stringify([lineKey, listed?.currency ?? null]));
                let result: ExpressPayResult;
                try {
                  result = await payExpressWithApplePay({
                    locale,
                    option: option!,
                    fields: filled,
                    token,
                    shownTotal: shown,
                    attemptKey: attempt.current.key,
                  });
                } catch (error) {
                  // A redirect IS the payment going on to its result: Next's
                  // own signal, rethrown so its router follows it.
                  unstable_rethrow(error);
                  // No readable answer (the network, or a response the router
                  // could not read — Sentry CHARGERQUICK-STOREFRONT-F): the
                  // order may exist, even charged, and only the server can
                  // say. Treated exactly as `unsettled`: nothing is retried
                  // and nothing claims "not charged"; the attempt is KEPT and
                  // Apple Pay STAYS, so a second tap replays the same
                  // Idempotency-Key and the API answers with the first order.
                  // «شراء سريع» does NOT come back: its checkout mints a new
                  // key, and a second paid order would be reachable (payments
                  // review, 2026-10-13).
                  reportPaymentSignal("express_pay_unreadable", { sdk: "apple_pay", stage: "pay" });
                  setNotice(m.checkout.placementUnsettled);
                  reject(new SheetRefusal("unsettled"));
                  return;
                }
                if (result.reason === "price_changed") {
                  setQuote({ key: lineKey, money: result.delta.charged });
                  setNotice(`${m.payment.walletPriceChanged} ${formatMoney(locale, result.delta.charged.amount, result.delta.charged.currency)}`);
                } else if (result.reason === "unsettled") {
                  setNotice(m.checkout.placementUnsettled);
                } else if (result.reason === "restart") {
                  attempt.current = null;
                  setNotice(m.checkout.placementUnsettled);
                } else {
                  // Refused for certain: nothing was placed under this key.
                  attempt.current = null;
                  setNotice(result.message ?? m.payment.walletFailed);
                }
                reject(new SheetRefusal(result.reason ?? "payment"));
              }),
            );
          }}
          onCancel={(sheet) => {
            // Apple's sheet stays open on a payment we refused, and closing
            // it then is a cancel: the notice that payment set (a new total,
            // an unconfirmed order) stays — "nothing was charged" is true
            // only of a sheet that never handed a token over, while no
            // earlier sheet's order is still unanswered (the kept attempt).
            if (!sheet.afterToken && attempt.current === null) setNotice(m.payment.walletCancelled);
          }}
          onError={(failure) => {
            // WHY, in Sentry (the owner's failed sheet, 2026-10-14, left no
            // trace): the button's report died when this answer unmounted
            // it, so it is made here. Held for the page-leave grace only (#79).
            reportPaymentSignalUnlessLeft("express_pay_failed", {
              sdk: "apple_pay",
              stage: "sdk_error",
              outcome: failure.where,
              ...walletFailureTags(failure),
            });
            // After a token — this sheet's, or an earlier one whose order is
            // still unanswered (the kept attempt) — the payment's own answer
            // stands: it may have started, so no "nothing was charged", and
            // Apple Pay stays: «شراء سريع» would mint a new attempt and a
            // second paid order (payments review, 2026-10-13).
            if (failure.afterToken || attempt.current !== null) return;
            // Merchant or domain refused, or the SDK failed before any
            // payment: «شراء سريع» is back, and nothing was charged.
            setBrokenBy("sdk_error");
            // A button that never set itself up (Tap's profile call failed
            // while the page loaded) is an availability problem, not a
            // payment: nobody pressed anything, so nothing is said — «payment
            // failed» on landing misleads (owner, 2026-10-21). Only a press
            // earns the notice.
            if (!failedBeforeAnyAttempt(failure)) setNotice(m.payment.walletFailed);
          }}
        />
        {/* Not complete or not priced yet: the press shows what is missing. */}
        {current ? null : (
          <button
            type="button"
            data-express-pending
            aria-label={m.product.fieldsFirst}
            onClick={() => form.current?.reportValidity()}
            className="absolute inset-0 z-10 cursor-pointer rounded-[12px]"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Whether every control in the form is valid — read from each control's
 * `validity`, never `checkValidity()`: that fires `invalid` events, and the
 * fields would turn red before the customer had touched them.
 */
function formComplete(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  return [...form.elements].every((element) => !("validity" in element) || (element as HTMLInputElement).validity.valid);
}
