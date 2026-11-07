"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";

import { BankCheckSheet } from "@/components/checkout/BankCheckSheet";
import { BankTransferPanel } from "@/components/checkout/BankTransferPanel";
import { LeavingForPayment } from "@/components/checkout/LeavingForPayment";
import {
  CTA_BUTTON,
  PAY_BAR,
  PayButtonLabel,
  payButtonWords,
  PaymentFailureNotice,
  ProcessingSheet,
} from "@/components/checkout/CheckoutChrome";
import { CHECKOUT_HEADING, MONEY } from "@/components/checkout/styles";
import { PaymentProblem } from "@/components/checkout/PaymentProblem";
import { PriceChangePanel } from "@/components/checkout/PriceChangePanel";
import { BenefitPayStage } from "@/components/checkout/payment/BenefitPayStage";
import { MethodLogo, methodName, PaymentSection, type SavedCardView, type WalletCode } from "@/components/checkout/payment/PaymentSection";
import type { TapCardHandle } from "@/components/checkout/TapCardForm";
import type { Artwork } from "@/lib/catalog/product-artwork";
import { placeCartOrder, quoteCart, startCartPayment, type CartQuote } from "@/lib/cart/checkout";
import { attemptFor, type PlacementAttempt } from "@/lib/checkout/attempt-key";
import { canCheckInPage } from "@/lib/checkout/bank-check";
import { leaveForPayment } from "@/lib/checkout/leave-for-payment";
import { isNavigationSignal, isRedirectSignal } from "@/lib/checkout/navigation-signal";
import { recoverFromDeploySkew } from "@/lib/navigation/deploy-skew";
import { canPayExistingOrder, openingMethod, orderCurrencyFor, type PaymentMethodView } from "@/lib/checkout/methods";
import type { BankDetails, PaymentInstrument, StartPaymentResult } from "@/lib/checkout/payment";
import type { Money, PriceDelta } from "@/lib/checkout/price-delta";
import { SheetRefusal } from "@/lib/checkout/sheet-refusal";
import { phoneFromParts } from "@/lib/account/phone";
import { CLARITY_MASK } from "@/lib/analytics/clarity";
import type { Locale } from "@/lib/i18n/locales";
import type { CheckoutContact } from "@/lib/wallets/apple-customer";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { useDeviceSignal } from "@/lib/device-signal/use-device-signal";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { CheckoutLoyaltyControls } from "@/components/loyalty/CheckoutLoyaltyControls";
import { EarnRow, VipFeeWaivedRow, VipPayBarLine } from "@/components/loyalty/vip/CheckoutVip";
import { VipChip } from "@/components/loyalty/vip/VipChip";
import { VipUpsell } from "@/components/loyalty/vip/VipUpsell";
import { OptInBox } from "@/components/ui/OptInBox";
import { fill, formatPts, isNonZeroAmount } from "@/lib/loyalty/format";
import { dismissAlert, notify } from "@/lib/notifications/client";
import { ArtworkFill } from "@/components/catalog/ArtworkFill";

/**
 * Charger Points and Charger Balance at checkout (ADR 0043 §3) — for a
 * signed-in customer whose wallet and programme could be read; null hides the
 * controls (a guest has neither).
 */
export interface CheckoutLoyaltyView {
  /** Spendable display points (`GET /wallet`), for the switch's sub-line. */
  pointsAvailable: number;
  program: { minRedeem: number; maxSharePct: number; topUp: boolean };
  topUpHref: string | null;
  topUpBonusPct: string | null;
  /** The wallet's tier name, for the earn row's «معدل ذهبي». */
  tierName?: string | null;
  /**
   * «وفّر رسوم الدفع مع VIP» goes here — set only while the programme has VIP
   * on and the customer is not a member (ADR 0044); null draws no link.
   */
  vipUpsellHref?: string | null;
  /** The link was dismissed earlier this session (`cq_vip_upsell`). */
  vipUpsellDismissed?: boolean;
}

/** How long a slider must rest before the basket is re-priced with it. */
export const LOYALTY_REQUOTE_DEBOUNCE_MS = 250;

/**
 * WHAT A QUOTE WAS PRICED WITH: the method AND the loyalty choices. The fee,
 * the points' value, the balance and the card part all move with each, so a
 * quote is current only for exactly these — a slider moved since is a quote
 * for another order, and Pay waits for the new one (`priceSettling`).
 */

export function priceKey(method: string, pointsToRedeem: number, useBalance: boolean): string {
  return `${method}|${pointsToRedeem}|${useBalance ? 1 : 0}`;
}

/** One basket line as checkout draws it — display data only, no credential ever. */
export interface CheckoutLineView {
  id: string;
  name: string;
  image: Pick<Artwork, "url" | "drawn"> | null;
  denominationLabel: string | null;
  quantity: number;
  /**
   * The fields that tell two lines of one product apart — LABELLED AND
   * FILTERED by the basket (`CartView.fields`): a password is never here.
   */
  fields: { key: string; label: string; value: string | null }[];
  /**
   * The credentials already typed on the product page and held server-side
   * (the vault) — their LABELS only, so the line can say so. Never a value.
   */
  heldCredentials?: string[];
  /**
   * CREDENTIALS THIS LINE STILL NEEDS — labels of a password the vault no
   * longer holds (two hours passed, another browser, an old basket). NEVER
   * ASKED FOR HERE (owner, 2026-10-02: the product page is the one place
   * details are typed): the line links to `completeHref`, and nothing is paid
   * until it comes back complete.
   */
  missingCredentials: string[];
  /** This line's product page, opened to complete it (`completeLineHref`). */
  completeHref: string;
}

/**
 * Checkout for a whole basket — «Checkout Mobile» (2026-09-30): one column on
 * the phone, in the order a customer checks before paying — what is bought
 * (with each login's password typed under its own line), who it is for
 * (guests only), the invoice, how to pay — and ONE pay button fixed at the
 * bottom with the server's total on it. From `lg`, the invoice and the button
 * move to a sticky column beside the rest.
 *
 * THE CODE IS THE BASKET'S. A discount code is entered on the cart page
 * (`cq_coupon`); this page prices whatever the server still accepts and shows
 * it read-only. A code the server stops accepting is dropped with one quiet
 * line pointing back to the basket — never a blank invoice.
 *
 * NO PASSWORD OR TOKEN CROSSES THIS BOUNDARY — the Server Action reads the
 * session cookie itself. What comes back is an order id, never a credential.
 */
