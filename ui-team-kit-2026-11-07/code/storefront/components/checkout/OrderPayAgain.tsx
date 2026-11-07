"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { canCheckInPage } from "@/lib/checkout/bank-check";
import { leaveForPayment } from "@/lib/checkout/leave-for-payment";
import { isRedirectSignal } from "@/lib/checkout/navigation-signal";
import { failureSentence, shownGatewayReason } from "@/lib/checkout/failure-copy";
import { openingMethod, type PaymentMethodView } from "@/lib/checkout/methods";
import { payExistingOrder, type PaymentInstrument, type StartPaymentResult } from "@/lib/checkout/payment";
import type { Money } from "@/lib/checkout/price-delta";
import { SheetRefusal } from "@/lib/checkout/sheet-refusal";
import type { Locale } from "@/lib/i18n/locales";
import type { CheckoutContact } from "@/lib/wallets/apple-customer";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";

import { BankCheckSheet } from "./BankCheckSheet";
import { BenefitPayStage } from "./payment/BenefitPayStage";
import { PaymentSection, type SavedCardView, type WalletCode } from "./payment/PaymentSection";
import { CTA_BUTTON } from "./styles";
import type { TapCardHandle } from "./TapCardForm";

/**
 * «ادفع الآن» for an order that is still waiting — on its own page, with every
 * way the server offers for it: Apple Pay and Google Pay where this device
 * and the order's currency allow, a saved card (signed in), a new card, and
 * BenefitPay for a Bahrain order in BHD.
 *
 * The SAME ORDER, every time, through the same `POST /orders/{id}/pay` the
 * checkout uses: each press is a new attempt on this order, never a second
 * order, and Laravel refuses to start one while another is still open at the
 * gateway. The amount is the order's own frozen total; nothing here prices.
 *
 * `methods` is what the server listed for this order's currency and the
 * visitor's country, narrowed by the page to the ones that can pay an order
 * that already exists (no bank transfer — that is chosen at checkout).
 */
