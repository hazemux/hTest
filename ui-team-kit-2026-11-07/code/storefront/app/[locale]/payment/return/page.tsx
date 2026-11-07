import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/checkout/AutoRefresh";
import { SettleBasket } from "@/components/checkout/SettleBasket";
import { ClaimInvite } from "@/components/checkout/ClaimInvite";
import { AddEmailCard } from "@/components/account/AddEmailCard";
import { OrderPayAgain } from "@/components/checkout/OrderPayAgain";
import { readSessionToken } from "@/lib/account/session";
import { cartOrder } from "@/lib/cart/pending-order";
import { reorder } from "@/lib/cart/actions";
import { DELIVERY_REFRESH_SECONDS, deliveryStage } from "@/lib/checkout/delivery-stage";
import { isOrderId } from "@/lib/checkout/order-id";
import { readOrderToken } from "@/lib/checkout/order-token";
import { failureSentence, shownGatewayReason } from "@/lib/checkout/failure-copy";
import { readPaymentOutcome } from "@/lib/checkout/payment";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { isLatePayment } from "@/lib/orders/customer-status";
import { payAgainOptions } from "@/lib/orders/pay-again";
import { lineName } from "@/lib/orders/purchased";
import { paymentWindowExpired } from "@/lib/orders/status";
import { SubmitButton } from "@/components/ui/SubmitButton";

import { ResultMark, type ResultTone } from "./ResultMark";
import { ChargedMoment, WarmChargedMoment } from "@/components/checkout/ChargedMoment";
import { FinishBuyGuide } from "@/components/catalog/BuyGuide";
import { celebrationsEnabled } from "@/lib/celebrate/once";
import { lineArtworks } from "@/lib/orders/line-artwork";
import { ArtworkFill } from "@/components/catalog/ArtworkFill";

/**
 * Where Tap sends the customer back to — drawn as «Payment Result Mobile»
 * (Claude Design, 2026-09-30): one headline in the outcome's colour, then
 * what that outcome needs, the order's summary, and the ways on.
 *
 * ARRIVING HERE PROVES NOTHING. Tap appends a `tap_id` to this URL and it
 * would be easy to read that as success — it is not. Anyone can type this
 * address, a browser can replay it from history, and a customer can land here
 * having abandoned the payment page entirely. The ONLY thing that decides is
 * the order, read from our own API, whose payment_state the webhook and the
 * five-minute reconciliation poll are what actually move.
 *
 * There is deliberately no success animation on arrival. That is the defect
 * spec §E was written to prevent: a page that celebrates before the money is
 * confirmed teaches customers to trust a screen that can be wrong.
 *
 * THE FIVE OUTCOMES:
 *   - paid     — delivery is under way; a GUEST is invited to keep the order
 *                on an account (`order.claim`, the owner's «invite, don't
 *                create» — nothing is made for them);
 *   - retry    — the card was declined, nothing was charged, and the SAME
 *                order can be paid right here with another method;
 *   - failed   — the order has closed; «إعادة الشراء» builds a new one;
 *   - pending  — the bank answered and we are confirming: don't pay again;
 *                the page asks the server again by itself;
 *   - unknown  — no order this browser can read.
 */
/** Moves the whole page here when this page finds itself framed. Reads nothing from the request. */
const LEAVE_FRAME = "if(window.top!==window.self){try{window.top.location.replace(window.location.href)}catch(e){}}";

