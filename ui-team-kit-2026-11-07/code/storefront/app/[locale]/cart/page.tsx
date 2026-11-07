import Image from "next/image";

import { ArtworkFill } from "@/components/catalog/ArtworkFill";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrackOnView } from "@/components/analytics/TrackOnView";
import { CartLines } from "@/components/cart/CartLines";
import { ChangedFigure } from "@/components/cart/ChangedFigure";
import { EditLineFields } from "@/components/cart/EditLineFields";
import { SecretFieldValue } from "@/components/cart/SecretFieldValue";
import { StepperQuantity } from "@/components/cart/StepperQuantity";
import { ALERT_ACTION_CLASS, AlertBar, alertProps } from "@/components/ui/AlertBar";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { applyCartCoupon, clearCart, removeCartCoupon, removeFromCart, stepCartQuantity, undoRemoveFromCart } from "@/lib/cart/actions";
import { completeLineHref } from "@/lib/cart/complete-href";
import { readCartCoupon } from "@/lib/cart/coupon";
import { couponSignInHref } from "@/lib/cart/coupon-sign-in-href";
import { hasUndoableRemoval } from "@/lib/cart/undo";
import { CART_MAX_QUANTITY, readCart } from "@/lib/cart/cart";
import { quoteCart, type CartQuote } from "@/lib/cart/checkout";
import { VipChip } from "@/components/loyalty/vip/VipChip";
import { vaultedKeys } from "@/lib/cart/credential-vault";
import { CLARITY_MASK } from "@/lib/analytics/clarity";
import { cartAnalyticsItems } from "@/lib/analytics/items";
import { hydrateCart, type CartView } from "@/lib/cart/queries";
import { recordFunnel, touchCart } from "@/lib/cart/recovery-sync";
import { CHECKOUT_HEADING, CTA_BUTTON, MONEY } from "@/components/checkout/styles";
import { currencyForVisitor } from "@/lib/currency/visitor";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";

/**
 * The cart — Figma "Section Cart" (`6847:94522`), Web - Mobile, light: the
 * basket (`6847:94729`), empty (`6847:94925`), a line's details being edited
 * and saved (`6847:94526` / `6847:95067`), a removal with «تراجع»
 * (`6847:95439`), the coupon typed, refused and applied (`6847:95783`,
 * `6847:95269`, `6847:95613` / `6847:95953`), and a line that is no longer
 * sold (`7423:39191`). The desktop keeps the lines beside the invoice.
 *
 * ONE LINE OF THE COMP IS NOT DRAWN, deliberately: «رسوم المعالجة لأنظمة
 * الدفع». This store cannot state a processing fee before a payment method is
 * chosen (ADR 0015 — the fee is frozen into the order's pricing snapshot, and
 * `CartPreview.total` documents itself as "NOT what the card is charged" for
 * exactly that reason). It appears one screen on, at `/cart/checkout`, where
 * the method is picked; printing it here would mean printing one figure and
 * charging another. The note under the invoice says where it will be.
 *
 * THE COUPON IS HERE NOW, as the comp draws it. A code the server accepts is
 * kept (`cq_coupon`) and carried to checkout, which prices it again with the
 * chosen method; its worth is never computed or stored here.
 *
 * WHY THE ROW WAS REBUILT: it was a single flex line carrying a 72px image, a
 * 64px number input, an update button, a 110px price column and a remove
 * button. That is more than 360px of fixed content before any text, so it
 * overflowed the viewport on a phone — the title ran off the edge. The card
 * below has exactly one fixed-width child.
 *
 * EVERY CONTROL IS STILL A PLAIN FORM. The stepper, remove and empty are
 * Server Actions posted from `<form>` elements, so the cart works before
 * hydration and with JavaScript off. The page itself is a Server Component;
 * its client parts only add feedback on top — `SubmitButton`'s pending look,
 * the stepper's dimming number, a removed line folding away (`CartLines`) and
 * a re-priced figure's wash (`ChangedFigure`) — and none of them gates a form.
 *
 * «Cart Mobile» (2026-09-30) REDRAWS IT, logic unchanged: one quiet card per
 * line (artwork, name, price, fields, a small stepper, the trash an icon),
 * the item count a chip beside the title, the coupon one collapsed line with
 * its four states, the invoice card checkout draws, and the «removed» toast
 * with «تراجع» right above the pay button, where the thumb is.
 *
 * PRICES ARE FETCHED NOW, never read from the cookie (`lib/cart/queries.ts`) —
 * the cart holds identifiers, and a price a customer saw last week is not one
 * we can honour.
 */
