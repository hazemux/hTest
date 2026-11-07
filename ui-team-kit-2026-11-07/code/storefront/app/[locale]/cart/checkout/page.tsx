import { notFound, redirect } from "next/navigation";

import { TrackOnView } from "@/components/analytics/TrackOnView";
import { CartCheckoutForm, type CheckoutLineView, type CheckoutLoyaltyView } from "@/components/cart/CartCheckoutForm";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { PAY_BAR_LEGAL_CLEARANCE } from "@/components/checkout/styles";
import { checkoutAccount } from "@/lib/account/checkout-contact";
import { phoneCountries } from "@/lib/account/phone-countries";
import { savedCardsForCheckout } from "@/lib/account/saved-cards";
import { paymentCountry } from "@/lib/currency/payment-country";
import { isSignedIn, readSessionToken } from "@/lib/account/session";
import { visitorAccount } from "@/lib/account/visitor-account";
import { mapWallet } from "@/lib/loyalty/map";
import { loyaltyProgram } from "@/lib/loyalty/program";
import { ApiError, listPaymentMethods } from "@/lib/api/client";
import { readCart } from "@/lib/cart/cart";
import { completeLineHref } from "@/lib/cart/complete-href";
import { quoteCart } from "@/lib/cart/checkout";
import { readCartCoupon } from "@/lib/cart/coupon";
import { vaultedKeys } from "@/lib/cart/credential-vault";
import { cartAnalyticsItems } from "@/lib/analytics/items";
import { hydrateCart } from "@/lib/cart/queries";
import { cartSyncEnabled, recordFunnel, touchCart } from "@/lib/cart/recovery-sync";
import { openingMethod, orderCurrencyFor, withQuotedCharge, type PaymentMethodView } from "@/lib/checkout/methods";
import { countryForVisitor, currencyForVisitor } from "@/lib/currency/visitor";
import { storeSettings } from "@/lib/content/settings";
import { reportBrowsing } from "@/lib/analytics/server-events";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { cookies } from "next/headers";
import { VIP_UPSELL_COOKIE, VIP_UPSELL_HIDDEN } from "@/lib/loyalty/vip-upsell";

/**
 * Checkout for a whole cart.
 *
 * The only checkout: «شراء سريع» on the product page comes here through the
 * basket too, and the old single-item `/checkout/[productSlug]` now opens the
 * product page (2026-10-02).
 */
