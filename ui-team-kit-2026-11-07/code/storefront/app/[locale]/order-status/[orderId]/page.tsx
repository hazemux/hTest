import Image from "next/image";
import { connection } from "next/server";
import { allExempt } from "@/lib/catalog/tax";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BankTransferPanel } from "@/components/checkout/BankTransferPanel";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { SettleBasket } from "@/components/checkout/SettleBasket";
import { ClaimInvite } from "@/components/checkout/ClaimInvite";
import { ContinueBankCheck } from "@/components/checkout/ContinueBankCheck";
import { CopyButton } from "@/components/checkout/CopyButton";
import { TransferProofForm } from "@/components/checkout/TransferProofForm";
import { OrderPointsSection } from "@/components/loyalty/OrderPointsSection";
import { mapOrderLoyalty } from "@/lib/loyalty/map";
import { isNonZeroAmount } from "@/lib/loyalty/format";
import { FileChooser } from "@/components/ui/FileChooser";
import type { CheckoutContact } from "@/lib/wallets/apple-customer";
import { readSessionToken } from "@/lib/account/session";
import { ApiError, getOrder, getOrderPayment, getOrderReview } from "@/lib/api/client";
import { OPTIONAL_DEADLINE_MS } from "@/lib/api/deadlines";
import { RateOrderButton } from "@/components/reviews/RateOrderButton";
import { cartOrder } from "@/lib/cart/pending-order";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { requestRefund } from "@/lib/orders/refund";
import { FieldCorrectionForm } from "@/components/orders/FieldCorrectionForm";
import { LineDelivered } from "@/components/orders/LineDelivered";
import { correctableFields } from "@/lib/orders/field-correction";
import { readOrderToken } from "@/lib/checkout/order-token";
import { decodeDraft, proofDraftCookie, type ProofOutcome } from "@/lib/checkout/transfer-proof";
import { OrderPayAgain } from "@/components/checkout/OrderPayAgain";
import { ResumePayment } from "@/components/checkout/ResumePayment";
import type { SavedCardView } from "@/components/checkout/payment/PaymentSection";
import type { PaymentMethodView } from "@/lib/checkout/methods";
import { reorder } from "@/lib/cart/actions";
import { BANK_CHECK_METHODS } from "@/lib/checkout/bank-check";
import { declineSentence, shownGatewayReason } from "@/lib/checkout/failure-copy";
import { displayFieldValue } from "@/lib/fields/options";
import { CUSTOMER_STATUS_TONE, customerStatus, customerStatusReason, isLatePayment } from "@/lib/orders/customer-status";
import { canReorderOrder, orderDetailStatus, DETAIL_STEPS, type OrderDetailStatus, type StepMark } from "@/lib/orders/status";
import { orderFieldDefinitions } from "@/lib/orders/field-definitions";
import { payAgainOptions } from "@/lib/orders/pay-again";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";
import { lineArtworks, linePackIcons } from "@/lib/orders/line-artwork";
import { lineDenomination, lineName } from "@/lib/orders/purchased";
import { orderLinePackQuery } from "@/lib/catalog/pack-link";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { storeSettings } from "@/lib/content/settings";
import { ArtworkFill } from "@/components/catalog/ArtworkFill";

/**
 * The customer's own view of their order — and the place they CONTINUE from.
 * Drawn as «Order Details Mobile» (Claude Design, 2026-09-30): where the
 * order stands in one sentence with its icon, the number to copy, three steps,
 * the ONE next thing to do, what was bought and where its delivery is, the
 * invoice, and a short list of actions.
 *
 * TWO CREDENTIALS OPEN THIS PAGE, AND NEITHER IS THE URL. The HttpOnly cookie
 * holding THIS order's guest token, or the signed-in customer's session. Order
 * ids are guessable, so without one of them the page would be a way to read a
 * stranger's purchase; with them, a cookie for order A still cannot open order
 * B, and a session only opens the orders the API agrees belong to that account.
 *
 * ORDER OF PREFERENCE IS GUEST TOKEN FIRST. It is the narrower credential —
 * scoped to one order — and a browser holding both is a customer who bought as
 * a guest and later signed in. Presenting the narrow one is the smaller claim;
 * it is also what lets the server offer that customer to keep the order on
 * their account (`order.claim`, v0.1.63).
 *
 * `no-store` and `Referrer-Policy: same-origin` (next.config.ts) because this page carries
 * someone's contact details and what they bought.
 */