export function CartCheckoutForm({
  locale,
  currency,
  initialQuote,
  initialQuoteError,
  pricedWith: initialPricedWith = null,
  couponDropped: initialCouponDropped = false,
  couponSignInMessage: initialCouponSignInMessage,
  lines,
  methods,
  signedIn,
  offerMarketingOptIn = false,
  empty = false,
  savedCards = [],
  account = null,
  loyalty = null,
  phoneCountries = [],
  defaultPhoneCountry = "",
}: {
  locale: Locale;
  currency: string;
  /**
   * The server's quote for this basket, fetched while the page rendered — so
   * the invoice is on screen in the first paint rather than after a client
   * round trip, and so the page and this form start from ONE figure.
   */
  initialQuote: CartQuote | null;
  /** Why that quote could not be produced, when it could not. */
  initialQuoteError?: string;
  /** The method `initialQuote` was priced with — its fee is in that total. */
  pricedWith?: string | null;
  /** The basket's code was refused while the page was priced, and dropped. */
  couponDropped?: boolean;
  /**
   * The API's own sentence when the dropped code needed an account
   * (`coupon_sign_in_required`): shown with a sign-in link that comes back here.
   */
  couponSignInMessage?: string;
  lines: CheckoutLineView[];
  methods: PaymentMethodView[];
  /**
   * The basket is empty — either the customer arrived with nothing, or the
   * order was just placed and the basket cleared under this form. Only the
   * first case shows "empty": an order in hand keeps its own screens.
   */
  empty?: boolean;
  /**
   * Whether an account is placing this order.
   *
   * A SIGNED-IN CUSTOMER IS NEVER ASKED FOR CONTACT DETAILS, and that is the
   * API's own semantics rather than a UI preference: `CreateOrderRequest`
   * documents `guest_email`, `guest_phone` and `guest_name` as "ignored when
   * an authenticated customer creates the order", and `PlaceOrder` discards
   * them. Three required fields whose values the server throws away is asking
   * somebody to type for nothing, and the identity it would appear to set is
   * one they cannot change here.
   */
  signedIn: boolean;
  /**
   * Offer the guest's marketing opt-in boxes (ADR 0039 §4) — only while cart
   * recovery is switched on (`CART_SYNC_ENABLED`), so wording the owner has
   * not reviewed never reaches a live checkout.
   */
  offerMarketingOptIn?: boolean;
  /** The signed-in customer's own contact, for Apple Pay's required `customer`. */
  account?: CheckoutContact | null;
  /** The signed-in customer's saved cards (display data only), default first. */
  savedCards?: SavedCardView[];
  /** Charger Points / Balance controls — signed-in only; null hides them. */
  loyalty?: CheckoutLoyaltyView | null;
  /**
   * The guest phone's country picker — the same list and default (the
   * visitor's country) as sign-up's `PhoneField`, so a guest never has to
   * type «+971» or «00971» themselves (owner, 2026-10-16).
   */
  phoneCountries?: readonly { code: string; name: string; dial: string; flag: string | null }[];
  defaultPhoneCountry?: string;
}) {
  const readDeviceSignal = useDeviceSignal();
  const router = useRouter();
  const m = messagesFor(locale);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneTyped, setPhoneTyped] = useState("");
  const [phoneCountry, setPhoneCountry] = useState(
    phoneCountries.some((each) => each.code === defaultPhoneCountry) ? defaultPhoneCountry : (phoneCountries[0]?.code ?? ""),
  );
  const phoneDial = phoneCountries.find((each) => each.code === phoneCountry);
  // What the order carries: the picked country's code in front, the national
  // zero dropped — a number typed in full («+966…», «00966…») as typed
  // (`phoneFromParts`, the rule sign-up's server action uses).
  const phone = phoneFromParts(phoneCountry, phoneTyped);
  // A guest's own opt-in to reminders and offers (ADR 0039 §4) — UNTICKED
  // until they tick it, never inferred from anything else.
  const [optInEmail, setOptInEmail] = useState(false);
  const [optInWhatsapp, setOptInWhatsapp] = useState(false);
  // The first method that pays from OUR button — express wallets are only
  // listed once the browser says it can pay with them.
  const [method, setMethod] = useState(openingMethod(methods)?.code ?? "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<string | undefined>();
  /**
   * On a phone the refusal line sits just above the fixed pay bar and was
   * drawn UNDER it (checked at 360 px, 2026-10-13): brought into view when it
   * changes, clear of the bar (its scroll margin).
   */
  const messageLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) messageLine.current?.scrollIntoView?.({ block: "nearest" });
  }, [message]);
  const [pending, startTransition] = useTransition();

  /**
   * THE CODE THE SERVER HAS AGREED TO — seeded from the basket, where the
   * customer entered it, and priced into `initialQuote` already. Only this is
   * ever sent to placement; there is no box here to half-type another into.
   */
  const [applied, setApplied] = useState<string | null>(initialQuote?.couponCode ?? null);
  const [couponDropped, setCouponDropped] = useState(initialCouponDropped);
  const [couponSignInMessage, setCouponSignInMessage] = useState(initialCouponSignInMessage);
  const [quote, setQuote] = useState<CartQuote | null>(initialQuote);
  /**
   * WHICH METHOD THE QUOTE ON SCREEN WAS PRICED WITH. The fee is per method,
   * so a total priced with the card is not the total for a transfer: until
   * the server has priced the method now chosen, nothing is placed.
   */
  const [pricedWith, setPricedWith] = useState<string | null>(initialPricedWith === null ? null : priceKey(initialPricedWith, 0, false));
  /**
   * THE CUSTOMER'S LOYALTY CHOICES (ADR 0043 §3). The points they picked show
   * at once; every money figure about them is the next preview's, asked for
   * after the slider rests (`LOYALTY_REQUOTE_DEBOUNCE_MS`).
   */
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [useBalance, setUseBalance] = useState(false);
  const loyaltyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(loyaltyTimer.current), []);
  /** Spending points or balance asked for this session's two-step code. */
  const [stepUpNeeded, setStepUpNeeded] = useState(false);
  const [requoteError, setRequoteError] = useState<string | undefined>();
  /** Only the newest quote may land — a slow answer for an earlier pick must not overwrite it. */
  const latestQuote = useRef(0);
  const [delta, setDelta] = useState<PriceDelta | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  /**
   * THE PLACED ORDER'S OWN TOTAL, frozen when it was placed. From then on a
   * wallet's sheet shows THIS — never the basket's quote, which a method
   * switch re-prices while the order keeps its figure (and which a price
   * change leaves behind). What the sheet shows is what is charged.
   */
  const [placedTotal, setPlacedTotal] = useState<Money | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  /** The gateway page this order's payment went to — offered again if it is slow to open. */
  const [payUrl, setPayUrl] = useState<string | null>(null);
  /** Why the placed order's payment did not start — the retry pays THAT order. */
  const [failure, setFailure] = useState<StartPaymentResult | null>(null);
  /**
   * Why the basket could not be priced at all. A basket holding a line whose
   * custom field no longer validates (`player_id` must be a number, say, after
   * an admin tightened the rule) gets a 422 from the preview: it is stated,
   * with the way back to the basket, and the pay button stays locked — the
   * order would be refused for the same reason a second later.
   */
  const [quoteError] = useState<string | undefined>(initialQuoteError);
  const [quoting, startQuoting] = useTransition();

  /**
   * TAP'S EMBEDDED CARD FORM, when the chosen method offers one (`card_sdk`).
   * In that mode the form NEVER unmounts while an order is being paid — the
   * card lives in Tap's iframes inside it, and swapping the form for a panel
   * would throw the typed card away mid-payment. Price changes and failures
   * are drawn beside the pay button instead, and a retry pays THE SAME order
   * with a fresh token.
   */
  const card = useRef<TapCardHandle>(null);
  const [cardValid, setCardValid] = useState(false);
  const chosen = methods.find((option) => option.code === method);
  const cardSdk = chosen?.card_sdk ?? null;

  /** A saved card chosen instead of typing one — the default, when it can be charged. */
  const [savedCardId, setSavedCardId] = useState<string | null>(
    () => (signedIn ? (savedCards.find((c) => c.is_default && c.chargeable !== false) ?? savedCards.find((c) => c.chargeable !== false))?.public_id : null) ?? null,
  );
  /** «حفظ البطاقة» — unticked until the customer ticks it. */
  const [saveCard, setSaveCard] = useState(false);
  /** A placed order now paying through BenefitPay's own panel. */
  const [benefitOrder, setBenefitOrder] = useState<string | null>(null);
  /** The card's 3-D Secure page, open in a sheet over the checkout. */
  const [bankCheck, setBankCheck] = useState<{ url: string; orderId: string } | null>(null);
  /** An express wallet paid (or tried to pay) this order. */
  const [walletUsed, setWalletUsed] = useState(false);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  /** An express wallet picked in the sheet — its own button replaces the pay button. */
  const [walletPicked, setWalletPicked] = useState<WalletCode | null>(null);
  /** The pay bar's slot the picked wallet's button is drawn into. */
  const [walletSlot, setWalletSlot] = useState<HTMLDivElement | null>(null);

  /**
   * Methods whose payment happens ON this page, so the form stays mounted
   * through a price change or a decline: the card fields, BenefitPay's QR,
   * an express wallet's sheet.
   */
  // The same set that can pay an order that already exists: both are «paid
  // on this page» (`canPayExistingOrder`).
  const staysMounted = Boolean(cardSdk) || (chosen !== undefined && canPayExistingOrder(chosen)) || walletUsed;
  const needsTypedCard = Boolean(cardSdk) && savedCardId === null;
  const payingWith = walletPicked ?? method;
  const priceCurrent = payingWith !== "" && pricedWith === priceKey(payingWith, pointsToRedeem, useBalance);
  /** Points and balance cover everything: nothing is charged to a card, so none is asked for. */
  const coveredByLoyalty = quote !== null && priceCurrent && (quote.loyalty.pointsRedeemedPts > 0 || quote.loyalty.balanceUsed !== null) && !isNonZeroAmount(quote.totalDue);
  /** Nothing to price or nothing to pay with: the page says so, and offers no payment. */
  const blocked = quoteError !== undefined || methods.length === 0;
  /**
   * A line still needs a password the vault no longer holds: it is completed
   * on its product page, and until then nothing here pays — the server would
   * refuse the order for the missing field.
   */
  const detailsMissing = lines.some((line) => line.missingCredentials.length > 0);
  const form = useRef<HTMLFormElement>(null);
  // The inputs' own validity (required, `type=email`), read after each
  // render: a malformed email would open a sheet for an order the server
  // then refuses.
  const [contactMissing, setContactMissing] = useState(!signedIn);
  useEffect(() => {
    if (signedIn) return;
    const inputs = [...(form.current?.querySelectorAll<HTMLInputElement>("[data-guest-contact]") ?? [])];
    setContactMissing(inputs.length > 0 && inputs.some((input) => !input.checkValidity()));
  }, [signedIn, name, email, phone]);

  /** A press on a locked wallet: the first thing missing, shown. */
  function showWhatIsMissing() {
    if (detailsMissing) {
      const link = form.current?.querySelector<HTMLElement>("[data-complete-line]");
      link?.scrollIntoView({ block: "center", behavior: "smooth" });
      link?.focus({ preventScroll: true });
      return;
    }
    form.current?.reportValidity();
  }

  /**
   * The currency the basket is quoted and placed in for a method: the method's
   * own when it forces one (Binance Pay: USD — the checkout switches to it),
   * the customer's otherwise. Choosing a card again goes back. The server
   * refuses any other currency for such a method, so this cannot drift.
   */
  const currencyFor = (code: string) => orderCurrencyFor(methods.find((option) => option.code === code), currency);

  /**
   * THIS CHECKOUT'S ATTEMPT AT PLACING (`lib/checkout/attempt-key.ts`). Its
   * key goes with every placement and is KEPT while the outcome is unknown and
   * the choices the API fingerprints are unchanged — so a press after no
   * answer replays the first order instead of placing a second. Any certain
   * answer — a 409 mismatch included — or a changed method, currency,
   * contact or code, starts a new one.
   */
  const attempt = useRef<PlacementAttempt | null>(null);
  function attemptKeyFor(gatewayCode: string): string {
    // The loyalty choices are part of what the API fingerprints: a changed
    // slider under the old key would be a 409 mismatch for ever.
    const signature = JSON.stringify([gatewayCode, currencyFor(gatewayCode), email, phone, name, applied, quote?.loyalty.pointsRedeemedPts ?? 0, useBalance]);
    attempt.current = attemptFor(attempt.current, signature);
    return attempt.current.key;
  }
  /**
   * What a refused placement says. An unknown outcome is said in our words —
   * a 5xx carries the framework's "Server Error", a 409 the API's English
   * naming the key — unless it is field-keyed (a stale rate's 503 says which).
   */
  function placementMessage(result: { unsettled?: boolean; restart?: boolean; message?: string; errors?: Record<string, string[]> }): string {
    if ((result.unsettled || result.restart) && Object.keys(result.errors ?? {}).length === 0) return m.checkout.placementUnsettled;
    return result.message ?? m.payment.failedTitle;
  }
  /**
   * Card payments were paused (v0.1.129): nothing was placed and the basket
   * stays. The chosen method is dropped and the list read again, so only the
   * ways to pay that still work (bank transfer, Charger Balance) are offered.
   */
  function methodsWentAway() {
    setMethod("");
    router.refresh();
  }
  /** After a placement answered: keep the attempt only if the outcome is still unknown. */
  function settleAttempt(result: { unsettled?: boolean }) {
    if (!result.unsettled) attempt.current = null;
  }

  /**
   * Re-price with a method: its processing fee belongs in the total, so
   * choosing another method — a wallet included, whose sheet shows the total —
   * re-asks the server; nothing is added here. NEVER COMPUTED HERE: the fee
   * shown has to be the fee charged, so it comes from the engine placement
   * uses (`quoteCart`).
   */
  function requote(gatewayCode: string, choices: { points: number; balance: boolean } = { points: pointsToRedeem, balance: useBalance }) {
    const ticket = ++latestQuote.current;
    // Any re-price supersedes a loyalty one still waiting out its debounce —
    // otherwise it would fire later for a method no longer chosen.
    window.clearTimeout(loyaltyTimer.current);
    setRequoteError(undefined);
    const loyaltyChoice = { pointsToRedeem: choices.points, useBalance: choices.balance };

    startQuoting(async () => {
      // A request that never came back (a dropped connection, the page being
      // left mid-flight — Safari's «Load failed») is said here, not thrown:
      // thrown, it took the customer to the error page (CHARGERQUICK-STOREFRONT-6).
      let result: Awaited<ReturnType<typeof quoteCart>>;
      let dropped = false;
      let signInMessage: string | undefined;
      try {
        result = await quoteCart({ locale, currency: currencyFor(gatewayCode), couponCode: applied ?? undefined, gatewayCode, ...loyaltyChoice });

        // The CODE was refused with this method: priced again without it, and
        // said once — the invoice never goes blank over a discount.
        if (applied && result.couponError) {
          if (result.couponReason === "sign_in_required") signInMessage = result.couponError;
          result = await quoteCart({ locale, currency: currencyFor(gatewayCode), gatewayCode, ...loyaltyChoice });
          dropped = Boolean(result.quote);
        }
      } catch (error) {
        // A page from an older release than the server (deploy skew): the
        // quote never ran — reload ONCE onto the new release, nothing placed.
        if (recoverFromDeploySkew(error)) return;
        if (ticket === latestQuote.current) setRequoteError(m.checkout.connectionLost);
        return;
      }

      if (ticket !== latestQuote.current) return;

      if (result.stale) {
        // The basket moved under the customer: the cart is the page that can
        // say which line changed.
        window.location.assign(`/${locale}/cart`);
        return;
      }

      if (!result.quote) {
        // The invoice on screen belongs to the previous method; the button
        // stays locked until a method is priced.
        setRequoteError(m.checkout.requoteFailed);
        return;
      }

      setQuote(result.quote);
      setPricedWith(priceKey(gatewayCode, choices.points, choices.balance));
      if (dropped) {
        setApplied(null);
        setCouponDropped(true);
        setCouponSignInMessage(signInMessage);
      }
    });
  }

  /*
   * THE PAGE COULD NOT PRICE THE OPENING METHOD (its quote came back without
   * that method's fee): asked once more from here, so the pay button is never
   * locked with no reason on screen — a failure now says so (`requoteError`).
   */
  const askedOnOpen = useRef(false);
  useEffect(() => {
    if (askedOnOpen.current || initialPricedWith !== null || !initialQuote || method === "" || blocked) return;
    askedOnOpen.current = true;
    requote(method);
  });

  function chooseMethod(code: string) {
    setMethod(code);
    requote(code);
  }

  /**
   * A loyalty choice changed: shown at once, priced after the slider rests.
   * The quote on screen stops being current THIS instant (`priceKey`), so Pay
   * is locked until the server has answered for exactly these choices.
   */
  function chooseLoyalty(next: { points: number; balance: boolean }, delay = LOYALTY_REQUOTE_DEBOUNCE_MS) {
    setPointsToRedeem(next.points);
    setUseBalance(next.balance);
    setStepUpNeeded(false);
    window.clearTimeout(loyaltyTimer.current);
    if (payingWith === "") return;
    const code = payingWith;
    loyaltyTimer.current = window.setTimeout(() => requote(code, next), delay);
  }

  /**
   * Hand the placed order to the payment rail.
   *
   * ROUTES ON THE METHOD'S `type`, not its code — the same rule the
   * single-item checkout keeps: sending `gateway` for a bank transfer asks Tap
   * to charge a card nobody chose. A transfer has no redirect and nothing is
   * paid, so it goes to the order-status page, which is the screen that says
   * where to send the money and that the order is NOT yet settled.
   */
  /** True when the payment really started (a page, a sheet, a settled order); false when it was refused or declined. */
  async function beginPayment(orderId: string, walletInstrument?: PaymentInstrument): Promise<boolean> {
    setFailure(null);
    setDelta(null);
    setWalletNotice(null);

    // BENEFITPAY: its own panel takes over — the QR, then Laravel's answer.
    if (!walletInstrument && chosen?.code === "benefit_pay") {
      setBenefitOrder(orderId);
      return true;
    }

    let instrument: PaymentInstrument = walletInstrument ?? {};
    // Tap's hosted page instead of the embedded form (it would not load):
    // no token — Laravel starts the charge on Tap's own page.
    const hosted = hostedNext.current;
    hostedNext.current = false;

    // THE CARD IS TOKENIZED ONLY NOW — after the order exists and its price
    // was accepted — because a token is single-use: minted earlier, it would
    // be spent on nothing if placement answered with a price change. A saved
    // card needs no token here: Laravel mints a fresh one from it.
    if (!walletInstrument && cardSdk && !hosted && !coveredByLoyalty) {
      if (savedCardId !== null) {
        instrument = { savedCardId };
      } else {
        let token: string | undefined;
        try {
          token = await card.current?.tokenize();
        } catch {
          token = undefined;
        }
        if (!token) {
          setFailure({ ok: false, message: m.payment.tokenizeFailed, retryable: true });
          return false;
        }
        instrument = { cardToken: token, saveCard };
      }
    }

    // Starts the payment; the basket goes only once the SERVER says it is
    // paid (see `startCartPayment`). No answer at all is a retry of THIS
    // order — safe: one charge slot per order, never two attempts open.
    let payment: Awaited<ReturnType<typeof startCartPayment>>;
    try {
      payment = await startCartPayment(
        orderId,
        walletInstrument ? "tap_card" : method,
        walletInstrument ? "gateway" : (chosen?.type ?? "gateway"),
        locale,
        instrument,
        { bankCheckInPage: canCheckInPage() },
      );
    } catch (error) {
      // THE PAYMENT WENT ON TO ITS PAGE: the action redirected (Tap's page, a
      // settled or authorized payment's result), which rejects the promise
      // awaited here while the router follows it. Started — a wallet's sheet
      // says so — never «connection lost» (CQ-100099, 2026-10-16).
      if (isRedirectSignal(error)) return true;
      setFailure({ ok: false, message: m.checkout.connectionLost, retryable: true });
      return false;
    }

    // A GUIDED BANK TRANSFER has its own page: the account, the deadline,
    // the order number to quote, and where to upload the proof. `replace`:
    // Back from it must not reopen this checkout, whose basket is spent.
    if (payment.bankTransfer) {
      window.location.replace(`/${locale}/orders/${encodeURIComponent(orderId)}/bank-transfer`);
      return true;
    }

    if (payment.bankDetails) {
      setBankDetails(payment.bankDetails);
      setPlacedOrderId(orderId);
      return true;
    }

    // A CARD's 3-D Secure opens over this page (BankCheckSheet); the page
    // stays, and its return moves the whole page on.
    if (payment.bankCheckUrl) {
      setBankCheck({ url: payment.bankCheckUrl, orderId });
      return true;
    }

    if (payment.redirectUrl) {
      // A full navigation, not a router push: this leaves our origin for
      // Tap's payment page or the bank's 3-D Secure.
      // An app (Binance Pay on a phone) leaves this tab behind: coming back
      // to it goes to the payment's own page rather than a stale checkout.
      setPayUrl(payment.redirectUrl);
      leaveForPayment(payment.redirectUrl, `/${locale}/payment/complete?order=${encodeURIComponent(orderId)}`);
      return true;
    }

    // Settled with no page: a card or wallet captured at once, or points
    // covered it. The return page asks the API what actually happened.
    // Settled with no page — or AUTHORIZED and being captured (in progress,
    // never «failed»). The return page asks the API what actually happened.
    if (payment.completed || payment.confirming) {
      window.location.replace(`/${locale}/payment/return?order=${encodeURIComponent(orderId)}`);
      return true;
    }

    // The sheet's figure was not the order's: nothing was charged. The
    // order's real total is what the next sheet shows.
    if (payment.priceChanged) {
      setPlacedTotal(payment.priceChanged);
      setWalletNotice(`${m.payment.walletPriceChanged} ${formatMoney(locale, payment.priceChanged.amount, payment.priceChanged.currency)}`);
      return false;
    }

    // Refused, declined, or no page to open: said plainly, with a retry of
    // THIS order. Never "completed" — see `lib/checkout/payment-reply.ts`.
    setFailure(payment);
    return false;
  }

  /**
   * An express wallet's sheet was approved: Apple Pay handed a Tap token,
   * Google Pay its encrypted token. The order is placed NOW (the sheet had to
   * open straight from the tap) and charged only if its total is the one the
   * sheet showed — otherwise the customer sees the new figure and pays again.
   */
  function payWithWallet(wallet: WalletCode, token: string, shown: Money): Promise<void> {
    // The figure the sheet SHOWED travels with the token: Laravel charges
    // nothing unless it is the order's own total (`expected_total`).
    const instrument: PaymentInstrument =
      wallet === "google_pay" ? { wallet, googlePayToken: token, expectedTotal: shown } : { wallet, cardToken: token, expectedTotal: shown };

    setWalletUsed(true);
    setErrors({});
    setMessage(undefined);

    // Settles when the payment has started — or rejects when it did not, so
    // Apple's sheet says so instead of a tick over a failure.
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          if (placedOrderId) {
            if (await beginPayment(placedOrderId, instrument)) resolve();
            else reject(new SheetRefusal("payment"));
            return;
          }
          if (!quote) {
            reject(new Error("quote"));
            return;
          }

          const result = await placeCartOrder({
            deviceSignal: await readDeviceSignal(),
            locale,
            currency: currencyFor(wallet),
            guestEmail: email,
            guestPhone: phone,
            guestName: name,
            marketingOptIn: { email: optInEmail, whatsapp: optInWhatsapp },
            shownTotal: shown,
            gatewayCode: wallet,
            couponCode: applied ?? undefined,
            attemptKey: attemptKeyFor(wallet),
            pointsToRedeem: quote.loyalty.pointsRedeemedPts,
            useBalance,
          });
          settleAttempt(result);

          if (result.stale) {
            window.location.assign(`/${locale}/cart`);
            resolve();
            return;
          }
          if (result.stepUpRequired) {
            setStepUpNeeded(true);
            reject(new SheetRefusal("step_up"));
            return;
          }
          if (!result.ok || !result.orderId) {
            setErrors(result.errors ?? {});
            setMessage(placementMessage(result));
            if (result.methodsPaused) methodsWentAway();
            reject(new SheetRefusal("place"));
            return;
          }

          setPlacedOrderId(result.orderId);

          // The sheet authorised a different figure: never charge it. The
          // order's own total is shown; the next press opens a sheet with it.
          if (result.delta) {
            setDelta(result.delta);
            setPlacedTotal(result.delta.charged);
            setWalletNotice(`${m.payment.walletPriceChanged} ${formatMoney(locale, result.delta.charged.amount, result.delta.charged.currency)}`);
            reject(new SheetRefusal("price_changed"));
            return;
          }

          setPlacedTotal(shown);
          if (await beginPayment(result.orderId, instrument)) resolve();
          else reject(new SheetRefusal("payment"));
        } catch (error) {
          // No answer after the sheet's token went out: the order MAY exist,
          // even charged. Said as the card path says it — the wallet's own
          // "nothing was charged" no longer follows a token (`afterToken`),
          // so without this the customer was told nothing at all. Not for
          // Next's own navigation signal (a redirect): that page moves on.
          if (!isNavigationSignal(error)) setMessage(m.checkout.connectionLostPlacing);
          reject(error instanceof Error ? error : new Error("payment"));
        }
      });
    });
  }

  /**
   * The embedded card form would not load: the SAME order (placed now if it
   * is not yet), paid on Tap's hosted page at its frozen amount. Not another
   * provider — if Tap is down, its page is too.
   */
  const hostedNext = useRef(false);
  function payOnTapPage() {
    hostedNext.current = true;
    submit();
  }

  function submit() {
    setErrors({});
    setMessage(undefined);

    // A picked wallet pays from its own button; the card form is not on
    // screen, so pressing Enter in a field must not pay by card.
    if (walletPicked) return;

    // No method, no order: an order is priced WITH its method (ADR 0015).
    if (method === "") {
      notify("checkout.chooseMethod");
      return;
    }

    // Nothing to compare against means nothing was quoted for THIS method —
    // the button is locked in that state, and this is the half that holds
    // regardless.
    if (!quote || !priceCurrent) return;

    // THE SAME ORDER, AGAIN — a declined card, a failed code, a price the
    // customer has now accepted. Placing another would buy twice.
    if (placedOrderId && staysMounted) {
      const orderId = placedOrderId;
      startTransition(async () => {
        await beginPayment(orderId);
      });
      return;
    }

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof placeCartOrder>>;
      try {
        result = await placeCartOrder({
          deviceSignal: await readDeviceSignal(),
          locale,
          currency: currencyFor(method),
          guestEmail: email,
          guestPhone: phone,
          guestName: name,
          marketingOptIn: { email: optInEmail, whatsapp: optInWhatsapp },
          // THE FIGURE ON SCREEN: the server's quote, discount and this
          // method's fee included. This used to be the storefront's own
          // pre-coupon subtotal, compared with a post-coupon `final_price` — so
          // every order with a code in it was reported as a price change.
          shownTotal: { amount: quote.totalDue, currency: quote.currency },
          gatewayCode: method,
          // Only what the SERVER agreed to.
          couponCode: applied ?? undefined,
          attemptKey: attemptKeyFor(method),
          // The points the preview APPLIED (clamped to the cap) — placement
          // refuses an amount over it rather than clamping.
          pointsToRedeem: quote.loyalty.pointsRedeemedPts,
          useBalance,
        });
      } catch {
        // No answer: the order MAY exist. The attempt's key is kept, so a
        // press from this page with the same choices gets THAT order back
        // rather than a second — but a reload or another tab would not, so
        // the customer is still told to look first. Never the error page.
        setMessage(m.checkout.connectionLostPlacing);
        return;
      }
      settleAttempt(result);

      // The cart moved under the customer — a product left the catalogue, or
      // another tab emptied it. Back to the cart, which is the page that can
      // say which line changed.
      if (result.stale) {
        window.location.assign(`/${locale}/cart`);
        return;
      }

      // Two-step verification first: said with the way through, and nothing
      // was placed — the customer comes back to this same basket.
      if (result.stepUpRequired) {
        setStepUpNeeded(true);
        return;
      }

      if (!result.ok || !result.orderId) {
        setErrors(result.errors ?? {});
        setMessage(placementMessage(result));
        if (result.couponReason === "sign_in_required") setCouponSignInMessage(result.errors?.coupon_code?.[0] ?? result.message);
        if (result.methodsPaused) methodsWentAway();
        return;
      }

      // The order exists from this moment. Recorded before anything else so
      // the basket emptying underneath (and the re-render it causes) can
      // never make this form forget it.
      setPlacedOrderId(result.orderId);
      setPlacedTotal(result.delta ? result.delta.charged : { amount: quote.totalDue, currency: quote.currency });

      // A price difference is not a failure — the order exists. It is the
      // customer's decision: both figures, and payment starts only on their
      // explicit accept, from THIS page, which still knows the chosen method.
      if (result.delta) {
        setDelta(result.delta);
        return;
      }

      await beginPayment(result.orderId);
    });
  }

  if (bankDetails && placedOrderId) {
    return (
      <BankTransferPanel locale={locale} orderId={placedOrderId} details={bankDetails}>
        <a
          href={`/${locale}/order-status/${placedOrderId}`}
          className="inline-block rounded-[12px] bg-[var(--color-brand-500)] px-4 py-2 font-semibold text-[var(--color-on-primary)]"
        >
          {m.transfer.uploadReceipt}
        </a>
      </BankTransferPanel>
    );
  }

  if (delta && placedOrderId && !staysMounted) {
    return (
      <PriceChangePanel
        locale={locale}
        delta={delta}
        pending={pending}
        cancelHref={`/${locale}`}
        onAccept={() => {
          startTransition(async () => {
            await beginPayment(placedOrderId);
          });
        }}
      />
    );
  }

  // The order is placed but its payment did not start. The basket is still
  // full; the retry pays this same order.
  if (placedOrderId && failure && !staysMounted) {
    return (
      <PaymentProblem
        locale={locale}
        orderId={placedOrderId}
        result={failure}
        pending={pending}
        onRetry={() =>
          startTransition(async () => {
            await beginPayment(placedOrderId);
          })
        }
      />
    );
  }

  // The order is placed and the customer is on the way to the payment page —
  // or placement answered with a message, in which case the order's own
  // payment page is where it can be picked up.
  // ONLY WHEN A PAGE WAS ACTUALLY OPENED (or placement answered with a
  // message). An order merely existing is not leaving: after a BenefitPay QR
  // was closed, choosing another method used to swap the whole checkout for
  // «جارٍ تحويلك» with nothing started (staging, 2026-10-04).
  if (placedOrderId && !staysMounted && (payUrl || message)) {
    return (
      <LeavingForPayment
        locale={locale}
        orderId={placedOrderId}
        methodName={chosen ? methodName(chosen, locale) : undefined}
        methodLogo={chosen ? <MethodLogo method={chosen} currency={currencyFor(chosen.code)} /> : undefined}
        total={placedTotal}
        payUrl={payUrl}
        note={message}
      />
    );
  }

  if (empty) {
    return (
      <section className="space-y-4">
        <p className="text-heading-l font-bold text-[var(--color-ink)]">{m.cart.empty}</p>
        <a
          href={`/${locale}`}
          className="inline-block rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 font-semibold text-[var(--color-on-primary)]"
        >
          {m.cart.browse}
        </a>
      </section>
    );
  }

  return (
    <form
      ref={form}
      // ONE COLUMN ON THE PHONE, in the comp's order: products, contact,
      // invoice, payment, then anything to read before paying. Both columns
      // are `contents` there, so `order` arranges their children in one flow;
      // the invoice has nothing to focus, so the Tab key still meets the
      // fields in reading order. FROM `lg`, two columns: what is bought, who
      // it is for and how to pay at the start; the invoice and the pay
      // button, sticky, at the end.
      className="flex flex-col gap-7 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12"
      onSubmit={(event) => {
        event.preventDefault();
        // An incomplete card is said, and nothing is placed: the order waits
        // until Tap has a card it can tokenize.
        if (needsTypedCard && !cardValid && !walletPicked && !coveredByLoyalty) {
          setFailure({ ok: false, message: m.payment.cardIncomplete, retryable: true });
          return;
        }
        submit();
      }}
    >
      {pending ? <ProcessingSheet locale={locale} /> : null}

      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8">
        {/* The basket itself cannot be priced. Named, with the way back, and
            the button locked — placing the order would be refused for the
            same reason. */}
        {quoteError ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[12px] bg-[var(--color-error-subtlest)] px-3.5 py-3 text-body-s font-semibold leading-[1.5] text-[var(--color-danger)] lg:text-body-l"
          >
            <span>{quoteError}</span>
            <Link href={`/${locale}/cart`} className="font-bold underline">
              {m.checkout.backToCart}
            </Link>
          </div>
        ) : null}

        <section aria-labelledby="checkout-products" className="flex flex-col gap-3 max-lg:order-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="checkout-products" className={CHECKOUT_HEADING}>
              {m.checkout.products}{" "}
              <span className="font-semibold text-[var(--color-ink-subtle)]">
                (<span dir="ltr">{lines.length}</span>)
              </span>
            </h2>
            <Link href={`/${locale}/cart`} className="text-body-s font-bold text-[var(--color-brand-500)] underline-offset-4 hover:underline lg:text-body-l">
              {m.cart.editBasket}
            </Link>
          </div>

          <ul className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <CheckoutLine
                key={line.id}
                locale={locale}
                line={line}
                price={quote?.lines[index] ? formatMoney(locale, quote.lines[index], quote.currency) : null}
                vipMultiplier={quote?.loyalty.pointsVipMultiplier ?? null}
              />
            ))}
          </ul>
        </section>

        {/* Guests only — see `signedIn` above. One grouped field block, as
            drawn; each input keeps its own label for a screen reader. */}
        {signedIn ? null : (
          <div className="min-w-0 max-lg:order-2">
            {/* An account first, a guest checkout second (owner, 2026-10-16).
                Both come back HERE (`next`): the basket is a cookie, so it
                is still in hand after signing in or up. */}
            <div data-checkout-account-prompt className="mb-4 flex flex-col gap-3 rounded-[12px] bg-[var(--color-bg-subtle)] p-3.5">
              <p className="text-body-s font-semibold leading-[1.6] text-[var(--color-ink)] lg:text-body-l">{m.checkout.accountPrompt}</p>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/cart/checkout`)}`}
                  className="flex h-11 items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)] lg:text-body-l"
                >
                  {m.account.signIn}
                </Link>
                <Link
                  href={`/${locale}/account/sign-up?next=${encodeURIComponent(`/${locale}/cart/checkout`)}`}
                  className="flex h-11 items-center justify-center rounded-[12px] bg-[var(--color-surface)] text-body-s font-bold text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)] lg:text-body-l"
                >
                  {m.account.signUp}
                </Link>
              </div>
            </div>
          <fieldset className="min-w-0">
            <legend className={`${CHECKOUT_HEADING} mb-3`}>{m.checkout.contact}</legend>
            <p className="-mt-1 mb-3 text-body-s text-[var(--color-ink-subtle)] lg:text-body-l">{m.checkout.orGuest}</p>
            <div className="flex flex-col gap-2">
              <div {...CLARITY_MASK} className="divide-y divide-[var(--color-line)] overflow-hidden rounded-[12px] bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-line)]">
                <input
                  type="text"
                  required
                  maxLength={80}
                  autoComplete="name"
                  data-guest-contact
                  aria-label={m.checkout.name}
                  placeholder={m.checkout.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={CONTACT_INPUT}
                />
                <input
                  type="email"
                  required
                  dir="ltr"
                  autoComplete="email"
                  data-guest-contact
                  aria-label={m.checkout.email}
                  placeholder={m.checkout.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${CONTACT_INPUT} rtl:text-right`}
                />
                {/* The country as sign-up draws it (`PhoneField`): flag and
                    code over the platform's own picker, then the national
                    number. LTR as a whole, so a number never reorders. */}
                <div dir="ltr" className="flex">
                  {phoneDial ? (
                    <span className="relative flex shrink-0 items-center gap-1.5 border-e border-[var(--color-line)] px-3">
                      {phoneDial.flag ? (
                        <Image src={phoneDial.flag} alt="" aria-hidden width={24} height={17} unoptimized className="h-[17px] w-6 rounded-[3px] object-cover" />
                      ) : null}
                      <span className="text-body-s font-bold text-[var(--color-ink)] lg:text-body-l">+{phoneDial.dial}</span>
                      <span aria-hidden className="block size-3.5 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                      <select
                        aria-label={m.account.countryCode}
                        data-guest-phone-country
                        value={phoneCountry}
                        onChange={(e) => setPhoneCountry(e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
                      >
                        {phoneCountries.map((each) => (
                          <option key={each.code} value={each.code}>
                            {each.name} (+{each.dial})
                          </option>
                        ))}
                      </select>
                    </span>
                  ) : null}
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete="tel-national"
                    data-guest-contact
                    aria-label={m.checkout.phone}
                    placeholder={m.checkout.phone}
                    value={phoneTyped}
                    onChange={(e) => setPhoneTyped(e.target.value)}
                    className={`${CONTACT_INPUT} min-w-0 flex-1`}
                  />
                </div>
              </div>
              {[...(errors.guest_name ?? []), ...(errors.guest_email ?? []), ...(errors.guest_phone ?? [])].map((e) => (
                <p key={e} className="text-caption font-semibold text-[var(--color-danger)] lg:text-body-s">
                  {e}
                </p>
              ))}
              {/* Reminders and offers — the guest's own choice, both boxes
                  UNTICKED (ADR 0039 §4). Held by the API until the order is
                  paid; never asked of a signed-in customer here. */}
              {offerMarketingOptIn && (
                <>
                  <OptInBox checked={optInEmail} onChange={(event) => setOptInEmail(event.target.checked)} label={m.checkout.marketingEmail} />
                  <OptInBox checked={optInWhatsapp} onChange={(event) => setOptInWhatsapp(event.target.checked)} label={m.checkout.marketingWhatsapp} />
                </>
              )}
            </div>
          </fieldset>
          </div>
        )}

        {methods.length === 0 && !quoteError ? (
          <p className="text-body-s font-semibold leading-[1.6] text-[var(--color-danger)] max-lg:order-4 lg:text-body-l">{m.checkout.noMethods}</p>
        ) : null}

        {/* «رصيدك ونقاطك» (ADR 0043 §3) — signed-in only, before the method,
            and gone once the order exists: its points and balance are fixed. */}
        {loyalty && quote && !blocked && placedOrderId === null ? (
          <div className="min-w-0 max-lg:order-4">
            <CheckoutLoyaltyControls
              locale={locale}
              quote={quote.loyalty}
              currency={quote.currency}
              settling={quoting || !priceCurrent}
              pointsAvailable={loyalty.pointsAvailable}
              program={loyalty.program}
              useBalance={useBalance}
              pointsToRedeem={pointsToRedeem}
              onUseBalanceChange={(next) => chooseLoyalty({ points: pointsToRedeem, balance: next }, 0)}
              onPointsChange={(next) => chooseLoyalty({ points: next, balance: useBalance })}
              topUpHref={loyalty.topUpHref}
              topUpBonusPct={loyalty.topUpBonusPct}
            />
          </div>
        ) : null}

        {/* «طريقة الدفع» — the chosen method and «تغيير»; every other one in
            the sheet. Only what the server offers for this currency is drawn
            (HANDBOOK §1). */}
        {blocked ? null : (
          <div className="min-w-0 max-lg:order-4">
            <PaymentSection
              locale={locale}
              currency={currency}
              // Once the order exists (a BenefitPay QR closed, a card declined),
              // only what can pay THAT order is offered — never a page it was
              // not placed for, and never a way to place a second one.
              methods={placedOrderId ? methods.filter(canPayExistingOrder) : methods}
              method={method}
              onMethod={(code) => {
                dismissAlert();
                chooseMethod(code);
              }}
              onExpressChoice={(wallet) => {
                setWalletPicked(wallet);
                // The wallet's sheet shows the total: priced with the wallet.
                if (wallet) requote(wallet);
              }}
              walletSlot={walletSlot}
              contact={signedIn ? account : { name, email, phone }}
              // Apple Pay needs a first name: a guest types it here, an
              // account adds it on its profile.
              applePayDetailsFrom={signedIn ? "account" : "checkout"}
              walletBlocked={detailsMissing || contactMissing}
              onWalletBlocked={showWhatIsMissing}
              amount={placedTotal?.amount ?? quote?.totalDue ?? null}
              signedIn={signedIn}
              savedCards={savedCards}
              savedCardId={savedCardId}
              onSavedCard={setSavedCardId}
              saveCard={saveCard}
              onSaveCard={setSaveCard}
              cardHandle={card}
              onCardFallback={payOnTapPage}
              onCardValid={(valid) => {
                setCardValid(valid);
                // The "complete the card" line goes once it is complete, and
                // Pay reads «إتمام الدفع» again rather than a retry of nothing.
                if (valid) setFailure((current) => (current?.message === m.payment.cardIncomplete ? null : current));
              }}
              disabled={pending || benefitOrder !== null || (placedOrderId !== null && !staysMounted)}
              priceSettling={quoting || !priceCurrent}
              onWalletToken={payWithWallet}
              onWalletProblem={(problem) => {
                // An earlier sheet's placement has no certain answer yet (the
                // kept attempt): that order may exist, even charged, and the
                // checkout already says to look first. "Nothing was charged"
                // about this sheet would read as being about that order.
                if (attempt.current) return;
                setWalletNotice(problem === "cancelled" ? m.payment.walletCancelled : m.payment.walletFailed);
              }}
            />
          </div>
        )}

        {benefitOrder ? (
          <div className="max-lg:order-5">
            <BenefitPayStage
              locale={locale}
              orderId={benefitOrder}
              onCancel={(holdSeconds) => {
                setBenefitOrder(null);
                // The QR is closed here, not at Tap: say so, and how long
                // until another way to pay opens (Laravel holds it).
                if (holdSeconds > 0) setWalletNotice(m.payment.benefitPayHold.replace("{seconds}", String(holdSeconds)));
              }}
            />
          </div>
        ) : null}

        {bankCheck ? <BankCheckSheet url={bankCheck.url} orderId={bankCheck.orderId} locale={locale} /> : null}
      </div>

      <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
        {/* «تفاصيل الفاتورة». Every figure comes from the server — this block
            performs NO arithmetic, which is the storefront's rule for money
            and the only way the total shown can be the total charged. */}
        {quote && !blocked ? (
          <section aria-labelledby="checkout-invoice" className="flex flex-col gap-3 max-lg:order-3">
            <h2 id="checkout-invoice" className={CHECKOUT_HEADING}>
              {m.checkout.invoice}
            </h2>
            <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--color-primary-wash-lighter)] p-4">
              <InvoiceRow label={m.checkout.invoiceSubtotal} value={formatMoney(locale, quote.subtotal, quote.currency)} />

              {/* THE DISCOUNT ROW — the basket's code, read-only, in the
                  success green: a customer who applied a code and sees no
                  money move stops trusting the checkout. Absent without one:
                  a zero row would draw money nobody saved. */}
              {quote.discount ? (
                <InvoiceRow
                  label={
                    <>
                      {m.checkout.invoiceDiscount}
                      {quote.couponCode ? (
                        <span dir="ltr" className="rounded-[6px] bg-[var(--color-action-disabled-bg)] px-1.5 text-caption font-bold leading-[18px] text-[var(--color-ink-muted)]">
                          {quote.couponCode}
                        </span>
                      ) : null}
                    </>
                  }
                  value={`− ${formatMoney(locale, quote.discount, quote.currency)}`}
                  tone="text-[var(--color-success)]"
                />
              ) : null}

              {/* THE PAYMENT METHOD'S FEE — the server's figure for the method
                  chosen below, so the total is what that method is charged.
                  Dimmed while the server prices a newly picked method. */}
              {/* VIP waived it (the SERVER says which waiver — v0.1.112): the
                  method's fee struck through, «مجاناً لأعضاء VIP» and the crest
                  («VIP Experience» 8a/8c/8e). A perk's waiver keeps its words. */}
              {!quote.processingFee && quote.loyalty.processingFeeWaivedBy === "vip" ? (
                <VipFeeWaivedRow
                  locale={locale}
                  label={m.orderStatus.processingFee}
                  waivedAmount={quote.loyalty.processingFeeWaivedAmount}
                  currency={quote.currency}
                  settling={quoting || !priceCurrent}
                />
              ) : (
                <InvoiceRow
                  label={m.orderStatus.processingFee}
                  value={
                    quote.processingFee
                      ? `+ ${formatMoney(locale, quote.processingFee, quote.currency)}`
                      : quote.loyalty.processingFeeWaived
                        ? m.loyalty.checkout.feeWaived
                        : m.checkout.noFee
                  }
                  settling={quoting || !priceCurrent}
                  washOnChange
                />
              )}
              {/* A non-member paying a fee: the way to skip it, dismissible for the session. */}
              {loyalty?.vipUpsellHref && quote.processingFee ? (
                <VipUpsell locale={locale} href={loyalty.vipUpsellHref} initiallyDismissed={loyalty.vipUpsellDismissed === true} />
              ) : null}

              {/* The loyalty parts (ADR 0043 §3) — the SERVER's figures for
                  the points it applied and the balance it used; the total
                  below is already net of both. */}
              {quote.loyalty.pointsValue && isNonZeroAmount(quote.loyalty.pointsValue) && quote.loyalty.pointsRedeemedPts > 0 ? (
                <InvoiceRow
                  label={fill(m.loyalty.checkout.pointsLine, { pts: formatPts(locale, quote.loyalty.pointsRedeemedPts) })}
                  value={`− ${formatMoney(locale, quote.loyalty.pointsValue, quote.currency)}`}
                  tone="text-[var(--color-success)]"
                  settling={quoting || !priceCurrent}
                />
              ) : null}
              {quote.loyalty.balanceUsed && isNonZeroAmount(quote.loyalty.balanceUsed) ? (
                <InvoiceRow
                  label={m.loyalty.checkout.balanceLine}
                  value={`− ${formatMoney(locale, quote.loyalty.balanceUsed, quote.currency)}`}
                  tone="text-[var(--color-success)]"
                  settling={quoting || !priceCurrent}
                />
              ) : null}

              <div aria-hidden className="mb-1 mt-1.5 h-px bg-[var(--color-line)]" />

              <div
                data-settling={quoting || !priceCurrent ? "" : undefined}
                className={`flex items-baseline justify-between gap-3 transition-opacity duration-200 ${quoting || !priceCurrent ? "opacity-35" : ""}`}
              >
                <span className="text-body-m font-bold text-[var(--color-ink)] lg:text-body-l">
                  {quote.loyalty.pointsRedeemedPts > 0 || quote.loyalty.balanceUsed ? m.loyalty.checkout.toPay : m.checkout.invoiceTotal}
                </span>
                <ChangedFigure value={formatMoney(locale, quote.totalDue, quote.currency)} className={`text-heading-l font-bold text-[var(--color-brand-500)] ${MONEY}`} />
              </div>
            </div>

            {/* «تكسب نحو …» — its own success-wash row under the invoice
                («VIP Experience» 8), with the ×1.5 VIP chip when the server's
                estimate includes it. An ESTIMATE: granted on capture at the
                rate frozen then. Absent for a guest: the server sends null,
                never "0" — a guest has no account to hold points. */}
            {quote.pointsEarnedPts ? (
              <PointsRow
                locale={locale}
                pts={quote.pointsEarnedPts}
                value={quote.loyalty.pointsEarnedValue}
                currency={quote.currency}
                vipMultiplier={quote.loyalty.pointsVipMultiplier}
                tierName={loyalty?.tierName ?? null}
                infoLabel={m.checkout.pointsInfo}
                tip={m.checkout.pointsTip}
              />
            ) : null}

            {coveredByLoyalty ? <p className="text-caption font-semibold leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.loyalty.checkout.nothingOnCard}</p> : null}
            {couponSignInMessage ? (
              <p className="text-caption font-semibold leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">
                {couponSignInMessage}{" "}
                <Link
                  href={`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/cart/checkout`)}`}
                  className="font-bold text-[var(--color-brand-500)] underline underline-offset-2"
                >
                  {m.checkout.couponSignIn}
                </Link>
              </p>
            ) : couponDropped ? (
              <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.checkout.couponDropped}</p>
            ) : null}
            {requoteError ? (
              <p role="status" className="text-caption font-semibold leading-[1.6] text-[var(--color-danger)] lg:text-body-s">
                {requoteError}
              </p>
            ) : null}
          </section>
        ) : null}

        {message ? (
          <p
            ref={messageLine}
            role="alert"
            className="text-body-s font-semibold text-[var(--color-danger)] max-lg:order-5 max-lg:scroll-mb-[calc(140px+env(safe-area-inset-bottom))] lg:text-body-l"
          >
            {message}
          </p>
        ) : null}

        {/* Spending points or balance needs this session's two-step code
            (v0.1.104): the way through, and back to this basket. */}
        {stepUpNeeded ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--color-warning-wash)] px-3.5 py-3 text-body-s font-semibold text-[var(--color-warning-strong)] max-lg:order-5 lg:text-body-l">
            <span className="flex-1">{m.loyalty.checkout.stepUp}</span>
            <Link href={`/${locale}/account/verify?next=${encodeURIComponent(`/${locale}/cart/checkout`)}`} className="font-bold text-[var(--color-brand-500)]">
              {m.account.stepUpAction}
            </Link>
          </p>
        ) : null}

        {detailsMissing && !blocked ? (
          <p role="status" className="text-body-s font-bold leading-[1.5] text-[var(--color-warning-strong)] max-lg:order-5 lg:text-body-l">
            {m.payment.completeBeforePaying}
          </p>
        ) : null}

        {walletNotice ? (
          <p role="status" className="rounded-[12px] bg-[var(--color-bg-subtle)] px-3.5 py-3 text-body-s font-medium text-[var(--color-ink)] max-lg:order-5 lg:text-body-l">
            {walletNotice}
          </p>
        ) : null}

        {/* Card mode: a price change waits for the customer's accept, beside
            the button, with the card still typed in the fields. */}
        {staysMounted && delta && placedOrderId ? (
          <div className="max-lg:order-5">
            <PriceChangePanel
              locale={locale}
              delta={delta}
              pending={pending}
              cancelHref={`/${locale}`}
              onAccept={() => {
                // After a WALLET's sheet: the new figure is accepted by
                // pressing the wallet again (its sheet now shows it) — never
                // by charging the card or saved card sitting behind it.
                if (walletUsed || walletPicked) {
                  setDelta(null);
                  return;
                }
                const orderId = placedOrderId;
                startTransition(async () => {
                  await beginPayment(orderId);
                });
              }}
            />
          </div>
        ) : null}

        {/* Card mode: why it did not go through, and the button below pays
            the same order again. */}
        {staysMounted && failure ? (
          <div className="max-lg:order-5">
            <PaymentFailureNotice locale={locale} failure={failure} />
          </div>
        ) : null}

        {/* THE PAY BAR — fixed at the bottom of the phone, the end of the
            summary column from `lg`. The button says what it will do and the
            server's total: «إتمام الدفع ⃃ 486», «المتابعة إلى التحويل
            البنكي». A picked wallet's OWN button takes its place (drawn into
            the slot by the payment section). Locked while the server prices
            a method, while a payment is in flight (one press, one token, one
            charge), and while BenefitPay's own panel is open. */}
        {benefitOrder === null && (methods.length > 0 || quoteError) ? (
          <div className={`${PAY_BAR} max-lg:order-last`}>
            {quote && !quote.processingFee && quote.loyalty.processingFeeWaivedBy === "vip" ? <VipPayBarLine locale={locale} /> : null}
            <button
              type="submit"
              disabled={
                pending ||
                blocked ||
                detailsMissing ||
                quote === null ||
                quoting ||
                (!priceCurrent && method !== "") ||
                (staysMounted && delta !== null && placedOrderId !== null && !walletUsed)
              }
              className={`${CTA_BUTTON} ${walletPicked ? "hidden" : ""}`}
            >
              {pending ? (
                <>
                  <span aria-hidden className="size-4 motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {staysMounted ? m.payment.paying : m.common.loading}
                </>
              ) : failure && staysMounted ? (
                m.payment.retry
              ) : (
                <PayButtonLabel
                  words={payButtonWords(locale, chosen)}
                  amount={quote && !blocked ? formatMoney(locale, quote.totalDue, quote.currency) : null}
                />
              )}
            </button>
            <div ref={setWalletSlot} className="empty:hidden" />
            {/* Paying is agreeing: said once, under the button, with both
                pages one tap away. */}
            <p className="text-center text-caption leading-[1.6] text-pretty text-[var(--color-ink-muted)]">
              {m.checkout.legalPre}{" "}
              <Link href={`/${locale}/terms`} className={LEGAL_LINK}>
                {m.checkout.legalTerms}
              </Link>{" "}
              {m.checkout.legalAnd}{" "}
              <Link href={`/${locale}/privacy`} className={LEGAL_LINK}>
                {m.checkout.legalPolicies}
              </Link>{" "}
              {m.checkout.legalPost}
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}

/** A guest contact input, one row of the grouped field block. */
const CONTACT_INPUT =
  "block h-12 w-full bg-transparent px-3.5 text-body-s text-[var(--color-ink)] outline-none lg:text-body-l placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-offset-[-2px]";

/**
 * One line of the basket, as the comp draws it: the artwork, the name, the
 * server's price for the line and its quantity; then the fields that say who
 * it is for; then, where the category asks for an account password, whether
 * it is held from the product page or still has to be typed THERE — never a
 * box on this page.
 */
function CheckoutLine({ locale, line, price, vipMultiplier = null }: { locale: Locale; line: CheckoutLineView; price: string | null; vipMultiplier?: string | null }) {
  const m = messagesFor(locale);

  return (
    <li className="flex flex-col gap-2.5 rounded-[16px] bg-[var(--color-chip)] p-3.5 lg:p-4">
      <div className="flex items-start gap-3">
        {/* The picture alone; the brand blue only where there is none. */}
        <div className={`relative size-14 shrink-0 overflow-hidden rounded-[12px] ${line.image ? "" : "bg-[var(--color-brand-500)]"}`}>
          {line.image ? <ArtworkFill art={line.image} alt="" sizes="56px" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body-s font-extrabold leading-[1.45] tracking-[-0.13px] text-pretty text-[var(--color-ink)] lg:text-body-m lg:font-bold">{line.name}</p>
          {line.denominationLabel ? (
            <p className="text-caption font-medium text-[var(--color-ink-muted)] lg:text-body-s">{line.denominationLabel}</p>
          ) : null}
          {/* Every line earns at the VIP multiplier the server's estimate
              includes («VIP Experience» 8: the cart line chip). The preview
              states no per-line points, so the chip stands alone. */}
          {vipMultiplier ? <VipChip multiplier={vipMultiplier} className="mt-1 self-start" /> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {price ? (
            <span dir="ltr" className={`whitespace-nowrap text-body-s font-bold text-[var(--color-ink)] lg:text-body-l ${MONEY}`}>
              {price}
            </span>
          ) : null}
          <span
            dir="ltr"
            className={`rounded-full bg-[var(--color-action-disabled-bg)] px-2 text-caption font-bold leading-5 text-[var(--color-ink-subtle)] ${MONEY}`}
          >
            × {line.quantity}
          </span>
        </div>
      </div>

      {/* THE FIELDS, on the confirmation screen too. Without them a basket
          holding the same top-up for two different players is two identical
          rows, and the last thing a customer reads before paying cannot be
          ambiguous about who it is going to. */}
      {line.fields.length > 0 ? (
        <dl className="flex flex-col gap-1">
          {line.fields.map((field) => (
            <div key={field.key} className="flex justify-between gap-3 text-caption leading-5 lg:text-body-s">
              <dt className="shrink-0 text-[var(--color-ink-subtle)]">{field.label}</dt>
              <dd {...CLARITY_MASK} dir="auto" className="min-w-0 font-medium text-[var(--color-ink)] [overflow-wrap:anywhere] lg:font-semibold">
                {field.value ?? m.upload.done}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {line.heldCredentials && line.heldCredentials.length > 0 ? (
        <p className="flex items-center gap-1.5 text-caption font-bold text-[var(--color-success)] lg:text-body-s">
          <span aria-hidden className="block size-3.5 shrink-0 bg-current [mask-image:url(/brand/icon-shield-tick.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          {m.payment.credentialHeld.replace("{fields}", line.heldCredentials.join("، "))}
        </p>
      ) : null}

      {/* A password the vault no longer holds: never a box here — the way
          back to the product page, the one place it is typed. */}
      {line.missingCredentials.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--color-warning-wash)] px-3 py-2.5">
          <p className="min-w-0 flex-1 text-caption font-bold leading-[1.5] text-[var(--color-warning-strong)] lg:text-body-s">
            {m.payment.credentialMissing.replace("{fields}", line.missingCredentials.join("، "))}
          </p>
          <Link
            href={line.completeHref}
            data-complete-line
            className="flex h-9 shrink-0 items-center rounded-[10px] bg-[var(--color-primary)] px-3 text-caption font-bold text-[var(--color-on-cta)] lg:text-body-s transition hover:bg-[var(--color-primary-hover)]"
          >
            {m.payment.completeOnProduct}
          </Link>
        </div>
      ) : null}
    </li>
  );
}

const LEGAL_LINK = "font-bold text-[var(--color-brand-500)] no-underline";

/**
 * «نقاط ستحصل عليها» with a «?» that opens one line saying WHEN the points
 * land. The figure keeps its `≈` (an estimate, granted on capture at the rate
 * frozen then); the tip is what stops a customer reading it as already theirs.
 */
function PointsRow({
  locale,
  pts,
  value,
  currency,
  vipMultiplier,
  tierName,
  infoLabel,
  tip,
}: {
  locale: Locale;
  pts: number;
  value: string | null;
  currency: string;
  vipMultiplier: string | null;
  tierName: string | null;
  infoLabel: string;
  tip: string;
}) {
  const [open, setOpen] = useState(false);
  const tipId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <EarnRow
        locale={locale}
        pts={pts}
        value={value}
        currency={currency}
        vipMultiplier={vipMultiplier}
        tierName={tierName}
        info={
          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            aria-label={infoLabel}
            aria-expanded={open}
            aria-controls={tipId}
            className="relative grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] border-[var(--color-ink-subtle)] text-caption font-bold leading-none text-[var(--color-ink-subtle)] before:absolute before:-inset-3 before:content-['']"
          >
            ?
          </button>
        }
      />
      {open ? (
        <p id={tipId} className="rounded-[10px] bg-[var(--background)] px-3 py-2.5 text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">
          {tip}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A figure the server re-prices (the method's fee, the total): when the value
 * it shows CHANGES, it gets the one-shot wash. The element is keyed by the
 * formatted value, so a second change replays the wash from the start and an
 * unchanged re-render replays nothing; the wash is never on the first render,
 * so the server's HTML arrives still. Pure dressing — the figure is what the
 * server sent, and nothing reads this element or waits for its animation.
 *
 * Changed-ness is derived during render (the documented way to adjust state
 * from a prop) so the element that carries the new value is born with the
 * class — no effect, no flash of the unwashed figure.
 */
function ChangedFigure({ value, className }: { value: string; className: string }) {
  const [shown, setShown] = useState(value);
  const [changed, setChanged] = useState(false);
  if (value !== shown) {
    setShown(value);
    setChanged(true);
  }

  return (
    <span key={value} dir="ltr" data-figure className={`${className} ${changed ? "cq-changed" : ""}`}>
      {value}
    </span>
  );
}

/**
 * One line of the invoice. Money runs LTR on the Arabic page — the same rule
 * the cart rows keep, because a price with a minus sign reverses into
 * nonsense under RTL otherwise.
 */
function InvoiceRow({
  label,
  value,
  tone,
  coin = false,
  settling = false,
  washOnChange = false,
}: {
  label: ReactNode;
  value: string;
  tone?: string;
  /** The points coin beside the figure. */
  coin?: boolean;
  /** The server is pricing a newly picked method: this figure is about to change. */
  settling?: boolean;
  /** The figure re-prices with the method (the fee): when it lands changed, it gets the one-shot wash. */
  washOnChange?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 text-body-s leading-[1.5] lg:text-body-l transition-opacity duration-200 ${settling ? "opacity-35" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">{label}</span>
      <span className="flex items-center gap-1">
        {washOnChange ? (
          <ChangedFigure value={value} className={`${MONEY} ${tone ?? "text-[var(--color-ink)]"}`} />
        ) : (
          <span dir="ltr" className={`${MONEY} ${tone ?? "text-[var(--color-ink)]"}`}>
            {value}
          </span>
        )}
        {coin ? <Image src={CURRENCY_ICON} alt="" aria-hidden width={16} height={16} unoptimized className="size-4" /> : null}
      </span>
    </div>
  );
}