export function OrderPayAgain({
  locale,
  orderId,
  methods,
  amount,
  currency,
  signedIn,
  savedCards,
  lastFailure,
  contact = null,
}: {
  locale: Locale;
  orderId: string;
  methods: PaymentMethodView[];
  /** The order's own total, as the server states it. */
  amount: string;
  currency: string;
  signedIn: boolean;
  savedCards: SavedCardView[];
  /** Why the previous attempt failed, as Laravel read it from the gateway. */
  lastFailure?: string | null;
  /** The signed-in customer's own contact, for Apple Pay's required `customer`. */
  contact?: CheckoutContact | null;
}) {
  const m = messagesFor(locale);
  const router = useRouter();
  const card = useRef<TapCardHandle>(null);
  // The first method that pays from OUR button; with none, the wallets
  // themselves are the only buttons.
  const firstChoice = openingMethod(methods);
  const [method, setMethod] = useState(firstChoice?.code ?? "");
  const [savedCardId, setSavedCardId] = useState<string | null>(
    () => (signedIn ? (savedCards.find((c) => c.is_default && c.chargeable !== false) ?? savedCards.find((c) => c.chargeable !== false))?.public_id : null) ?? null,
  );
  const [saveCard, setSaveCard] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  /** An express wallet picked in the sheet — its own button replaces the pay button. */
  const [walletPicked, setWalletPicked] = useState<WalletCode | null>(null);
  /** Where the picked wallet's own button is drawn: in the pay button's place. */
  const [walletSlot, setWalletSlot] = useState<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<StartPaymentResult | null>(null);
  /** The card's 3-D Secure page, open in a sheet over the order. */
  const [bankCheck, setBankCheck] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = methods.find((option) => option.code === method);
  const cardSdk = chosen?.card_sdk ?? null;
  const needsTypedCard = Boolean(cardSdk) && savedCardId === null;

  /** Settles true once the payment really started, false when it was refused or declined (a wallet's sheet reports which). */
  function pay(walletInstrument?: PaymentInstrument, hosted = false): Promise<boolean> {
    // A wallet picked on the phone pays from its own button; the card form
    // is not on screen, so this form has nothing to pay with.
    if (!walletInstrument && walletPicked) return Promise.resolve(false);

    setFailure(null);
    setWalletNotice(null);

    if (!walletInstrument && method === "benefit_pay") {
      setBenefitOpen(true);
      return Promise.resolve(true);
    }

    return new Promise<boolean>((settle) => startTransition(async () => settle(await attempt(walletInstrument, hosted))));
  }

  /** `hosted`: the card form would not load — pay this order on Tap's own page, with no token. */
  async function attempt(walletInstrument?: PaymentInstrument, hosted = false): Promise<boolean> {
    let instrument: PaymentInstrument = walletInstrument ?? {};
    if (!walletInstrument && !hosted) {
      if (savedCardId !== null) {
        instrument = { savedCardId };
      } else {
        const token = await card.current?.tokenize().catch(() => undefined);
        if (!token) {
          setFailure({ ok: false, message: m.payment.tokenizeFailed, retryable: true });
          return false;
        }
        instrument = { cardToken: token, saveCard };
      }
    }

    let result: StartPaymentResult;
    try {
      result = await payExistingOrder(orderId, instrument, locale, { bankCheckInPage: canCheckInPage() });
    } catch (error) {
      // The action went on to the payment's page or result (a redirect
      // rejects the awaited promise while the router follows it): started,
      // so a wallet's sheet does not say it failed (CQ-100099).
      if (isRedirectSignal(error)) return true;
      throw error;
    }

    // A card's 3-D Secure opens over this page; its return moves the page on.
    if (result.bankCheckUrl) {
      setBankCheck(result.bankCheckUrl);
      return true;
    }

    // Any other page to go to — or, settled with no page, the completion
    // step, which asks Laravel (never this page) whether it was paid.
    if (result.redirectUrl) {
      leaveForPayment(result.redirectUrl, `/${locale}/payment/complete?order=${encodeURIComponent(orderId)}`);
      return true;
    }
    if (result.completed || result.confirming) {
      window.location.assign(`/${locale}/payment/complete?order=${encodeURIComponent(orderId)}`);
      return true;
    }

    // The order's payment window closed while this page was open (ADR
    // 0038): nothing was charged, and the page itself now says so and offers
    // to order again — reloaded rather than leaving a pay button that cannot work.
    if (result.refusal === "payment_expired") {
      window.location.reload();
      return false;
    }

    // Card payments were paused while this page was open (v0.1.129): said
    // calmly, and the methods are read again so the card ones disappear.
    if (result.refusal === "card_payments_paused") {
      setFailure(result);
      router.refresh();
      return false;
    }

    setFailure(result);
    return false;
  }

  const reason = shownGatewayReason(failure?.failureReason ?? (failure ? null : (lastFailure ?? null)));
  const sentence = failure
    ? failure.failed
      ? failureSentence(m, failure.failureReason ?? null, m.payment.failedRetryBody, failure.declineCategory)
      : failure.noPage
        ? m.payment.stillVerifying
        : (failure.message ?? m.payment.startFailed)
    : lastFailure
      ? failureSentence(m, lastFailure, m.payment.failedRetryBody)
      : null;

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void pay();
      }}
    >
      {bankCheck ? <BankCheckSheet url={bankCheck} orderId={orderId} locale={locale} /> : null}
      {sentence ? (
        <div role="alert" className="flex flex-col gap-1 rounded-[12px] bg-[var(--color-error-subtlest)] px-3.5 py-3">
          <p className="text-body-s font-bold leading-[1.55] text-[var(--color-danger)] lg:text-body-l">{sentence}</p>
          {reason ? (
            <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s" dir="auto">
              {m.payment.gatewayReason.replace("{reason}", reason)}
            </p>
          ) : null}
        </div>
      ) : null}

      <PaymentSection
        locale={locale}
        currency={currency}
        methods={methods}
        method={method}
        onMethod={(code) => {
          setMethod(code);
          setBenefitOpen(false);
        }}
        amount={amount}
        signedIn={signedIn}
        savedCards={savedCards}
        savedCardId={savedCardId}
        onSavedCard={setSavedCardId}
        saveCard={saveCard}
        onSaveCard={setSaveCard}
        cardHandle={card}
        onCardValid={setCardValid}
        onCardFallback={() => void pay(undefined, true)}
        disabled={pending || benefitOpen}
        onWalletToken={async (wallet: WalletCode, token: string, shown: Money) => {
          // The figure the sheet showed goes with it: nothing is charged
          // unless it is this order's frozen total.
          const started = await pay(
            wallet === "google_pay" ? { wallet, googlePayToken: token, expectedTotal: shown } : { wallet, cardToken: token, expectedTotal: shown },
          );
          if (!started) throw new SheetRefusal("payment");
        }}
        onWalletProblem={(problem) => setWalletNotice(problem === "cancelled" ? m.payment.walletCancelled : m.payment.walletFailed)}
        onExpressChoice={setWalletPicked}
        walletSlot={walletSlot}
        contact={contact}
        // Apple Pay needs a first name: an account can add it on its
        // profile; a guest has no field here, so is offered Apple Pay only
        // with one (never a name invented).
        applePayDetailsFrom={signedIn ? "account" : undefined}
      />

      {benefitOpen ? <BenefitPayStage
          locale={locale}
          orderId={orderId}
          onCancel={(holdSeconds) => {
            setBenefitOpen(false);
            if (holdSeconds > 0) setWalletNotice(m.payment.benefitPayHold.replace("{seconds}", String(holdSeconds)));
          }}
        /> : null}

      {walletNotice ? (
        <p role="status" className="rounded-xl bg-[var(--color-chip)] px-4 py-3 text-body-s font-medium text-[var(--color-ink)] lg:text-body-l">
          {walletNotice}
        </p>
      ) : null}

      {/* The pay button — or, with a wallet picked, the wallet's own button
          in its place. A wallet-only order has no button of ours at all. */}
      {benefitOpen ? null : (
        <div className="flex flex-col gap-2">
          {firstChoice ? (
            <button
              type="submit"
              disabled={pending || (needsTypedCard && !cardValid)}
              className={`${CTA_BUTTON} justify-center ${walletPicked ? "hidden" : ""}`}
            >
              {pending
                ? m.payment.paying
                : method === "benefit_pay"
                  ? m.payment.continueBenefitPay
                  : m.payment.payAmount.replace("{amount}", formatMoney(locale, amount, currency))}
            </button>
          ) : null}
          <div ref={setWalletSlot} className="empty:hidden" />
        </div>
      )}
    </form>
  );
}