export default async function CartCheckoutPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const currency = await currencyForVisitor();
  const basket = await readCart();
  const cart = await hydrateCart(basket, { locale, currency });

  // The mirror learns the basket reached checkout, and the funnel its
  // «checkout started» (ADR 0039) — after the response, never in its way.
  const trackedRef = basket.length > 0 ? ((await touchCart("checkout", basket, locale)) ?? undefined) : undefined;
  if (basket.length > 0) await recordFunnel([{ step: "checkout_started" }], { locale, ref: trackedRef });
  // A boolean, never the token: is there a session cookie at all? It only
  // decides which reads go out below. Whether the API still ACCEPTS it — and
  // so whether to ask for the guest's contact details — is `accountRead`'s
  // answer, awaited with the rest (a refused cookie is a guest).
  const hasSessionCookie = await isSignedIn();
  // Only the session decides these, so they go out now and are collected at
  // the end — not after the whole quote → methods → method-quote chain below.
  // Both swallow their own failures, so an early redirect leaves nothing
  // unhandled.
  const savedCardsRead = hasSessionCookie ? savedCardsForCheckout(locale) : Promise.resolve([]);
  const accountRead = hasSessionCookie ? checkoutAccount(locale) : Promise.resolve({ signedIn: false, contact: null });
  // «رصيدك ونقاطك» (ADR 0043 §3): the wallet with the SAME arguments the
  // layout used (one read per render), and the cached programme.
  // Dismissed earlier this session (a session cookie — `lib/loyalty/vip-upsell.ts`).
  const vipUpsellDismissed = (await cookies()).get(VIP_UPSELL_COOKIE)?.value === VIP_UPSELL_HIDDEN;
  const loyaltyRead: Promise<CheckoutLoyaltyView | null> = hasSessionCookie
    ? Promise.all([readSessionToken().then((token) => visitorAccount(locale, token, currency)), loyaltyProgram(locale, currency)]).then(([{ customer, wallet }, program]) => {
        const mapped = customer && wallet ? mapWallet(wallet, locale, customer.name) : null;
        if (!mapped || !program) return null;
        const topUp = program.features.topup && program.topUp !== null;
        return {
          pointsAvailable: mapped.points.available,
          program: { minRedeem: program.minRedeem, maxSharePct: program.maxSharePct, topUp },
          topUpHref: topUp ? `/${locale}/account/points/top-up` : null,
          topUpBonusPct: topUp ? (program.topUp?.bonusPct ?? null) : null,
          tierName: mapped.tier?.name ?? null,
          // «وفّر رسوم الدفع مع VIP»: only while VIP is on and the customer is
          // not inside a period (the wallet's badge, from the layout's read).
          vipUpsellHref: program.features.vip && mapped.vip === null ? `/${locale}/account/vip` : null,
          vipUpsellDismissed,
        };
      })
      // Handled HERE, not at the final await: an early redirect below would
      // otherwise leave a failed read rejecting unobserved.
      .catch(() => null)
    : Promise.resolve(null);

  // Something in the basket cannot be ordered: back to the cart, which is the
  // page that can say which line and why.
  if (cart.hasUnavailable) redirect(`/${locale}/cart`);
  // The ad platforms' «start checkout», with what the basket holds (v0.1.149)
  // — only for a basket that can be ordered; an empty one sends nothing.
  await reportBrowsing(
    "start_checkout",
    cart.lines.flatMap((view) => (view.productPublicId ? [{ productPublicId: view.productPublicId, packPublicId: view.line.packPublicId, quantity: view.line.quantity }] : [])),
    locale,
  );

  /*
   * AN EMPTY BASKET IS RENDERED, NOT REDIRECTED — and that is load-bearing.
   * Placing the order empties the basket cookie from inside a Server Action,
   * and Next re-renders this page in response. A redirect here fired during
   * that re-render and unmounted the form a moment after the order existed,
   * so the bank-transfer details and the price-change question it was about
   * to show were replaced by an empty cart page (found by placing one). The
   * form now keeps its post-order screens and draws "your basket is empty"
   * only when there is no order in hand.
   */
  const empty = cart.lines.length === 0;

  // THE SERVER'S QUOTE, before anything else is decided. Every figure this
  // page draws — each line, the total, the amount the method list is asked
  // about — comes from it, so the page and the form start from one number.
  // The code applied on the basket, if any. Priced again here like any code;
  // one the server no longer accepts is dropped rather than blanking the page
  // — and the form says so, in one line pointing back to the basket.
  const cartCoupon = (await readCartCoupon()) ?? undefined;
  let quoted = empty ? null : await quoteCart({ locale, currency, couponCode: cartCoupon });
  let couponDropped = false;
  // The API's own sentence when the dropped code needed an account — the form
  // adds the way to sign in and come back here.
  let couponSignInMessage: string | undefined;
  if (cartCoupon && quoted && !quoted.quote && !quoted.stale) {
    if (quoted.couponReason === "sign_in_required") couponSignInMessage = quoted.couponError;
    quoted = await quoteCart({ locale, currency });
    couponDropped = Boolean(quoted.quote);
  }
  if (quoted?.stale) redirect(`/${locale}/cart`);
  // Stuck on a line's details — the order button stays locked, so placement
  // never reports it. The funnel hears the CATEGORY only.
  if (quoted?.fieldError) await recordFunnel([{ step: "fields_invalid", detail: quoted.fieldError }], { locale, ref: trackedRef });
  let quote = quoted?.quote ?? null;

  let methods: PaymentMethodView[] = [];
  let pricedWith: string | null = null;
  if (quote) {
    try {
      methods = (await listPaymentMethods(
        // The AMOUNT matters: eligibility is per-amount as well as per-currency,
        // and a rail that cannot take this total must not be offered for it.
        // The server's figure, never one added up here.
        { currency, country: await paymentCountry(), amount: quote.total },
        { locale },
      )) as PaymentMethodView[];
    } catch (error) {
      // The strip must never advertise a rail this store cannot take
      // (HANDBOOK §1). No list is an honest empty, never a guessed default.
      if (!(error instanceof ApiError)) throw error;
      methods = [];
    }

    // PRICED WITH THE METHOD THE FORM OPENS ON, so the first total shown
    // already includes its processing fee — the amount that method charges.
    // The FORM's opening method, not the list's first entry: a server that
    // lists a wallet first would otherwise price the page with a wallet's fee
    // under a card row.
    const first = openingMethod(methods)?.code;
    if (first) {
      // In the method's own currency when it forces one (Binance Pay: USD).
      const firstCurrency = orderCurrencyFor(methods.find((option) => option.code === first), currency);
      let priced = await quoteCart({ locale, currency: firstCurrency, gatewayCode: first, couponCode: quote.couponCode ?? undefined });
      // The code refused WITH this method: priced without it, and said once
      // — the same rule the form keeps when a method is picked.
      if (!priced.quote && priced.couponError && quote.couponCode) {
        if (priced.couponReason === "sign_in_required") couponSignInMessage = priced.couponError;
        priced = await quoteCart({ locale, currency: firstCurrency, gatewayCode: first });
        if (priced.quote) couponDropped = true;
      }
      if (priced.stale) redirect(`/${locale}/cart`);
      if (priced.quote) {
        quote = priced.quote;
        pricedWith = first;
      }
      // Still no price for the method: `pricedWith` stays null, and the form
      // asks once more itself — and says why if that fails too.
    }

    // What a currency-switching method (Binance Pay) will charge: a real
    // quote in its own currency, never a conversion (`withQuotedCharge`).
    const couponCode = quote.couponCode ?? undefined;
    const openingQuote = quote;
    methods = await withQuotedCharge(methods, currency, async (option) => {
      if (pricedWith === option.code) return openingQuote.totalDue;
      const priced = await quoteCart({ locale, currency: option.charge_currency!, gatewayCode: option.code, couponCode });
      return priced.quote?.totalDue ?? null;
    });
  }

  // «المنتجات» — what is being bought, as the basket shows it: the artwork,
  // the name, the tier, the fields that tell two lines of one product apart
  // (LABELLED AND FILTERED — `view.fields`, never the raw line: a password is
  // never drawn), and which credentials are held or still needed.
  //
  // A password typed on the product page is HELD (the vault): the page learns
  // only WHICH fields are held — the values stay server-side and join the
  // order there (`placeCartOrder`). One that is not held is completed on the
  // product page, the only place details are typed (owner, 2026-10-02).
  const held = await vaultedKeys();
  const lines: CheckoutLineView[] = cart.lines.map((view) => ({
    id: view.id,
    name: view.name,
    image: view.image ? { url: view.image.url, drawn: view.image.drawn ?? null } : null,
    denominationLabel: view.denominationLabel,
    quantity: view.line.quantity,
    fields: view.fields,
    heldCredentials: view.credentials
      .filter((field) => held[view.id]?.includes(field.key))
      .map((field) => field.label?.[locale] || field.label?.en || field.key),
    // Not held (two hours passed, another browser, an older basket): named,
    // with the way back to the product page — never a box on this page.
    missingCredentials: view.credentials
      .filter((field) => !held[view.id]?.includes(field.key))
      .map((field) => field.label?.[locale] || field.label?.en || field.key),
    completeHref: completeLineHref(locale, view),
  }));

  const [savedCards, { signedIn, contact: account }, loyalty] = await Promise.all([savedCardsRead, accountRead, loyaltyRead]);

  // GUESTS CLOSED (Settings › Checkout «guest checkout», owner 2026-10-28):
  // a visitor without an account signs in first. The API refuses their order
  // anyway (403 `guest_checkout_disabled`); this keeps them from filling in
  // a form that cannot be sent. An unreadable setting leaves the page open.
  if (!signedIn) {
    const settings = await storeSettings(locale).catch(() => null);
    if (settings?.data?.checkout?.guest_checkout_enabled === false) {
      redirect(`/${locale}/account/sign-in?next=${encodeURIComponent(`/${locale}/cart/checkout`)}`);
    }
  }

  // The guest phone's picker starts on the visitor's country (sign-up's rule).
  const guestPhoneCountry = signedIn ? "" : await countryForVisitor();

  return (
    <main className={`mx-auto w-full max-w-[1248px] flex-1 px-6 lg:pb-12 lg:pt-12 ${PAY_BAR_LEGAL_CLEARANCE}`}>
      <CheckoutHeader locale={locale} title={m.cart.checkout} backHref={`/${locale}/cart`} />

      <TrackOnView
        event="checkout"
        signature={cart.lines.map((view) => view.id).join(",")}
        items={cartAnalyticsItems(cart.lines)}
      />
      <div className="max-lg:pt-1">
        <CartCheckoutForm
          locale={locale}
          currency={currency}
          initialQuote={quote}
          pricedWith={pricedWith}
          couponDropped={couponDropped}
          couponSignInMessage={couponSignInMessage}
          // Why the basket could not be priced — a field an admin has since
          // tightened, say. Named, and the order button locked: placement
          // would be refused for the same reason a second later.
          initialQuoteError={quote || empty ? undefined : (quoted?.error ?? m.checkout.quoteFailed)}
          empty={empty}
          lines={lines}
          methods={methods}
          signedIn={signedIn}
          offerMarketingOptIn={cartSyncEnabled()}
          savedCards={signedIn ? savedCards : []}
          account={account}
          loyalty={signedIn ? loyalty : null}
          phoneCountries={signedIn ? [] : phoneCountries(locale)}
          defaultPhoneCountry={guestPhoneCountry}
        />
      </div>
    </main>
  );
}
