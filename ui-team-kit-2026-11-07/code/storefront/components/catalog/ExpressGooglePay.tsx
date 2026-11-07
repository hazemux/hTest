"use client";

import { unstable_rethrow } from "next/navigation";
import { use, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { applePaySupported } from "@/components/checkout/payment/ApplePayButton";
import { GooglePayButton, googlePayReady, type GooglePayConfig } from "@/components/checkout/payment/GooglePayButton";
import { payExpressWithGooglePay, quoteExpressBuy, type ExpressPayResult } from "@/lib/catalog/express-buy";
import { attemptFor, type PlacementAttempt } from "@/lib/checkout/attempt-key";
import type { Money } from "@/lib/checkout/price-delta";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { failedBeforeAnyAttempt, reportPaymentSignal, reportPaymentSignalUnlessLeft, walletFailureTags } from "@/lib/monitoring/payment-signal";
import { recoverFromDeploySkew } from "@/lib/navigation/deploy-skew";
import { useExpressDropSignal } from "@/lib/wallets/express-drop";
import { walletFeeLines, walletFeeNote, type QuotedLine } from "@/lib/wallets/express-fee";

export interface ExpressGooglePayOffer {
  /** The `google_pay` method's public wallet configuration (`GET /payment-methods`). */
  config: GooglePayConfig;
  /**
   * The currency the gateway's list was asked for and Google Pay qualified in
   * (Tap's Google Pay list: AED, OMR, KWD, QAR, BHD, USD — never SAR). A pack
   * priced in another currency is NOT offered on the strength of it — as
   * Apple Pay's offer (`ExpressApplePayOffer.currency`).
   */
  currency: string;
}

/**
 * Google Pay once the server's offer has landed (`use` suspends this slot
 * only). Null — a guest, or a line being completed — draws the fallback.
 */
export function ExpressGoogleSlot({
  offer,
  ...rest
}: Omit<React.ComponentProps<typeof ExpressGooglePay>, "offer"> & { offer: Promise<ExpressGooglePayOffer | null> | null }) {
  return <ExpressGooglePay {...rest} offer={offer ? use(offer) : null} />;
}

/** The pause before a failed quote is asked once more. */
export const QUOTE_RETRY_MS = 1_500;

function noSubscription(): () => void {
  return () => undefined;
}

/**
 * «شراء سريع» — or, on Android, GOOGLE PAY in its place (owner, 2026-10-14),
 * under exactly the rules Apple Pay's express button keeps
 * (`ExpressApplePay`):
 *
 * WHERE IT CAN PAY: a signed-in customer (the page passes an `offer` only for
 * one); the gateway offers Google Pay for this currency and country (the
 * offer exists only when `GET /payment-methods` listed `google_pay`); Google
 * says this browser can pay (`isReadyToPay`, asked before anything is drawn);
 * and NOT where Apple Pay can — that browser gets Apple Pay's button, and
 * this one is only ever Apple Pay's fallback. Never both.
 *
 * ITS SHEET OPENS ONLY ON THE SERVER'S FIGURE: until the form is complete and
 * quoted WITH `google_pay` (its fee included), a press lands on a cover that
 * points at the missing field. A total that moved is never charged.
 *
 * ONE ORDER PER ATTEMPT: the same attempt key until the API answers for
 * certain (`lib/checkout/attempt-key.ts`) — an unsettled or unreadable answer
 * keeps it AND Google Pay, so the next tap replays the first order rather
 * than placing a second; «شراء سريع» does not come back then (its checkout
 * mints a new key).
 *
 * 3-D SECURE: a card that needs it comes back from Tap INITIATED with the
 * bank's page, and the server action LEAVES for it (`startPayment`), as for
 * Apple Pay. What it has to say goes to the buy bar's own line (`onNotice`).
 */
export function ExpressGooglePay({
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
  offer: ExpressGooglePayOffer | null;
  /** The product form, whose own validity says whether the line is complete. */
  form: React.RefObject<HTMLFormElement | null>;
  option: string | null;
  fields: Record<string, string | undefined>;
  /** The selected package's catalogue price — what Google's button stands for until the quote lands. */
  listed: Money | null;
  /** The ordinary «شراء سريع». */
  fallback: React.ReactNode;
  /** What the button has to say, or null to clear it — drawn by the buy bar on its own line. */
  onNotice: (text: string | null) => void;
  /** The goods' line in the wallet's sheet — the product and its package, as the buy bar names them. */
  goodsLabel?: string;
  /** The processing fee this wallet adds, as one sentence for the buy bar — or null to clear it (owner, 2026-10-17). */
  onFeeNote?: (text: string | null) => void;
}) {
  const m = messagesFor(locale);
  // Apple Pay's browser gets Apple Pay's button; this one stays out of it.
  const appleHere = useSyncExternalStore(noSubscription, applePaySupported, () => false);
  const [ready, setReady] = useState<{ config: GooglePayConfig; can: boolean } | null>(null);
  const [quote, setQuote] = useState<{ key: string; money: QuotedLine } | null>(null);
  const setNotice = onNotice;
  // Google's SDK failed before any payment: «شراء سريع» for the rest of the visit.
  const [sdkBroken, setSdkBroken] = useState(false);
  // The line Google Pay could not be priced for, and why — only THAT line:
  // changing it asks again (re-armed), so one bad answer is not the visit's.
  const [quoteFailed, setQuoteFailed] = useState<{ key: string; why: "quote_none" | "quote_rejected" } | null>(null);
  const [paying, startPaying] = useTransition();
  const attempt = useRef<PlacementAttempt | null>(null);

  const config = offer?.config ?? null;
  useEffect(() => {
    if (!config || appleHere) return;
    let live = true;
    void googlePayReady(config).then((can) => {
      if (live) setReady({ config, can });
    });
    return () => {
      live = false;
    };
  }, [config, appleHere]);
  // Google's answer for THIS config; a new offer object (a re-render) is
  // asked again — not ready yet, which is not Google saying no.
  const answered = ready !== null && ready.config === config;
  const canPay = answered && ready.can;

  const filled = Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const lineKey = JSON.stringify([option, filled]);
  const quoteBroken = quoteFailed !== null && quoteFailed.key === lineKey ? quoteFailed.why : null;
  const broken = sdkBroken || quoteBroken !== null;

  const offered = offer !== null && !appleHere && canPay && !broken && option !== null && listed !== null && listed.currency === offer.currency;

  // A button that was drawn and then went away for a FAILURE says which.
  useExpressDropSignal("google_pay", offered, quoteBroken ?? (answered && !ready.can ? "cannot_pay" : null));

  // Priced with Google Pay once the form is complete and has settled for a
  // moment — not per keystroke. A failed ask is asked ONCE more after a pause:
  // a blip (the network, a stale rate, a deploy) must not take the button
  // away for the visit — the owner's «appeared and vanished», 2026-10-16.
  useEffect(() => {
    if (!offered) return;
    const [chosen, typed] = JSON.parse(lineKey) as [string, Record<string, string>];
    let timer = 0;
    let cancelled = false;
    const ask = (retriesLeft: number, delay: number) => {
      timer = window.setTimeout(() => {
        if (!formComplete(form.current)) return;
        const failed = (why: "quote_none" | "quote_rejected") => {
          if (cancelled) return;
          if (retriesLeft > 0) ask(retriesLeft - 1, QUOTE_RETRY_MS);
          // Still no price: «شراء سريع» comes back — for this line only.
          else setQuoteFailed({ key: lineKey, why });
        };
        void quoteExpressBuy({ locale, option: chosen, fields: typed, wallet: "google_pay" }).then(
          (money) => {
            if (money) setQuote({ key: lineKey, money });
            else failed("quote_none");
          },
          // No answer at all: the same, never an unhandled rejection —
          // UNLESS this page is from an older release than the server
          // (deploy skew, 2026-10-16: «Server Action unavailable»). Nothing
          // ran and no sheet is open, so the page reloads ONCE onto the new
          // release (`recoverFromDeploySkew`, as Apple Pay's quote does)
          // rather than asking again an action the server does not have.
          (error: unknown) => {
            if (recoverFromDeploySkew(error)) return;
            failed("quote_rejected");
          },
        );
      }, delay);
    };
    ask(1, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [offered, lineKey, locale, form]);

  const current = offered && quote?.key === lineKey ? quote.money : null;
  // THE FEE, SAID BEFORE THE SHEET (owner, 2026-10-17): the bar's own line
  // names this wallet's total and its «رسوم المعالجة», from the server's
  // quote — and is cleared whenever the button goes or the line changes.
  const feeNote = walletFeeNote(locale, "Google Pay", current);
  useEffect(() => {
    onFeeNote?.(feeNote);
    return () => onFeeNote?.(null);
  }, [onFeeNote, feeNote]);
  const sheetLines = walletFeeLines(locale, current, goodsLabel ?? "");
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
      {/* INSIDE THE PRODUCT FORM: Google's button is a `<button>`, and one
          without a `type` would submit it. Its default is cancelled here;
          Google's own handler still runs (and opens the sheet in the click). */}
      <div
        className={`relative -mx-3 min-h-12 ${paying ? "pointer-events-none opacity-60" : ""}`}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("button, input[type=submit]")) event.preventDefault();
        }}
      >
        <GooglePayButton
          items={sheetLines}
          compact
          locale={locale}
          config={offer.config}
          amount={drawn.amount}
          currency={drawn.currency}
          disabled={!current || paying}
          onToken={(token, shown) => {
            setNotice(null);
            if (!current) return Promise.reject(new Error("not priced"));
            // A payment that started LEAVES this page (the action redirects),
            // so this only ever rejects: an answer here is a refusal. Google's
            // sheet is already closed — the bar's line says what happened.
            return new Promise<void>((_started, reject) =>
              startPaying(async () => {
                // The figure the SHEET showed is the one compared. Kept across
                // a price change too: that order exists, and the next tap must
                // pay IT rather than place a second.
                attempt.current = attemptFor(attempt.current, JSON.stringify([lineKey, listed?.currency ?? null]));
                let result: ExpressPayResult;
                try {
                  result = await payExpressWithGooglePay({
                    locale,
                    option: option!,
                    fields: filled,
                    token,
                    shownTotal: shown,
                    attemptKey: attempt.current.key,
                  });
                } catch (error) {
                  // A redirect IS the payment going on to its result (a
                  // capture, or the bank's 3-D Secure page).
                  unstable_rethrow(error);
                  // No readable answer: the order may exist, even charged.
                  // Exactly `unsettled` — the attempt and Google Pay are KEPT.
                  reportPaymentSignal("express_pay_unreadable", { sdk: "google_pay", stage: "pay" });
                  setNotice(m.checkout.placementUnsettled);
                  reject(new Error("unsettled"));
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
                reject(new Error(result.reason ?? "payment"));
              }),
            );
          }}
          onCancel={(sheet) => {
            // Google's sheet closes before any token is handed over; "nothing
            // was charged" only while no earlier sheet's order is unanswered.
            if (!sheet.afterToken && attempt.current === null) setNotice(m.payment.walletCancelled);
          }}
          onError={(failure) => {
            reportPaymentSignalUnlessLeft("express_pay_failed", {
              sdk: "google_pay",
              stage: "sdk_error",
              outcome: failure.where,
              ...walletFailureTags(failure),
            });
            // An earlier order still unanswered (the kept attempt): its
            // answer stands, and Google Pay stays — «شراء سريع» would mint a
            // new attempt and a second paid order.
            if (failure.afterToken || attempt.current !== null) return;
            setSdkBroken(true);
            // Nothing pressed, nothing to say (see Apple Pay's `onError`).
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

/** Whether every control in the form is valid — read from `validity`, never `checkValidity()` (no `invalid` events). */
function formComplete(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  return [...form.elements].every((element) => !("validity" in element) || (element as HTMLInputElement).validity.valid);
}