export default async function CartPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ full?: string; removed?: string; saved?: string; restored?: string; edit?: string; coupon?: string; code?: string; reason?: string }>;
}) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { full, removed, saved, restored, edit, coupon: couponState, code: typedCode, reason: couponReasonParam } = await props.searchParams;
  const m = messagesFor(locale);
  const currency = await currencyForVisitor();

  const basket = await readCart();
  const cart = await hydrateCart(basket, { locale, currency });

  // The mirror's activity clock and the funnel's «cart viewed» (ADR 0039) —
  // sent after the response, never in the way of the page.
  if (basket.length > 0) {
    const ref = await touchCart("view", basket, locale);
    await recordFunnel([{ step: "cart_viewed", path: "cart" }], { locale, ref: ref ?? undefined });
  }
  // Which lines' passwords the product page already took (keys only).
  const held = await vaultedKeys();

  /*
   * EVERY FIGURE ON THIS PAGE BUT THE UNIT PRICE COMES FROM THE SERVER'S
   * QUOTE — each line's total, the subtotal, the points. This page used to
   * add them up itself; that sum was then the "shown total" checkout compared
   * the charge against, which is how a coupon came to look like a price
   * change on every order.
   *
   * SKIPPED WHEN THE BASKET IS NOT ORDERABLE (the preview refuses such a
   * basket outright; the rows say why instead) and for an empty one, so an
   * empty cart costs no request. A failed quote draws unit prices and no
   * totals — never a total this page made up.
   */
  const coupon = await readCartCoupon();
  let quoted =
    cart.lines.length > 0 && !cart.hasUnavailable
      ? await quoteCart({ locale, currency, couponCode: coupon ?? undefined }).catch(() => null)
      : null;
  // A code accepted earlier that the server now refuses (expired, used up):
  // price the basket without it and say so at the coupon field, rather than
  // leaving the whole invoice blank over a discount.
  const couponLapsed = Boolean(coupon && quoted?.couponError);
  // A code that needs an account: the API's own sentence, then a sign-in link
  // back to this page. From a stored code that lapsed (signed out since), or
  // from a code just typed (`?reason=sign_in` — asked again for its sentence).
  let couponSignInMessage: string | null = null;
  if (couponLapsed && quoted?.couponReason === "sign_in_required") couponSignInMessage = quoted.couponError ?? null;
  if (!couponLapsed && couponState === "invalid" && couponReasonParam === "sign_in" && typedCode && typedCode.length <= 40) {
    const asked = await quoteCart({ locale, currency, couponCode: typedCode }).catch(() => null);
    if (asked?.couponReason === "sign_in_required") couponSignInMessage = asked.couponError ?? null;
  }
  if (couponLapsed) quoted = await quoteCart({ locale, currency }).catch(() => null);
  const quote = quoted?.quote ?? null;

  // THE SERVER'S WORD ON AVAILABILITY, not the catalogue copy the lines were
  // drawn from. A product switched off or sold out a minute ago still reads
  // as on sale from the cached catalogue; the preview refuses it by line
  // (`items.<n>.product_public_id`). Those lines take the comp's "no longer
  // available" state (`7423:39191`) and checkout locks — the customer is
  // told on the line itself rather than by a failed payment.
  const refused = new Set(quoted?.unavailableLineIds ?? []);
  const lines: CartView[] = cart.lines.map((view) =>
    refused.has(view.id) ? { ...view, unavailable: "gone" } : view,
  );
  const hasUnavailable = cart.hasUnavailable || refused.size > 0;
  const undoable = removed ? await hasUndoableRemoval() : false;

  if (cart.lines.length === 0) {
    // `4007:3857`: the comp's illustration beside «سلتك فارغة الان», its lead
    // and the «الرئيسية» button; stacked and centred on the phone.
    return (
      <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-16 pt-6 lg:pt-[70px]">
        {/* Removing the LAST line lands here — the notice and «تراجع» must
            too, or the one line a customer removed by mistake is the one
            they cannot get back. */}
        {removed ? (
          <AlertBar {...alertProps("cart.removed", locale)} animate className="mb-4">
            {undoable ? (
              <form action={undoRemoveFromCart}>
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton className={ALERT_ACTION_CLASS}>{m.cart.undo}</SubmitButton>
              </form>
            ) : null}
          </AlertBar>
        ) : null}
        <CartHeading locale={locale} count={0} />
        <div className="mt-10 flex flex-col-reverse items-center justify-center gap-8 text-center lg:mt-9 lg:flex-row-reverse lg:gap-8 lg:text-start">
          <Image
            src="/brand/illustration-empty-cart.png"
            alt=""
            aria-hidden
            width={245}
            height={259}
            // Served as the file itself. It is 245px and static, so the
            // optimiser has nothing to gain — and on CI its request for this
            // PNG never settled, holding the page off network-idle.
            unoptimized
            className="h-[180px] w-auto lg:h-[236px]"
          />
          <div className="flex flex-col items-center gap-2 lg:w-[247px] lg:items-start">
            <p className="text-heading-l font-bold leading-[1.4] text-[var(--color-ink)]">{m.cart.empty}</p>
            <p className="text-body-l font-medium leading-[1.5] text-[var(--color-ink-muted)]">{m.cart.emptyLead}</p>
            <Link
              href={`/${locale}`}
              className="mt-4 rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)] active:scale-[0.99]"
            >
              {m.cart.browse}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const total = quote ? formatMoney(locale, quote.total, quote.currency) : null;
  const editing = lines.find((view) => view.id === edit && view.editable.length > 0)?.id ?? null;

  return (
    <main className="mx-auto w-full max-w-[1248px] flex-1 px-6 pb-12 pt-4 lg:pt-[70px]">
      {/* Carried by the redirect that caused it — the actions return nothing. */}
      {restored ? (
        <AlertBar tone="success" icon="/brand/icon-tick-circle.svg" text={m.cart.restored} animate className="mb-4">
          <Link href={`/${locale}/cart`} replace scroll={false} className={ALERT_ACTION_CLASS}>
            {m.catalog.close}
          </Link>
        </AlertBar>
      ) : null}
      {saved ? (
        <AlertBar {...alertProps("details.saved", locale)} animate className="mb-4">
          <Link href={`/${locale}/cart`} replace scroll={false} className={ALERT_ACTION_CLASS}>
            {m.catalog.close}
          </Link>
        </AlertBar>
      ) : null}
      {full ? (
        <p role="status" className="mb-4 rounded-[8px] bg-[var(--color-chip)] px-3 py-2 text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">
          {m.cart.full}
        </p>
      ) : null}

      <TrackOnView event="cart" signature={lines.map((line) => line.id).join(",")} items={cartAnalyticsItems(lines)} />
      <CartHeading locale={locale} count={lines.length} />

      {/* The lines at the start, the invoice at the end — beside each other
          from `lg`, stacked on the phone with the invoice last. */}
      <div className="mt-4 grid items-start gap-7 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-8 xl:grid-cols-[693px_387px] xl:justify-between xl:gap-x-0">
        <div className="flex flex-col gap-7">
          <section aria-label={m.cart.title}>
            {/* The desktop table's header (`5605:9569`): the four columns, a
                hairline under them. The phone's cards need none. */}
            <div
              aria-hidden
              className="hidden border-b border-[var(--color-divider)] pb-3 text-heading-m font-bold leading-[1.4] text-[var(--color-ink-muted)] lg:grid lg:grid-cols-[40px_150px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
            >
              <span className="col-span-2">{m.cart.columnImage}</span>
              <span className="ms-5">{m.cart.columnDetails}</span>
              <span className="ms-4">{m.cart.columnQuantity}</span>
              <span className="ms-4 text-end">{m.cart.columnPrice}</span>
            </div>
            {/* Keyed by the line's id: a row the server stops sending folds away
                (`CartLines`) instead of vanishing. */}
            <CartLines>
              {lines.map((view, index) => (
                <CartRow
                  key={view.id}
                  view={view}
                  locale={locale}
                  lineTotal={quote?.lines[index] ?? null}
                  quote={quote}
                  editing={editing === view.id}
                  held={held[view.id] ?? []}
                />
              ))}
            </CartLines>
          </section>

          <CouponField
            locale={locale}
            applied={quote?.couponCode ?? null}
            state={couponLapsed ? "invalid" : (couponState ?? null)}
            typed={couponLapsed ? coupon : (typedCode ?? null)}
            signInMessage={couponSignInMessage}
          />
        </div>

        <div className="max-lg:contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-5">
          {/* «تفاصيل الفاتورة» — the invoice card checkout draws: primary at
              8%, 16 corners and padding; the total in primary. No processing
              fee here — it depends on the method (ADR 0015); the note says
              where it will appear. */}
          <section aria-labelledby="cart-invoice" className="flex flex-col gap-3">
            <h2 id="cart-invoice" className={CHECKOUT_HEADING}>
              {m.checkout.invoice}
            </h2>
            <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--color-primary-wash-lighter)] p-4 text-body-s leading-[1.5]">
              {quote ? (
                <Row label={m.cart.subtotal}>
                  <ChangedFigure id={`subtotal-${locale}`} value={formatMoney(locale, quote.subtotal, quote.currency)} dir="ltr" className={MONEY} />
                </Row>
              ) : null}
              {quote?.discount && quote.couponCode ? (
                <Row label={m.cart.discount}>
                  <span dir="ltr" className={`text-[var(--color-success)] ${MONEY}`}>
                    − {formatMoney(locale, quote.discount, quote.currency)}
                  </span>
                </Row>
              ) : null}
              {/* Not money, so not in the total — the server's estimate
                  (points are granted on capture). Absent for a guest. */}
              {quote?.pointsEarnedPts ? (
                <Row label={m.checkout.invoicePoints}>
                  <span className="flex items-center gap-1">
                    <span dir="ltr" className={MONEY}>
                      ≈ {formatPoints(locale, String(quote.pointsEarnedPts))}
                    </span>
                    <Image src={CURRENCY_ICON} alt="" aria-hidden width={16} height={16} unoptimized className="size-4" />
                    {/* The VIP multiplier the server's estimate includes. */}
                    {quote.loyalty.pointsVipMultiplier ? <VipChip multiplier={quote.loyalty.pointsVipMultiplier} /> : null}
                  </span>
                </Row>
              ) : null}

              {/* The basket could not be priced as it stands — the server's own words. */}
              {quoted?.error && !couponLapsed ? (
                <p role="status" className="text-body-s font-semibold text-[var(--color-danger)]">
                  {quoted.error}
                </p>
              ) : null}

              {total ? (
                <>
                  <div aria-hidden className="mb-1 mt-1.5 h-px bg-[var(--color-line)]" />
                  {/* Washed when it changes; the pay button's copy of the total is
                      not — a light wash behind its white label would be unreadable. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-body-m font-bold text-[var(--color-ink)]">{m.cart.invoiceTotal}</span>
                    <ChangedFigure id={`total-${locale}`} value={total} dir="ltr" className={`text-heading-l font-bold text-[var(--color-brand-500)] ${MONEY}`} />
                  </div>
                </>
              ) : null}
            </div>
            <p className="text-caption leading-[1.6] text-[var(--color-ink-muted)] lg:text-body-s">{m.cart.subtotalNote}</p>
          </section>

          {/* THE PAY AREA — pinned above the tab bar on the phone (the bar's
              plate is 19.72vw, 360×71, and its home button rises 42% of its
              own 12.2vw, max 52px, above that; this clears both by 12px, and
              comes down with the bar when it hides on scroll), with the
              «removed» toast and its «تراجع» right above the button, where the
              thumb is. CHECKOUT IS LOCKED WHILE ANYTHING IS UNORDERABLE
              (`7423:39191`), and the reason is said beside it. */}
          <div className="flex flex-col gap-2 max-lg:sticky max-lg:bottom-[calc(19.72vw+min(5.2vw,22px)+12px)] max-lg:z-10 cq-above-tabbar">
            {removed ? (
              <AlertBar {...alertProps("cart.removed", locale)} animate>
                {undoable ? (
                  <form action={undoRemoveFromCart}>
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton className={ALERT_ACTION_CLASS}>{m.cart.undo}</SubmitButton>
                  </form>
                ) : null}
              </AlertBar>
            ) : null}
            {hasUnavailable ? (
              <p id="cart-unavailable" className="text-center text-caption font-semibold text-[var(--color-danger)] lg:text-body-s">
                {m.cart.removeUnavailable}
              </p>
            ) : null}
            {hasUnavailable ? (
              <button type="button" disabled aria-describedby="cart-unavailable" className={CTA_BUTTON}>
                <span>{m.cart.completePayment}</span>
                {total ? (
                  <span dir="ltr" className={MONEY}>
                    {total}
                  </span>
                ) : null}
              </button>
            ) : (
              <Link href={`/${locale}/cart/checkout`} className={CTA_BUTTON}>
                <span>{m.cart.completePayment}</span>
                {total ? (
                  <span dir="ltr" className={MONEY}>
                    {total}
                  </span>
                ) : null}
              </Link>
            )}
          </div>

          {/* Not in the comp's first draft; kept because customers use it. Quiet, last. */}
          <form action={clearCart} className="self-center">
            <input type="hidden" name="locale" value={locale} />
            <SubmitButton className="flex items-center gap-1.5 text-body-s font-semibold text-[var(--color-ink-subtle)] transition hover:text-[var(--color-danger)]">
              <span aria-hidden className="block size-4 bg-current [mask-image:url(/brand/icon-trash.svg)] [mask-size:contain]" />
              {m.cart.clear}
            </SubmitButton>
          </form>
        </div>
      </div>
    </main>
  );
}

/**
 * «السلة» with the item count as a chip beside it («Cart Mobile»). It counts
 * LINES, not units: two players' top-ups are two things to check, and a
 * customer scanning the list is counting rows.
 */
function CartHeading({ locale, count }: { locale: Locale; count: number }) {
  const m = messagesFor(locale);

  return (
    <div className="flex items-center gap-2">
      <h1 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-display">{m.cart.title}</h1>
      {count > 0 ? (
        <span
          dir="ltr"
          aria-label={`${m.cart.itemCount}: ${count}`}
          className={`rounded-full bg-[var(--color-action-disabled-bg)] px-2 text-caption font-bold leading-[22px] text-[var(--color-ink-muted)] lg:text-body-s lg:leading-[26px] ${MONEY}`}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[var(--color-ink)]">
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * «هل تمتلك كوبون خصم؟» — the ONLY place a code is entered («Cart Mobile»;
 * checkout shows the result). Four states: closed, typing, refused with the
 * code still in the box and the field outlined in red, and applied — a green
 * wash with the code and «إزالة».
 *
 * A `<details>`, plain forms and Server Actions: typing, applying and removing
 * a code need no JavaScript.
 */
function CouponField({
  locale,
  applied,
  state,
  typed,
  signInMessage,
}: {
  locale: Locale;
  applied: string | null;
  state: string | null;
  typed: string | null;
  /** The API's sentence for a code that needs an account — with a sign-in link. */
  signInMessage: string | null;
}) {
  const m = messagesFor(locale);
  const invalid = state === "invalid";

  if (applied && !invalid) {
    const justApplied = state === "applied";
    return (
      <form action={removeCartCoupon} className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-success-subtlest)] px-3 py-2.5">
        <input type="hidden" name="locale" value={locale} />
        <span aria-hidden className="block size-[18px] shrink-0 bg-[var(--color-success)] [mask-image:url(/brand/icon-tick-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-body-s font-bold text-[var(--color-success)]">
          {/* «تم تفعيل كود الخصم بنجاح!» right after applying, «تم تفعيل كود
              الخصم» after that — then the code itself. */}
          <span id="cart-coupon-note">{justApplied ? m.checkout.couponApplied : m.cart.couponActive}</span>
          <span dir="ltr" className="font-bold">
            {applied}
          </span>
        </p>
        <SubmitButton className="shrink-0 text-caption font-bold text-[var(--color-ink-muted)] underline underline-offset-2 lg:text-body-s">
          {m.checkout.couponRemove}
        </SubmitButton>
      </form>
    );
  }

  return (
    <details open={invalid} className="group flex flex-col gap-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-body-s font-bold text-[var(--color-brand-500)] lg:text-heading-m [&::-webkit-details-marker]:hidden">
        <span>{m.checkout.couponPrompt}</span>
        <span
          aria-hidden
          className="block size-5 shrink-0 bg-current transition-transform [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-open:rotate-180"
        />
      </summary>

      <form action={applyCartCoupon} className="mt-2.5 flex flex-col gap-2">
        <input type="hidden" name="locale" value={locale} />
        <div
          className={`flex items-center gap-2 rounded-[12px] bg-[var(--color-chip)] p-1.5 ps-3.5 focus-within:shadow-[inset_0_0_0_1px_var(--color-brand-500)] ${
            invalid ? "shadow-[inset_0_0_0_1px_var(--color-error)]" : "shadow-[inset_0_0_0_1px_var(--color-line)]"
          }`}
        >
          <input
            type="text"
            name="coupon"
            dir="ltr"
            defaultValue={typed ?? ""}
            required
            maxLength={64}
            autoComplete="off"
            placeholder={m.checkout.couponPlaceholder}
            aria-label={m.checkout.couponPrompt}
            aria-invalid={invalid}
            aria-describedby={invalid ? "cart-coupon-note" : undefined}
            className={`h-9 w-0 min-w-0 flex-1 bg-transparent text-body-s font-semibold uppercase outline-none placeholder:normal-case placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none rtl:text-right ${
              invalid ? "text-[var(--color-error)]" : "text-[var(--color-ink)]"
            }`}
          />
          <SubmitButton className="h-9 shrink-0 rounded-[8px] bg-[var(--color-brand-500)] px-3.5 text-body-s font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)]">
            {m.checkout.couponApply}
          </SubmitButton>
        </div>
        {invalid ? (
          <p id="cart-coupon-note" role="status" className="text-caption font-semibold leading-[1.5] text-[var(--color-error)] lg:text-body-s">
            {signInMessage ?? m.cart.couponInvalid}
            {signInMessage ? (
              <>
                {" "}
                <Link href={couponSignInHref(locale, typed)} className="font-bold text-[var(--color-brand-500)] underline underline-offset-2">
                  {m.checkout.couponSignIn}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </form>
    </details>
  );
}

/**
 * One basket line — Figma «Cart Item»: the phone's card (`6847:94863`) and
 * the desktop's table row (`5605:9609`, under the header `5605:9569`). ONE
 * tree for both, laid out by grid areas, so every form (trash, stepper) is in
 * the page once.
 *
 *   phone:   [image 96×110] name ............ trash
 *                          price  struck
 *                          [ −    qty    + ] (full width)
 *            fields «label : value», the pencil at the end
 *   desktop: [trash strip][image 150×143] name / fields | − qty + | struck/price
 *
 * The struck regular price and «وفر ٪» come only from the server
 * (`regular_price` / `savings_pct`, HANDBOOK §1), drawn under today's rule.
 *
 * THE FIELDS so the customer can spot a mistake (owner, 2026-10-07): every
 * value they typed as «label : value» — a password too, as dots with a reveal
 * (`SecretFieldValue`), whose value is fetched on a tap and never in this
 * HTML. The pencil opens the non-secret ones in place (`?edit=`); a line whose
 * only fields are secret goes back to its product page, the one place those
 * are typed.
 */
function CartRow({
  view,
  locale,
  lineTotal,
  quote,
  editing,
  held = [],
}: {
  view: CartView;
  locale: Locale;
  lineTotal: string | null;
  quote: CartQuote | null;
  editing: boolean;
  /** The credential keys the vault holds for this line — KEYS only, never values. */
  held?: readonly string[];
}) {
  const m = messagesFor(locale);
  const gone = view.unavailable !== null;

  // The server's line total, else the unit price; else nothing at all —
  // never a placeholder a customer could read as a price.
  const amount =
    lineTotal && quote
      ? formatMoney(locale, lineTotal, quote.currency)
      : view.price
        ? formatMoney(locale, view.price.amount, view.price.currency)
        : null;
  // The struck figure is the server's UNIT regular price, so it is drawn only
  // where the figure beside it is one unit too: a single unit, and no code
  // spreading a discount across the lines. Never scaled here (HANDBOOK §1).
  const oneUnit = view.line.quantity === 1 && !quote?.couponCode;
  const regular =
    view.regularPrice && view.savingsPct && oneUnit
      ? formatMoney(locale, view.regularPrice.amount, view.regularPrice.currency)
      : null;
  const saving = view.savingsPct ? m.product.save.replace("{pct}", String(view.savingsPct)) : null;

  const completeHref = completeLineHref(locale, view);
  const editHref =
    view.editable.length > 0
      ? `/${locale}/cart?edit=${encodeURIComponent(view.id)}`
      : view.credentials.length > 0
        ? completeHref
        : null;
  const hasFields = view.fields.length > 0 || view.credentials.length > 0;
  const secretWords = {
    show: m.cart.revealSecret,
    hide: m.cart.hideSecret,
    hidden: m.cart.secretHidden,
    gone: m.cart.secretGone,
    failed: m.cart.secretFailed,
    complete: m.payment.completeOnProduct,
  };

  return (
    <article
      className={`grid grid-cols-[96px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-[20px] bg-[var(--color-chip)] p-3 [grid-template-areas:'img_name_trash'_'img_price_price'_'img_step_step'_'fields_fields_fields'_'notice_notice_notice'] lg:grid-cols-[40px_150px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] lg:gap-x-0 lg:rounded-none lg:border-b lg:border-[var(--color-divider)] lg:bg-transparent lg:px-0 lg:py-4 lg:grid-rows-[minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] lg:[grid-template-areas:'trash_img_._step_price'_'trash_img_name_step_price'_'trash_img_fields_step_price'_'trash_img_._step_price'_'notice_notice_notice_notice_notice'] ${
        gone ? "[&>*:not(.cq-gone-notice)]:opacity-55" : ""
      }`}
    >
      {/* 96×110 on the phone, 150×143 beside the trash strip on desktop;
          «وفر ٪» on the comp's dark fade at the top. */}
      {/* The picture alone; the brand blue only where there is none. */}
      <div className={`relative h-[110px] w-[96px] self-center overflow-hidden rounded-[9px] ${view.image ? "" : "bg-[var(--color-brand-500)]"} [grid-area:img] lg:h-[143px] lg:w-[150px] lg:rounded-s-none lg:rounded-e-[10px]`}>
        {view.image ? (
          <ArtworkFill art={view.image} alt={view.image.alt || view.name} sizes="(min-width: 1024px) 150px, 96px" className={gone ? "grayscale" : ""} />
        ) : null}
        {saving ? (
          <>
            <span aria-hidden className="absolute inset-x-0 top-0 h-[33px] bg-gradient-to-b from-black/75 to-transparent lg:h-[81px]" />
            <span className="absolute start-1 top-[3px] text-caption font-semibold leading-[1.5] text-[var(--color-error-light)] lg:start-2 lg:top-[5px] lg:text-body-l">
              {saving}
            </span>
          </>
        ) : null}
      </div>

      {/* The pack is WHAT was chosen (customers, 2026-11-03: the 12px grey
          line read as a footnote), so it is its own brand chip at body size,
          not a muted line under the name. `auto`: «660 UC» reads LTR. */}
      <p className="flex min-w-0 flex-col items-start gap-1 text-body-s font-bold leading-[1.45] text-pretty text-[var(--color-ink)] [grid-area:name] lg:ms-5 lg:text-body-l">
        <span>{view.name}</span>
        {view.denominationLabel ? (
          <span dir="auto" className="flex max-w-full items-center gap-1.5 rounded-[8px] bg-[var(--color-primary-wash-lighter)] px-2 py-0.5 text-body-s font-bold text-[var(--color-brand-500)] [overflow-wrap:anywhere] lg:text-body-m">
            {view.currencyIcon ? <Image src={view.currencyIcon} alt="" aria-hidden width={24} height={24} unoptimized className="size-6 shrink-0 object-contain" /> : null}
            {view.denominationLabel}
          </span>
        ) : null}
      </p>

      {/* The trash: 20px beside the name on the phone; the comp's red strip
          before the picture on desktop. */}
      <form action={removeFromCart} className="[grid-area:trash] lg:h-[143px] lg:self-center">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="line" value={view.id} />
        <SubmitButton
          title={m.cart.remove}
          aria-label={`${m.cart.remove}: ${view.name}`}
          className="-m-1.5 grid size-8 place-items-center rounded-[8px] text-[var(--color-error)] transition hover:bg-[var(--color-error-wash)] active:scale-95 lg:m-0 lg:h-full lg:w-10 lg:rounded-e-none lg:rounded-s-[10px] lg:bg-[color-mix(in_srgb,var(--color-error)_24%,transparent)] lg:hover:bg-[color-mix(in_srgb,var(--color-error)_32%,transparent)]"
        >
          <span aria-hidden className="block size-5 bg-current [mask-image:url(/brand/icon-trash.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] lg:size-6" />
        </SubmitButton>
      </form>

      {amount ? (
        <p className="flex flex-wrap items-baseline gap-x-2 [grid-area:price] lg:ms-4 lg:flex-col-reverse lg:items-end lg:self-center">
          <span dir="ltr" className={`text-body-s font-bold leading-[1.5] text-[var(--color-brand-500)] lg:text-body-l ${MONEY}`}>
            {amount}
          </span>
          {regular ? (
            <s dir="ltr" className={`text-caption-xs leading-[1.5] text-[var(--color-error)] lg:text-caption ${MONEY}`}>
              {regular}
            </s>
          ) : null}
        </p>
      ) : null}

      {!gone ? (
        <div className="mt-2 [grid-area:step] lg:mt-0 lg:ms-4 lg:self-center lg:justify-self-center">
          <Stepper view={view} locale={locale} label={m.cart.quantity} disabled={gone} />
        </div>
      ) : null}

      {/* The values the customer typed, so a mistake shows. Credentials are
          dots with a reveal; their value is never in this page. */}
      {editing ? (
        <div className="mt-3 [grid-area:fields] lg:ms-5">
          <EditLineFields locale={locale} lineId={view.id} fields={view.editable} initial={view.line.fields} />
        </div>
      ) : hasFields ? (
        <div className="mt-3 flex items-start gap-1 [grid-area:fields] lg:mt-1 lg:ms-5 lg:flex-row-reverse lg:justify-end lg:gap-2">
          {/* Body size, the label muted and the value bold ink: the player id
              is what a customer checks before paying (2026-11-03). */}
          <dl className="flex min-w-0 flex-1 flex-col gap-1 text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:flex-none lg:text-body-m">
            {view.fields.map((field) => (
              <div key={field.key} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                <dt className="shrink-0 text-[var(--color-ink-muted)]">{field.label} :</dt>
                {/* `auto`: a player id reads LTR, an option's Arabic label RTL. */}
                <dd {...CLARITY_MASK} dir="auto" className="min-w-0 font-bold tracking-[0.02em] [overflow-wrap:anywhere]">
                  {field.value ?? m.upload.done}
                </dd>
              </div>
            ))}
            {view.credentials.map((field) => {
              const label = field.label?.[locale] || field.label?.en || field.key;
              return (
                <div key={field.key} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <dt className="shrink-0 text-[var(--color-ink-muted)]">{label} :</dt>
                  <dd {...CLARITY_MASK} className="min-w-0 font-bold">
                    {held.includes(field.key) ? (
                      <SecretFieldValue lineId={view.id} fieldKey={field.key} label={label} completeHref={completeHref} words={secretWords} />
                    ) : (
                      // Never typed, or the vault's two hours are up: typed
                      // again on the product page, the one place it is asked.
                      <Link href={completeHref} className="font-bold text-[var(--color-brand-500)] underline-offset-4 hover:underline">
                        {m.payment.completeOnProduct}
                      </Link>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {editHref && !gone ? (
            <Link
              href={editHref}
              scroll={false}
              title={m.cart.editDetails}
              aria-label={`${m.cart.editDetails}: ${view.name}`}
              className="grid size-5 shrink-0 place-items-center text-[var(--color-brand-500)] transition hover:opacity-75 lg:mt-0.5"
            >
              <span aria-hidden className="block size-5 bg-current [mask-image:url(/brand/icon-edit.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {gone ? (
        <div className="cq-gone-notice mt-3 [grid-area:notice]">
          <GoneNotice view={view} locale={locale} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * A line that can no longer be sold, and the way on (`7423:39191`): the
 * error wash, the reason beside an information glyph, and «إزالة المنتج»
 * outlined in red — checkout stays locked until it goes.
 */
function GoneNotice({ view, locale }: { view: CartView; locale: Locale }) {
  const m = messagesFor(locale);

  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] bg-[var(--color-error-subtlest)] p-3">
      <p className="flex items-start gap-2 text-caption font-semibold leading-[1.5] text-[var(--color-error)] lg:text-body-s">
        <span aria-hidden className="mt-0.5 block size-4 shrink-0 bg-current [mask-image:url(/brand/icon-info.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        <span>{view.unavailable === "gone" ? m.cart.unavailableNotice : m.cart.denominationGone}</span>
      </p>
      <form action={removeFromCart}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="line" value={view.id} />
        <SubmitButton className="h-10 w-full rounded-[10px] border border-[var(--color-error)] text-body-s font-bold text-[var(--color-error)] transition hover:bg-[var(--color-error-wash)]">
          {m.cart.removeProduct}
        </SubmitButton>
      </form>
    </div>
  );
}

/**
 * «− 1 +» — the comp's pill (`7104:19068` / `7104:9569`): grey at 16%, a red
 * minus and a green plus at 24% with the comp's own glyphs, the count between
 * them. Full width under the price on the phone (37 tall, the two buttons
 * sharing the row), its own column on desktop (38 tall, 33-wide buttons). Two
 * submit buttons in one form — no JavaScript. They are `feedback` buttons:
 * they show the pending look but are never locked, because two quick taps are
 * meant to be two `±1` (`lib/cart/actions.ts`).
 */
function Stepper({
  view,
  locale,
  label,
  disabled,
}: {
  view: CartView;
  locale: Locale;
  label: string;
  disabled: boolean;
}) {
  const quantity = view.line.quantity;

  return (
    <form
      action={stepCartQuantity}
      dir="ltr"
      className="flex h-[37px] w-full items-center gap-4 rounded-full bg-[var(--color-action-disabled-bg)] p-1 lg:h-[38px] lg:w-auto"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="line" value={view.id} />

      <SubmitButton
        mode="feedback"
        name="delta"
        value="-1"
        disabled={disabled || quantity <= 1}
        aria-label={`${label} −`}
        className={`${STEP} bg-[color-mix(in_srgb,var(--color-error)_24%,transparent)] text-[var(--color-error)]`}
      >
        <span aria-hidden className="block h-0.5 w-2.5 bg-current [mask-image:url(/brand/icon-stepper-minus.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      </SubmitButton>

      {/* `aria-live` (inside `StepperQuantity`): pressing a button reloads the
          page, and a screen reader otherwise announces nothing about what
          changed. The number dims while the tap is saved. */}
      <StepperQuantity className={`min-w-4 text-center text-heading-l font-semibold leading-none text-[var(--color-ink)] lg:text-display ${MONEY}`}>
        {quantity}
      </StepperQuantity>

      <SubmitButton
        mode="feedback"
        name="delta"
        value="1"
        disabled={disabled || quantity >= CART_MAX_QUANTITY}
        aria-label={`${label} +`}
        className={`${STEP} bg-[color-mix(in_srgb,var(--color-success)_24%,transparent)] text-[var(--color-success)]`}
      >
        <span aria-hidden className="block size-2.5 bg-current [mask-image:url(/brand/icon-stepper-plus.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      </SubmitButton>
    </form>
  );
}

const STEP = "grid h-full min-w-0 flex-1 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 lg:w-[33px] lg:flex-none";