export default async function PaymentReturnPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { order } = await props.searchParams;
  const m = messagesFor(locale);

  // No order id, or one that is not shaped like ours — a customer who came
  // back through history, typed the URL, or followed a mangled link. Not an
  // error worth alarming them about, and never a value we go on to
  // interpolate into a link. See lib/checkout/order-id.ts.
  if (!isOrderId(order)) {
    return (
      <Result locale={locale} tone="pending" title={m.payment.unknownTitle} body={m.payment.unknownBody}>
        <Link href={`/${locale}`} className={PRIMARY}>
          {m.catalog.browse}
        </Link>
      </Result>
    );
  }

  const { outcome, failureReason, declineCategory, order: read, standing } = await readPaymentOutcome(order, locale);
  const detailsHref = `/${locale}/order-status/${encodeURIComponent(order)}`;

  // Nothing this browser can read (its cookie did not come back from the
  // bank, say): never «failed» — that invites paying twice — but «we are
  // confirming», with the order's page one tap away.
  if (outcome === "unknown" || !read) {
    return (
      <Result locale={locale} tone="pending" title={m.payment.pendingTitle} body={m.payment.pendingBody} orderId={order}>
        <Link href={detailsHref} className={PRIMARY}>
          {m.account.orderDetails}
        </Link>
        {/* Unreadable can be a brief API outage, not only a missing cookie:
            keep asking, as the pending branch does. */}
        {celebrationsEnabled() ? <WarmChargedMoment /> : null}
        <AutoRefresh notice={m.paymentResult.autoRefresh} stoppedNotice={m.paymentResult.autoRefreshStopped} refreshLabel={m.paymentResult.refreshNow} />
      </Result>
    );
  }

  const [guestToken, session, basketOrder] = await Promise.all([readOrderToken(order), readSessionToken(), cartOrder()]);

  if (outcome === "captured") {
    const delivery = deliveryStage(read.fulfillment_state);
    return (
      <Result
        locale={locale}
        tone="done"
        title={m.payment.paidTitle}
        body={m.paymentResult.paidBody}
        orderId={order}
        // «تم الشحن» (owner, 2026-11-03): only here, where the server said captured.
        celebration={celebrationsEnabled() ? <ChargedMoment orderId={order} /> : null}
      >
        {/* Captured after the return: the basket this order came from is
            emptied now (the server re-checks both facts). */}
        {basketOrder === order ? <SettleBasket orderId={order} locale={locale} /> : null}
        {/* Bought once in this browser: «كيف تشحن؟» is done (`BuyGuide`). */}
        <FinishBuyGuide />
        {delivery === "delivering" ? (
          <>
            <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-info-wash)] p-3.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[var(--color-info)] shadow-[0_0_0_4px_var(--color-info-wash)] motion-safe:animate-pulse" />
              <span className="flex flex-1 flex-col">
                <span className="text-body-s font-bold lg:text-body-l">{m.paymentResult.delivering}</span>
                <span className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.paymentResult.deliveringLead.replace("{details}", m.account.orderDetails)}</span>
              </span>
            </div>
            {/* Asks again until the server says delivered or stopped — the line
                above then changes and this goes (`lib/checkout/delivery-stage.ts`). */}
            <AutoRefresh
              forSeconds={DELIVERY_REFRESH_SECONDS}
              notice={m.paymentResult.deliveryAutoRefresh}
              stoppedNotice={m.paymentResult.autoRefreshStopped}
              refreshLabel={m.paymentResult.refreshNow}
            />
          </>
        ) : (
          <div
            className={`flex items-center gap-3 rounded-[16px] p-3.5 ${delivery === "delivered" ? "bg-[var(--color-success-wash)]" : "bg-[var(--color-warning-wash)]"}`}
          >
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${delivery === "delivered" ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`}
            />
            <span className="flex flex-1 flex-col">
              <span className="text-body-s font-bold lg:text-body-l">{delivery === "delivered" ? m.paymentResult.delivered : m.paymentResult.deliveryStopped}</span>
              <span className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">
                {(delivery === "delivered" ? m.paymentResult.deliveredLead : m.paymentResult.deliveryStoppedLead).replace("{details}", m.account.orderDetails)}
              </span>
            </span>
          </div>
        )}
        {read.claim ? (
          <ClaimInvite locale={locale} orderId={order} pointsEstimate={read.claim.points_estimate_pts ?? null} signedIn={Boolean(session)} />
        ) : null}
        {session ? <AddEmailCard locale={locale} /> : null}
        <Summary locale={locale} order={read} paid />
        <div className="flex flex-col gap-2.5">
          <Link href={detailsHref} className={PRIMARY}>
            {m.account.orderDetails}
          </Link>
          <Link href={`/${locale}`} className={SECONDARY}>
            {m.paymentResult.keepShopping}
          </Link>
          <Link
            href={`${detailsHref}/invoice`}
            className="flex items-center gap-1.5 self-center py-1 text-caption font-bold text-[var(--color-brand-500)] hover:underline lg:text-body-s"
          >
            <span aria-hidden className="block size-3.5 bg-current [mask-image:url(/brand/icon-download.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            {m.orderStatus.downloadInvoice}
          </Link>
        </div>
      </Result>
    );
  }

  // THE MONEY ARRIVED AFTER THE ORDER CLOSED (ADR 0038): the order stays closed
  // and is never fulfilled, but the gateway DID take the payment and it is
  // being returned. Checked before the two «nothing was charged» branches
  // below, which describe an order that closed with no money taken — on a
  // closed order the page alone cannot tell them apart; the server's reason can.
  if (outcome === "failed" && isLatePayment(read)) {
    return (
      <Result locale={locale} tone="failed" title={m.paymentResult.lateTitle} body={m.paymentResult.lateBody} orderId={order}>
        <Summary locale={locale} order={read} />
        <div className="flex flex-col gap-2.5">
          <form action={reorder} className="w-full">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="order" value={order} />
            <SubmitButton className={`${PRIMARY} gap-2`}>
              <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-refresh.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.orderStatus.orderAgain}
            </SubmitButton>
          </form>
          <Link href={detailsHref} className={SECONDARY}>
            {m.account.orderDetails}
          </Link>
        </div>
      </Result>
    );
  }

  // THE PAYMENT WINDOW HAS PASSED (ADR 0038): closed, or about to be, and the
  // API takes no payment for it. Never «try again» — order again, as a NEW
  // order priced today; the basket gets the same lines and valid player details.
  if ((outcome === "retry" || outcome === "failed") && paymentWindowExpired(read, Boolean(livePaymentPage(standing?.charge?.redirect_url)))) {
    return (
      <Result locale={locale} tone="failed" title={m.paymentResult.expiredTitle} body={m.paymentResult.expiredBody} orderId={order}>
        <Summary locale={locale} order={read} />
        <div className="flex flex-col gap-2.5">
          <form action={reorder} className="w-full">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="order" value={order} />
            <SubmitButton className={`${PRIMARY} gap-2`}>
              <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-refresh.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.orderStatus.orderAgain}
            </SubmitButton>
          </form>
          <Link href={detailsHref} className={SECONDARY}>
            {m.account.orderDetails}
          </Link>
        </div>
      </Result>
    );
  }

  // The card did not go through, and the order is still open — pay THE SAME
  // order again right here. Nothing was charged, and the basket was kept: it
  // empties only once a payment is verified.
  if (outcome === "retry") {
    const signedIn = !guestToken && Boolean(session);
    const { methods, savedCards, contact } = await payAgainOptions(read, { locale, signedIn });
    const reason = shownGatewayReason(failureReason);
    return (
      <Result
        locale={locale}
        tone="failed"
        title={m.paymentResult.retryTitle}
        body={failureSentence(m, failureReason ?? null, m.paymentResult.retryBody, declineCategory)}
        orderId={order}
      >
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 rounded-[12px] bg-[var(--color-success-subtlest)] px-3 py-2.5 text-caption font-bold text-[var(--color-success)] lg:text-body-s">
            <span aria-hidden className="block size-4 shrink-0 bg-current [mask-image:url(/brand/icon-shield-tick.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            {m.paymentResult.noCharge}
          </p>
          {reason ? (
            <p dir="auto" className="text-center text-caption text-[var(--color-ink-subtle)]">
              {m.payment.gatewayReason.replace("{reason}", reason)}
            </p>
          ) : null}
        </div>
        {methods.length > 0 && standing?.charge?.retryable ? (
          // The form carries its own «طريقة الدفع» heading.
          <section className="flex flex-col gap-3">
            <OrderPayAgain
              locale={locale}
              orderId={order}
              methods={methods}
              signedIn={signedIn}
              savedCards={savedCards}
              amount={read.pricing.total}
              currency={read.pricing.currency}
              // The headline and the line above already give the reason.
              lastFailure={null}
              contact={contact}
            />
            <p className="text-center text-caption text-[var(--color-ink-subtle)]">{m.paymentResult.basketKept}</p>
          </section>
        ) : (
          <Link href={detailsHref} className={PRIMARY}>
            {m.payment.tryAnotherCard}
          </Link>
        )}
        <Summary locale={locale} order={read} />
        <Link href={detailsHref} className={SECONDARY}>
          {m.account.orderDetails}
        </Link>
      </Result>
    );
  }

  if (outcome === "failed") {
    // ONE CHARGE SLOT PER ORDER, so a declined card means a new order — and
    // «إعادة الشراء» builds it: the same lines back in the basket, with their
    // player IDs, priced today. The order page stays one tap away.
    return (
      <Result locale={locale} tone="failed" title={m.paymentResult.failedTitle} body={m.paymentResult.failedBody} orderId={order}>
        <Summary locale={locale} order={read} />
        <div className="flex flex-col gap-2.5">
          <form action={reorder} className="w-full">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="order" value={order} />
            <SubmitButton className={`${PRIMARY} gap-2`}>
              <span aria-hidden className="block size-[18px] shrink-0 bg-current [mask-image:url(/brand/icon-refresh.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              {m.account.reorder}
            </SubmitButton>
          </form>
          <Link href={detailsHref} className={SECONDARY}>
            {m.account.orderDetails}
          </Link>
        </div>
      </Result>
    );
  }

  // THE PAYMENT PAGE IS STILL OPEN: the customer came back without finishing
  // it — pressed back on OmanNet's or KNET's page, say. Not "confirming":
  // that page is where they finish, and it is the SAME charge, never a second.
  // Once it expires, the API closes the attempt and this becomes «retry».
  const continueUrl = livePaymentPage(standing?.charge?.redirect_url);
  if (continueUrl) {
    // OR ANOTHER WAY, right here (owner, 2026-10-04): OmanNet may not take
    // their card. Choosing another method closes the unfinished page — the
    // API does so only when Tap says nothing was paid on it (ReleaseOpenPage).
    // No auto-refresh here: it would redraw the form under a typing customer.
    const signedIn = !guestToken && Boolean(session);
    const { methods, savedCards, contact } = await payAgainOptions(read, { locale, signedIn });
    return (
      <Result locale={locale} tone="pending" title={m.paymentResult.unfinishedTitle} body={m.paymentResult.unfinishedBody} orderId={order}>
        <a href={continueUrl} className={PRIMARY}>
          {m.paymentResult.continuePayment}
        </a>
        {methods.length > 0 ? (
          <section aria-labelledby="pay-another-way" className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-5">
            <h2 id="pay-another-way" className="text-body-m font-bold lg:text-heading-m">
              {m.paymentResult.payAnotherWay}
            </h2>
            <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.paymentResult.unfinishedLater}</p>
            <OrderPayAgain
              locale={locale}
              orderId={order}
              methods={methods}
              signedIn={signedIn}
              savedCards={savedCards}
              amount={read.pricing.total}
              currency={read.pricing.currency}
              lastFailure={null}
              contact={contact}
            />
          </section>
        ) : null}
        <Summary locale={locale} order={read} />
        <Link href={detailsHref} className={SECONDARY}>
          {m.account.orderDetails}
        </Link>
      </Result>
    );
  }

  return (
    <Result locale={locale} tone="pending" title={m.payment.pendingTitle} body={m.payment.pendingBody} orderId={order}>
      <Summary locale={locale} order={read} />
      <div className="flex flex-col gap-2.5">
        <Link href={detailsHref} className={PRIMARY}>
          {m.account.orderDetails}
        </Link>
        {celebrationsEnabled() ? <WarmChargedMoment /> : null}
        <AutoRefresh notice={m.paymentResult.autoRefresh} stoppedNotice={m.paymentResult.autoRefreshStopped} refreshLabel={m.paymentResult.refreshNow} />
      </div>
    </Result>
  );
}

const PRIMARY =
  "flex h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)]";
const SECONDARY =
  "flex h-[50px] w-full items-center justify-center rounded-[12px] px-4 text-body-s font-bold text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] transition hover:bg-[var(--color-chip)]";

/** The gateway's page for the open charge — only ever an https address. */
function livePaymentPage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

type ReadOrder = NonNullable<Awaited<ReturnType<typeof readPaymentOutcome>>["order"]>;

/** «ملخص الطلب»: what was bought, the server's total, and — once paid — how, and the points it earned. */
async function Summary({ locale, order, paid = false }: { locale: Locale; order: ReadOrder; paid?: boolean }) {
  const m = messagesFor(locale);
  const items = order.items ?? [];
  // Each line's picture as its product's page shows it (`lineArtworks`).
  const lineArt = await lineArtworks(items, locale).catch(() => items.map(() => null));

  return (
    <section aria-labelledby="summary" className="flex flex-col gap-2.5">
      <h2 id="summary" className="text-body-m font-bold lg:text-heading-m">
        {m.paymentResult.summary}
      </h2>
      <div className="rounded-[16px] bg-[var(--color-chip)] px-3.5 py-1">
        <ul>
          {items.map((item, index) => {
            const name = lineName(item, locale);
            const image = lineArt[index] ?? null;
            return (
              <li key={index} className="flex min-h-[60px] items-center gap-2.5 border-b border-[var(--color-line)]">
                <span className={`relative block size-10 shrink-0 overflow-hidden rounded-[10px] ${image ? "" : "bg-[var(--color-brand-500)]"}`}>
                  {image ? <ArtworkFill art={image} alt={image.alt} sizes="40px" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-body-s font-bold lg:text-body-l">{name}</span>
                <span dir="ltr" className="shrink-0 text-caption font-bold text-[var(--color-ink-subtle)] lg:text-body-s">
                  × {item.quantity}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-baseline justify-between gap-3 pb-1.5 pt-3">
          <span className="text-body-s font-bold lg:text-body-l">{paid ? m.orderStatus.grandTotal : m.orderStatus.total}</span>
          <span dir="ltr" className="text-heading-m font-bold tabular-nums lg:text-heading-l text-[var(--color-brand-500)]">
            {formatMoney(locale, order.pricing.total, order.pricing.currency)}
          </span>
        </div>
        {paid && (order.payment_method || order.points_earned_pts) ? (
          <div className="flex justify-between gap-3 pb-3 text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
            <span>{order.payment_method ? m.paymentMethodName[order.payment_method] : null}</span>
            {order.points_earned_pts ? (
              <span className="flex items-center gap-1">
                <b dir="ltr" className="text-[var(--color-ink)]">
                  +{formatPoints(locale, String(order.points_earned_pts))}
                </b>
                <Image src={CURRENCY_ICON} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5" />
              </span>
            ) : null}
          </div>
        ) : (
          <div className="pb-1.5" />
        )}
      </div>
    </section>
  );
}

/**
 * The result page. On the phone it stands alone — the store's logo and a
 * close button over it, no navbar or tab bar (`SiteChrome`); from `lg` it is
 * a centred column under the site header.
 */
function Result({
  locale,
  tone,
  title,
  body,
  orderId,
  celebration = null,
  children,
}: {
  locale: Locale;
  tone: ResultTone;
  title: string;
  body: string;
  orderId?: string;
  /** Drawn over the disc, centred on it — the paid result's moment. */
  celebration?: React.ReactNode;
  children: React.ReactNode;
}) {
  const m = messagesFor(locale);
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col px-6 pb-9 text-[var(--color-ink)] lg:py-16">
      {/* The third way out of the bank-check sheet's frame, for a browser
          that sent no `Sec-Fetch-Dest` (lib/checkout/bank-check.ts): runs as
          the HTML parses, so the result is never read inside the frame. */}
      <script dangerouslySetInnerHTML={{ __html: LEAVE_FRAME }} />
      <header className="-mx-2 flex h-[60px] items-center justify-between lg:hidden">
        <Link href={`/${locale}`} aria-label={m.common.storeName}>
          <Image src="/brand/logo-chargerquick-wide.svg" alt="" width={321} height={106} className="cq-light-theme-only h-8 w-auto" />
          <Image src="/brand/logo-chargerquick-wide-light.svg" alt="" width={321} height={106} className="cq-dark-theme-only h-8 w-auto" />
        </Link>
        <Link href={`/${locale}`} aria-label={m.paymentResult.close} className="grid size-9 place-items-center rounded-full bg-[var(--color-chip)]">
          <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </Link>
      </header>

      <div className="flex flex-col gap-[22px] pt-4 lg:pt-0">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="relative">
            <ResultMark tone={tone} />
            {celebration}
          </span>
          <h1 className="mt-1 text-display font-bold leading-[1.35] lg:text-[32px]">{title}</h1>
          <p className="max-w-[300px] text-body-s leading-[1.65] lg:text-body-l text-[var(--color-ink-muted)]">{body}</p>
          {orderId ? (
            <p className="text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
              {m.orderView.orderNo}{" "}
              <bdi dir="ltr" className="font-bold text-[var(--color-ink)]">
                #{orderId}
              </bdi>
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}