export default async function OrderStatusPage(props: {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams: Promise<{ receipt?: string; claim?: string; review?: string; refund?: string }>;
}) {
  // Per request, always: this page is somebody's order.
  await connection();
  const { locale, orderId } = await props.params;
  if (!isLocale(locale)) notFound();

  const { receipt, claim, review: reviewParam, refund: refundParam } = await props.searchParams;
  const m = messagesFor(locale);
  const guestToken = await readOrderToken(orderId);
  const session = await readSessionToken();
  const bearerToken = guestToken ? undefined : session;

  // No credential of either kind in this browser: not authorised, and answered
  // as NOT FOUND rather than "forbidden". A 403 would confirm the order exists,
  // which is exactly the signal someone enumerating ids is looking for.
  if (!guestToken && !bearerToken) notFound();

  let order;
  try {
    order = await getOrder(orderId, { locale, guestToken, bearerToken });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 401)) {
      notFound();
    }
    throw error;
  }

  const p = order.pricing;
  const currency = p.currency;

  // A WAITING ORDER: where its payment stands, as Laravel reads it from Tap
  // (a card declined on the 3-D Secure page is `failed` here, the order still
  // open for another card), and whether Tap's embedded card form is on.
  // Neither is worth failing the page over — without them the order keeps
  // «أكمل الدفع».
  let standing: PaymentStanding | null = null;
  // What can pay THIS order again (`payAgainOptions`).
  let payAgain: PaymentMethodView[] = [];
  let savedCards: SavedCardView[] = [];
  let contact: CheckoutContact | null = null;
  if (order.payment_state === "initiated") {
    let options;
    [standing, options] = await Promise.all([
      getOrderPayment(orderId, { locale, guestToken, bearerToken }).catch(() => null),
      payAgainOptions(order, { locale, signedIn: Boolean(bearerToken) }),
    ]);
    ({ methods: payAgain, savedCards, contact } = options);
  }
  // A GUIDED transfer (v0.1.38) has its own page — the account, deadline,
  // order-number warning and proof upload live there, not here. Its status
  // comes with the order itself (v0.1.89).
  const transferStatus = order.payment_state === "awaiting_confirmation" ? (order.transfer_status ?? null) : null;
  const items = order.items ?? [];
  // Each line's picture as its product's page shows it (`lineArtworks`).
  // And each pack's currency picture, as its product page draws it (`linePackIcons`).
  const [definitions, lineArt, packIcons] = await Promise.all([
    orderFieldDefinitions(items, { locale, currency }),
    lineArtworks(items, locale).catch(() => items.map(() => null)),
    linePackIcons(items, locale).catch(() => items.map(() => null)),
  ]);

  // A price line is shown only when it exists. These are DISPLAY decisions, not
  // arithmetic: every figure below is a string the server already decided
  // (final_price, tax, processing_fee, total) and formatMoney only renders it.
  const hasVat = p.tax !== undefined && Number(p.tax) > 0;
  const fee = p.processing_fee;

  const status = orderDetailStatus(order, standing?.charge ?? null);
  // The TITLE and its tone are the status the server says the customer sees
  // (v0.1.121) — «ملغي» only when no money was taken, «مسترجع» when it was;
  // `status` above still decides the next step and the steps.
  const shown = customerStatus(order);
  const tone = CUSTOMER_STATUS_TONE[shown];
  // «صحّح بيانات طلبك» (ADR 0019 Q20): while the customer's ONE correction is
  // theirs, the line points at the form below; once it is spent (or the form
  // cannot be drawn) it is the server's «contact us».
  const fieldCorrection = order.field_correction ?? null;
  const correctable = fieldCorrection === "available" ? correctableFields(definitions[0] ?? {}, items[0]?.fields ?? {}) : [];
  const reasonLine =
    fieldCorrection === "available" && correctable.length > 0 && order.customer_status_reason === "needs_correction"
      ? m.fieldCorrection.reasonAvailable
      : customerStatusReason(order, m.customerStatusReason);
  // An order that ended AFTER its money moved says so — «nothing was charged»
  // is only true of a payment that failed. A payment that arrived AFTER the
  // order closed (late_payment) also leaves the payment track at `failed`,
  // closed or expired — yet the money did move, and is on its way back.
  const late = isLatePayment(order);
  const moneyMoved = order.payment_state !== "failed" || late;
  const headline = late
    ? m.customerStatusReason.late_payment
    : status !== "failed" || !moneyMoved
      ? m.orderView[`${status}Body`]
      : order.payment_state === "captured"
        ? m.orderView.deliveryFailedBody
        : order.payment_state === "refund_pending"
          ? m.orderView.refundPendingBody
          : m.orderView.refundedBody;
  const marks: readonly StepMark[] = late || (status === "failed" && moneyMoved) ? ["done", "done", "failed"] : DETAIL_STEPS[status];
  const paid = status === "completed" || status === "processing";
  const canReorder = canReorderOrder(order) && items.some((item) => item.product) && (paid || status === "failed" || status === "expired");
  // «الإبلاغ عن مشكلة» goes to the store's own WhatsApp when one is set.
  const settings = await storeSettings(locale).catch(() => null);
  const support = settings?.data?.general?.support_whatsapp?.replace(/\D/g, "") || null;
  // «قيم الطلب» (ADR 0042): the signed-in owner of a DELIVERED order rates it.
  // A guest has no account to sign or reward a review, so never sees it. Not
  // worth failing the page over: without the answer there is just no button.
  const reviewState =
    bearerToken && order.fulfillment_state === "delivered"
      ? await getOrderReview(orderId, { locale, bearerToken, deadlineMs: OPTIONAL_DEADLINE_MS }).catch(() => null)
      : null;
  const invoiceHref = `/${locale}/order-status/${encodeURIComponent(order.id)}/invoice`;
  // Where delivery is — none said for an order under review, where either
  // answer could be wrong.
  const delivery: [string, string] | null =
    status === "completed"
      ? [m.orderView.delivered, "text-[var(--color-success)]"]
      : status === "processing"
        ? [m.orderView.inProgress, "text-[var(--color-info)]"]
        : status === "review"
          ? null
          : [m.orderView.afterPayment, "text-[var(--color-ink-subtle)]"];

  // Captured after the customer left the return page: the basket this order
  // came from is emptied here too (the server re-checks both facts).
  const settleBasket = order.payment_state === "captured" && (await cartOrder()) === orderId;

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 text-[var(--color-ink)] lg:pt-[70px]">
      {settleBasket ? <SettleBasket orderId={orderId} locale={locale} /> : null}
      <CheckoutHeader
        locale={locale}
        title={m.orderView.title}
        backHref={session ? `/${locale}/account/orders` : `/${locale}`}
        end={
          <Link href={invoiceHref} aria-label={m.orderStatus.downloadInvoice} className="grid size-10 shrink-0 place-items-center rounded-[12px]">
            <span aria-hidden className="block size-5 bg-[var(--color-ink)] [mask-image:url(/brand/icon-download.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          </Link>
        }
      />

      <div className="grid items-start gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8 lg:pt-0 xl:grid-cols-[693px_387px] xl:justify-between xl:gap-x-0">
        <div className="flex min-w-0 flex-col gap-6">
          {/* WHERE IT STANDS — the icon in the stage's tone, one title, one line. */}
          <section className="flex flex-col gap-3.5">
            <div className="flex items-center gap-3">
              <span aria-hidden className={`grid size-12 shrink-0 place-items-center rounded-[14px] ${tone.wash}`}>
                <span
                  className={`block size-6 ${tone.fill} [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]`}
                  style={{ maskImage: `url(${tone.icon})`, WebkitMaskImage: `url(${tone.icon})` }}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-heading-m font-bold leading-[1.35] lg:text-display">{m.customerStatus[shown]}</span>
                <span className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">{reasonLine ?? headline}</span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-2.5 rounded-[12px] bg-[var(--color-chip)] px-3 py-2.5 text-caption lg:text-body-s">
              <span className="flex min-w-0 flex-col">
                <span className="text-[var(--color-ink-subtle)]">{m.orderView.orderNo}</span>
                <bdi dir="ltr" className="truncate text-start text-body-s font-bold lg:text-body-l">
                  #{order.id}
                </bdi>
              </span>
              <span className="flex min-w-0 flex-col items-end">
                <span className="text-[var(--color-ink-subtle)]">{m.orderView.date}</span>
                <span className="font-bold">{formatStoreDateTime(locale, order.created_at, { dateStyle: "short", timeStyle: "short" })}</span>
              </span>
              <CopyButton
                value={order.id}
                label={m.orderView.copy}
                copiedLabel={m.orderView.copied}
                accessibleName={`${m.orderView.copy} ${m.orderView.orderNo}`}
                className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-[8px] px-2.5 text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] [&>svg]:hidden"
              />
            </div>

            <Steps locale={locale} marks={marks} />
          </section>

          {claim === "kept" ? (
            <p role="status" className="cq-notice-auto rounded-[12px] bg-[var(--color-success-subtlest)] px-3.5 py-3 text-body-s font-bold text-[var(--color-success)] lg:text-body-l">
              {m.claim.kept}
            </p>
          ) : null}

          <RefundBlock order={order} locale={locale} outcome={refundParam} />

          <FieldCorrectionBlock
            order={order}
            locale={locale}
            fields={correctable}
            values={items[0]?.fields ?? {}}
            support={support}
          />

          <NextStep
            order={order}
            locale={locale}
            status={status}
            receipt={receipt}
            standing={standing}
            payAgain={payAgain}
            savedCards={savedCards}
            signedIn={Boolean(bearerToken)}
            transferStatus={transferStatus}
            contact={contact}
          />

          {/* «احفظ طلبك في حسابك» — offered by the server, drawn once the
              order is PAID (the owner's «invite, don't create»): an unpaid
              order's next step is paying it, and nothing should sit above that. */}
          {order.claim && paid ? (
            <ClaimInvite
              locale={locale}
              orderId={order.id}
              pointsEstimate={order.claim.points_estimate_pts ?? null}
              signedIn={Boolean(session)}
              outcome={claim}
            />
          ) : null}

          {/* WHAT WAS BOUGHT — a card per product: artwork, name and tier,
              price and quantity; then its fields and where delivery is. */}
          <section aria-labelledby="ordered" className="flex flex-col gap-2.5">
            <h2 id="ordered" className="text-body-m font-bold lg:text-heading-m">
              {m.checkout.products}{" "}
              <span dir="ltr" className="font-semibold text-[var(--color-ink-subtle)]">
                ({items.length})
              </span>
            </h2>
            <ul className="flex flex-col gap-2.5">
              {items.map((item, index) => {
                const name = lineName(item, locale);
                const tier = lineDenomination(item, locale);
                // What the package buys, as the game's own picture (owner, 2026-11-05).
                const tierIcon = tier ? (packIcons[index] ?? null) : null;
                const image = lineArt[index] ?? null;
                return (
                  <li key={index} className="flex flex-col gap-2.5 rounded-[16px] bg-[var(--color-chip)] p-3">
                    <div className="flex items-start gap-3">
                      {/* The picture alone; the brand blue only where there is none. */}
                      <span className={`relative block size-[52px] shrink-0 overflow-hidden rounded-[12px] ${image ? "" : "bg-[var(--color-brand-500)]"}`}>
                        {image ? <ArtworkFill art={image} alt={image.alt} sizes="52px" /> : null}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-body-s font-bold leading-[1.45] lg:text-body-m">{name}</span>
                        {tier ? (
                          <span className="flex items-center gap-1 text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
                            {tierIcon ? <Image src={tierIcon} alt="" aria-hidden width={16} height={16} unoptimized className="size-4 shrink-0 object-contain" /> : null}
                            {tier}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {item.final_price ? (
                          <span dir="ltr" className="text-body-s font-bold tabular-nums lg:text-body-m">
                            {formatMoney(locale, item.final_price, currency)}
                          </span>
                        ) : null}
                        <span dir="ltr" className="rounded-full bg-[var(--color-bg-subtle)] px-2 text-caption font-bold leading-5 text-[var(--color-ink-subtle)]">
                          × {item.quantity}
                        </span>
                      </span>
                    </div>
                    {/* Only the fields the API returns — it never echoes a
                        credential back — under the words staff gave them. */}
                    <dl className="flex flex-col gap-1.5 rounded-[10px] bg-[var(--background)] px-3 py-2.5 text-caption lg:text-body-s">
                      {Object.entries(item.fields).map(([key, value]) => {
                        const field = definitions[index]?.[key];
                        const label = field?.label?.[locale] || field?.label?.en || key;
                        return (
                          <div key={key} className="flex items-center gap-2">
                            <dt className="shrink-0 text-[var(--color-ink-subtle)]">{label}</dt>
                            {/* `auto`: a player id reads LTR, a chosen option's
                                Arabic label reads RTL. */}
                            <dd dir="auto" className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">
                              {displayFieldValue(field, value, locale) ?? m.upload.done}
                            </dd>
                          </div>
                        );
                      })}
                      {delivery ? (
                        <div className="flex items-center gap-2">
                          <dt className="text-[var(--color-ink-subtle)]">{m.orderView.delivery}</dt>
                          {/* A card is handed over, not charged: «تم التسليم», not «تم الشحن». */}
                          <dd className={`flex-1 font-bold ${delivery[1]}`}>
                            {status === "completed" && item.delivery?.kind === "digital_card" ? m.orderView.deliveredCard : delivery[0]}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {/* WHAT IT BROUGHT, by what the product is (2026-10-01):
                        a digital card's codes, one per card, each with its
                        own copy button — or, sent by ChargerUni's secure
                        link (2026-10-15), where to find them; a direct
                        top-up's proof screenshot («إثبات الشحن») when there
                        is one. A top-up with nothing to show draws nothing —
                        the line above already says it was delivered. */}
                    <LineDelivered
                      delivery={item.delivery ?? null}
                      proofHref={`/api/orders/${encodeURIComponent(order.id)}/items/${index}/delivery-proof`}
                      productName={name}
                      m={m}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6">
          {/* «تفاصيل الفاتورة» — every figure the server's pricing snapshot. */}
          <section aria-labelledby="invoice" className="flex flex-col gap-2.5">
            <h2 id="invoice" className="text-body-m font-bold lg:text-heading-m">
              {m.checkout.invoice}
            </h2>
            <dl className="flex flex-col gap-2 rounded-[16px] bg-[var(--color-primary-wash-lighter)] p-4 text-body-s leading-[1.5] lg:text-body-l">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.goods}</dt>
                {/* v0.1.141 — the goods BEFORE the coupon: `final_price`
                    already has it taken off, and the discount row below
                    takes it off again. Older servers send no `subtotal`. */}
                <dd dir="ltr" className="tabular-nums">
                  {formatMoney(locale, p.subtotal ?? p.final_price, currency)}
                </dd>
              </div>
              {/* The code's discount, when there was one. The lines are priced
                  BEFORE it — a coupon is order-level — so without this row the
                  lines and the total disagree with no reason given. */}
              {p.discount && Number(p.discount) > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-[var(--color-ink-muted)]">
                    {m.checkout.invoiceDiscount}
                    {p.coupon_code ? (
                      <span dir="ltr" className="rounded-[6px] bg-[var(--color-bg-subtle)] px-1.5 text-caption font-bold leading-[18px] text-[var(--color-ink)]">
                        {p.coupon_code}
                      </span>
                    ) : null}
                  </dt>
                  <dd dir="ltr" className="tabular-nums text-[var(--color-success)]">
                    − {formatMoney(locale, p.discount, currency)}
                  </dd>
                </div>
              ) : null}
              {fee !== undefined && Number(fee) > 0 ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.processingFee}</dt>
                  <dd dir="ltr" className="tabular-nums">
                    + {formatMoney(locale, fee, currency)}
                  </dd>
                </div>
              ) : null}
              {/* v0.1.51: how it is paid, and what it earned. */}
              {order.payment_method ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.paymentMethod}</dt>
                  <dd className="font-semibold">{m.paymentMethodName[order.payment_method]}</dd>
                </div>
              ) : null}
              {/* ADR 0043 §3: what Charger Points and Charger Balance paid —
                  the order's frozen figures; the total below is net of both. */}
              {p.points_value && isNonZeroAmount(p.points_value) && p.points_redeemed_pts ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">{m.loyalty.checkout.pointsLine.replace("{pts}", formatPoints(locale, String(p.points_redeemed_pts)))}</dt>
                  <dd dir="ltr" className="tabular-nums text-[var(--color-success)]">
                    − {formatMoney(locale, p.points_value, currency)}
                  </dd>
                </div>
              ) : null}
              {p.balance_used && isNonZeroAmount(p.balance_used) ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">{m.loyalty.checkout.balanceLine}</dt>
                  <dd dir="ltr" className="tabular-nums text-[var(--color-success)]">
                    − {formatMoney(locale, p.balance_used, currency)}
                  </dd>
                </div>
              ) : null}
              {order.points_earned_pts ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--color-ink-muted)]">{m.checkout.invoicePoints}</dt>
                  <dd className="flex items-center gap-1">
                    <span dir="ltr">+ {formatPoints(locale, String(order.points_earned_pts))}</span>
                    <Image src={CURRENCY_ICON} alt="" aria-hidden width={16} height={16} unoptimized className="size-4" />
                  </dd>
                </div>
              ) : null}
              <div className="mb-1 mt-1.5 h-px bg-[var(--color-line)]" />
              <div className="flex items-baseline justify-between gap-3">
                {/* "Total PAID" only once it is: on an order awaiting a
                    transfer the same words would say money moved that has not. */}
                <dt className="text-body-m font-bold lg:text-body-l">{order.payment_state === "captured" ? m.orderStatus.grandTotal : m.orderStatus.total}</dt>
                <dd dir="ltr" className="text-heading-l font-bold tabular-nums text-[var(--color-brand-500)] lg:text-display">
                  {formatMoney(locale, p.total, currency)}
                </dd>
              </div>
              {hasVat && p.tax !== undefined ? (
                <p className="text-caption text-[var(--color-ink-subtle)]">
                  {m.orderView.vatNote} <bdi dir="ltr">{formatMoney(locale, p.tax, currency)}</bdi>
                </p>
              ) : allExempt(order.items) ? (
                // v0.1.87 — every line was sold VAT-exempt: say so, not a zero.
                <p className="text-caption text-[var(--color-ink-subtle)]">{m.orderView.vatExempt}</p>
              ) : null}
            </dl>
          </section>

          {/* «نقاط تشارجر» — what this order spent and earned (ADR 0043),
              its own frozen record; nothing when it moved none. */}
          <OrderPointsSection locale={locale} points={mapOrderLoyalty(order.loyalty)} />

          {/* The order's actions as one list: the invoice, buying again,
              reporting a problem to the store's WhatsApp with the number. */}
          <nav aria-label={m.orderView.actions} className="flex flex-col rounded-[16px] bg-[var(--color-chip)] px-3.5 py-1">
            <ActionRow icon="/brand/icon-download.svg" label={m.orderStatus.downloadInvoice} href={invoiceHref} />
            {canReorder ? (
              <form action={reorder} className="border-t border-[var(--color-line)]">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="order" value={order.id} />
                <SubmitButton className="w-full text-start">
                  <ActionRowBody icon="/brand/icon-refresh.svg" label={m.account.reorder} />
                </SubmitButton>
              </form>
            ) : null}
            {support ? (
              <ActionRow
                icon="/brand/icon-flag.svg"
                label={m.orderStatus.reportProblem}
                href={`https://wa.me/${support}?text=${encodeURIComponent(m.orderStatus.reportMessage.replace("{id}", order.id))}`}
                external
                ruled
              />
            ) : null}
          </nav>

          {/* Once per order (owner, 2026-10-07): the button until it is
              rated, then only how the review stands — it cannot be edited. */}
          {reviewState?.data ? (
            <p className="rounded-[12px] bg-[var(--color-chip)] px-3.5 py-3 text-body-s font-semibold text-[var(--color-ink-muted)] lg:text-body-l">
              {m.orderReview[reviewState.data.status]}
            </p>
          ) : reviewState?.can_review ? (
            <RateOrderButton
              locale={locale}
              orderId={order.id}
              rewardPoints={reviewState.reward_points}
              openInitially={reviewParam === "1"}
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}

/** Placed → paid → delivered: a tick when done, «!» where it failed, the number while ahead. */
function Steps({ locale, marks }: { locale: Locale; marks: readonly StepMark[] }) {
  const m = messagesFor(locale);
  const labels = [m.orderView.stepPlaced, m.orderView.stepPaid, m.orderView.stepDelivered];

  return (
    <ol className="flex items-start">
      {marks.map((mark, index) => {
        const next = marks[index + 1];
        return (
          <li key={index} className="relative flex flex-1 flex-col items-center gap-1.5 text-center">
            {next !== undefined ? (
              <span
                aria-hidden
                className={`absolute start-1/2 top-[11px] h-0.5 w-full ${next === "done" ? "bg-[var(--color-success)]" : "bg-[var(--color-line)]"}`}
              />
            ) : null}
            <span
              aria-hidden
              className={`relative z-[1] grid size-6 place-items-center rounded-full text-caption font-bold ${
                mark === "done"
                  ? "bg-[var(--color-success)] text-[var(--background)]"
                  : mark === "failed"
                    ? "bg-[var(--color-danger)] text-[var(--background)]"
                    : mark === "active"
                      ? "bg-[var(--background)] text-[var(--color-brand-500)] shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
                      : "bg-[var(--background)] text-[var(--color-ink-subtle)] shadow-[inset_0_0_0_1.5px_var(--color-line)]"
              }`}
            >
              {mark === "done" ? "✓" : mark === "failed" ? "!" : index + 1}
            </span>
            <span className={`text-caption font-bold leading-[1.35] lg:text-body-s ${mark === "todo" ? "text-[var(--color-ink-subtle)]" : "text-[var(--color-ink)]"}`}>
              {labels[index]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActionRow({ icon, label, href, external = false, ruled = false }: { icon: string; label: string; href: string; external?: boolean; ruled?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={ruled ? "border-t border-[var(--color-line)]" : undefined}
    >
      <ActionRowBody icon={icon} label={label} />
    </a>
  );
}

function ActionRowBody({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex min-h-[52px] items-center gap-3 text-[var(--color-ink)]">
      <span
        aria-hidden
        className="block size-5 shrink-0 bg-[var(--color-ink)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
        style={{ maskImage: `url(${icon})`, WebkitMaskImage: `url(${icon})` }}
      />
      <span className="flex-1 text-body-s font-bold">{label}</span>
      <span
        aria-hidden
        className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100"
      />
    </span>
  );
}

type Order = Awaited<ReturnType<typeof getOrder>>;

/**
 * What the customer can do next, by where the order stands — the part of
 * this page that makes it a place to continue from rather than a receipt.
 */
type PaymentStanding = Awaited<ReturnType<typeof getOrderPayment>>;

/**
 * «استرجاع المبلغ» (owner, 2026-10-12; v0.1.122): on a paid order that could
 * not be fulfilled, the customer chooses where the money goes — Charger
 * Balance (preselected; a guest is told it needs an account) or the method
 * they paid with — and afterwards sees what they asked for and when finance
 * settled it. Nothing here moves money; finance does.
 */
function RefundBlock({ order, locale, outcome }: { order: Order; locale: Locale; outcome?: string }) {
  const m = messagesFor(locale).refund;
  const request = order.refund_request ?? null;
  const notice =
    outcome === "sent"
      ? m.outcomeSent
      : outcome === "account"
        ? m.outcomeAccount
        : outcome === "unavailable"
          ? m.outcomeUnavailable
          : outcome === "frozen"
            ? m.outcomeFrozen
            : outcome === "failed"
              ? m.outcomeFailed
              : null;

  if (request) {
    const body = request.settled_at && request.balance_credit
      ? m.settledBalance.replace("{amount}", formatMoney(locale, request.balance_credit, order.pricing.currency))
      : order.payment_state === "refunded"
        ? m.settledOriginal
        : request.destination === "balance"
          ? m.pendingBalance
          : m.pendingOriginal;

    return (
      <section className={`${BLOCK} bg-[var(--color-chip)]`}>
        <h2 className={BLOCK_TITLE}>{m.requestedTitle}</h2>
        {notice && outcome === "sent" ? <p role="status" className="text-body-s font-bold text-[var(--color-success)]">{notice}</p> : null}
        <p className={BLOCK_BODY}>{body}</p>
      </section>
    );
  }

  if ((order.refund_options ?? []).length === 0) return null;

  // An order nobody's account holds can only go back to the payment method
  // until it is kept on an account (the claim offered on this page).
  const guest = Boolean(order.claim);
  const choice = "flex cursor-pointer items-start gap-2.5 rounded-[12px] bg-[var(--background)] p-3 shadow-[inset_0_0_0_1px_var(--color-line)] has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-brand-500)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

  return (
    <section className={`${BLOCK} bg-[var(--color-chip)]`}>
      <h2 className={BLOCK_TITLE}>{m.title}</h2>
      <p className={BLOCK_BODY}>{m.lead}</p>
      {notice ? (
        <p role="alert" className="text-body-s font-bold text-[var(--color-danger)]">
          {notice}
        </p>
      ) : null}
      <form action={requestRefund} className="flex flex-col gap-2.5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="order" value={order.id} />
        <label className={choice}>
          <input type="radio" name="destination" value="balance" defaultChecked={!guest} disabled={guest} className="mt-1 accent-[var(--color-brand-500)]" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-body-s font-bold lg:text-body-l">
              {m.balanceTitle}
              {guest ? null : <span className="rounded-full bg-[var(--color-success-subtlest)] px-2 text-caption font-bold text-[var(--color-success)]">{m.recommended}</span>}
            </span>
            <span className={BLOCK_BODY}>{guest ? m.balanceNeedsAccount : m.balanceBody}</span>
          </span>
        </label>
        <label className={choice}>
          <input type="radio" name="destination" value="original" defaultChecked={guest} className="mt-1 accent-[var(--color-brand-500)]" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-s font-bold lg:text-body-l">{m.originalTitle}</span>
            <span className={BLOCK_BODY}>{m.originalBody}</span>
          </span>
        </label>
        <button type="submit" className={BLOCK_CTA}>
          {m.submit}
        </button>
      </form>
    </section>
  );
}

/**
 * «صحّح بيانات طلبك» (ADR 0019 Q20, v0.1.126): an order refused for a wrong
 * player ID gets ONE correction from the customer, with a value that differs;
 * after that — or when the form cannot be drawn — the way is support, who
 * correct it without a limit. The SERVER says which (`order.field_correction`);
 * nothing here counts anything.
 */
function FieldCorrectionBlock({
  order,
  locale,
  fields,
  values,
  support,
}: {
  order: Order;
  locale: Locale;
  /** The fields the customer may correct; empty when the form cannot be drawn. */
  fields: ReturnType<typeof correctableFields>;
  values: Record<string, string>;
  support: string | null;
}) {
  const m = messagesFor(locale).fieldCorrection;
  const state = order.field_correction ?? null;

  if (state === "used") {
    return (
      <section className={`${BLOCK} bg-[var(--color-chip)]`}>
        <h2 className={BLOCK_TITLE}>{m.usedTitle}</h2>
        <p className={BLOCK_BODY}>{support ? m.usedBody : m.usedNoContact}</p>
        {support ? (
          <a
            href={`https://wa.me/${support}?text=${encodeURIComponent(m.contactMessage.replace("{id}", order.id))}`}
            target="_blank"
            rel="noopener noreferrer"
            className={BLOCK_CTA}
          >
            {m.contact}
          </a>
        ) : null}
      </section>
    );
  }

  if (state !== "available" || fields.length === 0) return null;

  return (
    <section className={`${BLOCK} bg-[var(--color-chip)]`}>
      <h2 className={BLOCK_TITLE}>{m.title}</h2>
      <p className={BLOCK_BODY}>{m.lead}</p>
      <FieldCorrectionForm
        locale={locale}
        orderId={order.id}
        fields={fields}
        initialValues={values}
        messages={{
          submit: m.submit,
          required: m.required,
          unchanged: m.unchanged,
          invalid: m.invalid,
          failed: m.failed,
          used: m.usedBody,
          unavailable: m.unavailable,
        }}
      />
    </section>
  );
}

const BLOCK = "flex flex-col gap-3 rounded-[16px] p-4";
const BLOCK_TITLE = "text-body-m font-bold lg:text-heading-m";
const BLOCK_BODY = "text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s";
const BLOCK_LINK =
  "flex h-12 items-center justify-center rounded-[12px] px-4 text-body-s font-bold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)]";
const BLOCK_CTA =
  "flex h-12 items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-4 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]";

function NextStep({
  order,
  locale,
  status,
  receipt,
  standing,
  payAgain,
  savedCards,
  signedIn,
  transferStatus,
  contact,
}: {
  order: Order;
  locale: Locale;
  status: OrderDetailStatus;
  receipt?: string;
  standing: PaymentStanding | null;
  /** The methods that can pay this order again; empty keeps «أكمل الدفع». */
  payAgain: PaymentMethodView[];
  savedCards: SavedCardView[];
  signedIn: boolean;
  /** The guided transfer's own status, when this order is one. */
  transferStatus: string | null;
  /** The signed-in customer's contact, for Apple Pay's required `customer`. */
  contact: CheckoutContact | null;
}) {
  const m = messagesFor(locale);

  /*
   * THE PAYMENT WINDOW HAS PASSED (ADR 0038). The order is closed — or about
   * to be, the API already refuses to take a payment for it — and is never
   * reopened or repriced. «اطلب من جديد» puts the same items, with the player
   * details that are still valid, back in the basket (`reorder`), and the
   * basket prices them at TODAY's prices, availability and rates: a new order.
   */
  if (status === "expired") {
    return (
      <section className={`${BLOCK} bg-[var(--color-error-subtlest)]`}>
        <h2 className={`${BLOCK_TITLE} text-[var(--color-danger)]`}>{m.orderView.expiredActionTitle}</h2>
        <p className={BLOCK_BODY}>{m.orderView.expiredActionBody}</p>
        {(order.items ?? []).some((item) => item.product) ? (
          <form action={reorder}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="order" value={order.id} />
            <SubmitButton className={`${BLOCK_CTA} w-full`}>
              {m.orderStatus.orderAgain}
            </SubmitButton>
          </form>
        ) : null}
      </section>
    );
  }

  if (transferStatus && order.payment_state === "awaiting_confirmation") {
    // A proof sent is NOT a payment still to make: no «complete the
    // payment» here while it waits for review — only where to see it.
    const awaitingReview = transferStatus === "proof_submitted" || transferStatus === "under_review";
    const rejected = transferStatus === "rejected";
    return (
      <section className={`${BLOCK} ${awaitingReview ? "bg-[var(--color-info-wash)]" : rejected ? "bg-[var(--color-error-subtlest)]" : "bg-[var(--color-warning-wash)]"}`}>
        <h2 className={`${BLOCK_TITLE} ${rejected ? "text-[var(--color-danger)]" : ""}`}>
          {m.transfer.status[transferStatus as keyof typeof m.transfer.status] ?? transferStatus}
        </h2>
        <p className={BLOCK_BODY}>{m.transfer.statusHelp[transferStatus as keyof typeof m.transfer.statusHelp]}</p>
        <a href={`/${locale}/orders/${order.id}/bank-transfer`} className={awaitingReview ? BLOCK_LINK : BLOCK_CTA}>
          {awaitingReview ? m.transfer.viewTransfer : rejected ? m.transfer.sendNewProof : m.transfer.pageTitle}
        </a>
      </section>
    );
  }

  if (order.payment_state === "awaiting_confirmation") {
    if (!order.bank_details) return null;

    const received = receipt === "sent" || Boolean(order.transfer_receipt_submitted_at);

    return (
      <BankTransferPanel locale={locale} orderId={order.id} details={order.bank_details}>
        {received ? (
          <p role="status" className="rounded-[10px] bg-[var(--color-info-wash)] px-3 py-2.5 text-caption font-bold text-[var(--color-info)] lg:text-body-s">
            {m.receipt.sent}
          </p>
        ) : (
          <ReceiptForm orderId={order.id} locale={locale} outcome={receipt} />
        )}
      </BankTransferPanel>
    );
  }

  /*
   * CLOSED. The API allows one charge per order, so this order cannot be
   * paid again — the honest continuation is ordering the product anew, with
   * the same tier preselected. The player id is typed again on purpose: it
   * is not something to carry over silently from a failed purchase. WHY it
   * closed (and whether money moved) is the status line above (v0.1.121) —
   * this block only offers the way on, so it never repeats «nothing was
   * charged» over a payment that arrived late.
   */
  if (order.payment_state === "failed") {
    const products = (order.items ?? []).filter((item) => item.product);

    return (
      <section className={`${BLOCK} bg-[var(--color-chip)]`}>
        <h2 className={BLOCK_TITLE}>{m.orderStatus.closedTitle}</h2>
        <p className={BLOCK_BODY}>{m.orderStatus.closedBody}</p>
        <ul className="flex flex-col gap-2">
          {products.map((item, index) => {
            const slug = item.product!.slug;
            const query = orderLinePackQuery(item);
            return (
              <li key={index}>
                <Link href={`/${locale}/products/${encodeURIComponent(slug)}${query}`} className={BLOCK_CTA}>
                  {products.length > 1
                    ? `${m.orderStatus.orderAgain}: ${item.product!.name[locale] ?? item.product!.name.en ?? slug}`
                    : m.orderStatus.orderAgain}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  /*
   * NOT CONFIRMED YET. `initiated` includes a customer still on the bank's
   * 3-D Secure page, and a webhook still in flight — so no "order again"
   * here: pending is not a failure, and calling it one invites a second
   * payment (HANDBOOK §3).
   */
  if (order.payment_state === "initiated") {
    const charge = standing?.charge ?? null;

    // A 3-D Secure page that can still be finished: that, and only that —
    // a second card now could complete alongside it.
    if (status === "verifying" && charge?.redirect_url) {
      return (
        <section role="status" className={`${BLOCK} bg-[var(--color-info-wash)]`}>
          <h2 className={BLOCK_TITLE}>{m.orderStatus.pendingTitle}</h2>
          <p className={BLOCK_BODY}>{m.payment.stillVerifying}</p>
          <ContinueBankCheck
            url={charge.redirect_url}
            orderId={order.id}
            locale={locale}
            inPage={BANK_CHECK_METHODS.has(order.payment_method ?? "")}
            className={BLOCK_CTA}
          >
            {m.payment.continueVerification}
          </ContinueBankCheck>
        </section>
      );
    }

    // Nothing open at the gateway — never started, or the last attempt
    // failed — and something can pay here: pay THIS order, right here.
    // The headline above already says the card was declined and nothing was
    // charged; this block says what to do, and the bank's reason once.
    if (payAgain.length > 0 && (charge === null || charge.retryable)) {
      const failed = charge?.retryable === true;
      const reason = failed ? shownGatewayReason(charge?.failure_reason ?? null) : null;
      return (
        <section className={`${BLOCK} bg-[var(--color-chip)]`}>
          <h2 className={BLOCK_TITLE}>{failed ? m.orderView.payRetryTitle : m.orderView.payTitle}</h2>
          <p className={BLOCK_BODY}>
            {failed ? (declineSentence(m, charge?.decline_category) ?? m.orderView.payRetryBody) : m.orderView.payBody}
          </p>
          {reason ? (
            <p dir="auto" className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">
              {m.payment.gatewayReason.replace("{reason}", reason)}
            </p>
          ) : null}
          <OrderPayAgain
            locale={locale}
            orderId={order.id}
            methods={payAgain}
            signedIn={signedIn}
            savedCards={savedCards}
            amount={order.pricing.total}
            currency={order.pricing.currency}
            lastFailure={null}
            contact={contact}
          />
        </section>
      );
    }

    return (
      <section role="status" className={`${BLOCK} bg-[var(--color-warning-wash)]`}>
        <h2 className={BLOCK_TITLE}>{m.orderStatus.pendingTitle}</h2>
        <p className={BLOCK_BODY}>{m.orderStatus.pendingBody}</p>
        {/* «أكمل الدفع»: safe to press, because an order has ONE charge —
            this reopens Tap's page for it, or starts it if the first start
            never reached Tap. It can never become a second payment. */}
        <ResumePayment locale={locale} orderId={order.id} />
      </section>
    );
  }

  return null;
}

/**
 * «أرسل إيصال التحويل» — a transfer chosen before the guided flow. Sent in
 * place by `TransferProofForm` (a failure keeps what was typed), or posted
 * plainly without JavaScript and answered back here with `?receipt=`.
 */
async function ReceiptForm({ orderId, locale, outcome }: { orderId: string; locale: Locale; outcome?: string }) {
  const m = messagesFor(locale);
  const messages: Record<ProofOutcome, string> = {
    sent: m.receipt.sent,
    missing: m.receipt.missing,
    too_large: m.receipt.tooLarge,
    rejected: m.receipt.rejected,
    closed: m.receipt.closed,
    details: m.receipt.details,
    failed: m.receipt.failed,
  };
  const known = outcome && outcome !== "sent" && outcome in messages ? (outcome as ProofOutcome) : null;
  const draft = decodeDraft((await cookies()).get(proofDraftCookie(orderId))?.value);

  const control =
    "h-11 w-full rounded-[12px] border border-[var(--color-line)] bg-[var(--color-field)] px-4 text-body-s focus:border-[var(--color-primary)]";

  return (
    <TransferProofForm
      action={`/api/orders/${orderId}/transfer-receipt`}
      sentHref={`/${locale}/order-status/${orderId}?receipt=sent`}
      messages={messages}
      initialOutcome={known}
      sendingLabel={m.transfer.uploading}
      submit={m.receipt.submit}
      heading={<h3 className="font-bold">{m.receipt.title}</h3>}
      className="space-y-3 border-t border-[var(--color-line)] pt-4"
      buttonClassName="flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] px-5 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
    >
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-1">
        <label htmlFor={`receipt-${orderId}`} className="block text-body-s font-medium lg:text-body-l">
          {m.receipt.file}
        </label>
        <FileChooser
          id={`receipt-${orderId}`}
          name="receipt"
          required
          accept="image/jpeg,image/png,image/webp"
          chooseLabel={m.upload.choose}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-body-s font-medium lg:text-body-l">{m.receipt.reference}</span>
        <input type="text" name="reference" defaultValue={draft.reference} maxLength={120} dir="ltr" className={control} />
      </label>

      <label className="block space-y-1">
        <span className="text-body-s font-medium lg:text-body-l">{m.receipt.note}</span>
        <input type="text" name="note" defaultValue={draft.note} maxLength={500} className={control} />
      </label>
    </TransferProofForm>
  );
}
