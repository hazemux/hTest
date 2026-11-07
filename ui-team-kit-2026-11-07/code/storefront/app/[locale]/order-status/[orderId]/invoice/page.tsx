import type { Metadata } from "next";
import { connection } from "next/server";
import { allExempt } from "@/lib/catalog/tax";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/ui/PrintButton";
import { readSessionToken } from "@/lib/account/session";
import { ApiError, getOrder } from "@/lib/api/client";
import { readOrderToken } from "@/lib/checkout/order-token";
import { isLocale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";
import { isNonZeroAmount } from "@/lib/loyalty/format";
import { hasUnrecordedLines, lineDenomination, lineName } from "@/lib/orders/purchased";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * «تحميل الفاتورة» (Figma `6847:91695`) — the order's invoice as a printable
 * page. The browser's own print dialog saves it as a PDF: no PDF library on
 * the server (a dependency the project has not approved), and the figures are
 * the SAME strings the order page shows — the server's pricing snapshot,
 * formatted, never recomputed.
 *
 * THE ORDER PAGE'S CREDENTIALS, THE ORDER PAGE'S ANSWER. The order's own guest
 * cookie or the signed-in session, and 404 without one — an invoice names what
 * someone bought and what they paid, so it is as private as the order.
 *
 * Printing shows `<main>` alone (globals.css `@media print`), so the site's
 * header, footer and tab bar never reach the paper.
 */
export default async function OrderInvoicePage(props: { params: Promise<{ locale: string; orderId: string }> }) {
  // Per request, always: this page is somebody's order.
  await connection();
  const { locale, orderId } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const guestToken = await readOrderToken(orderId);
  const bearerToken = guestToken ? undefined : await readSessionToken();
  if (!guestToken && !bearerToken) notFound();

  let order;
  try {
    order = await getOrder(orderId, { locale, guestToken, bearerToken });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 401)) notFound();
    throw error;
  }

  const p = order.pricing;
  const currency = p.currency;
  const money = (amount: string) => formatMoney(locale, amount, currency);

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-12 pt-6 text-[var(--color-ink)] print:max-w-none print:p-0 print:text-black">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/${locale}/order-status/${encodeURIComponent(order.id)}`} className="text-body-s font-semibold text-[var(--color-brand-500)]">
          {m.orderStatus.backToOrder}
        </Link>
        <PrintButton
          label={m.orderStatus.print}
          className="h-10 rounded-[8px] bg-[var(--color-brand-500)] px-4 text-body-s font-semibold text-[var(--color-on-primary)]"
        />
      </div>

      <article className="rounded-[16px] border border-[var(--color-divider)] p-5 print:rounded-none print:border-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-divider)] pb-4">
          <div>
            {/* On screen the header's own theme-aware lockup; on paper the
                pack's black logo (owner, 2026-10-07) — the dark theme's light
                lockup would print white on white. */}
            <Image src="/brand/logo-chargerquick-wide.svg" alt="" width={321} height={106} className="cq-light-theme-only mb-3 h-10 w-auto print:hidden" />
            <Image src="/brand/logo-chargerquick-wide-light.svg" alt="" width={321} height={106} className="cq-dark-theme-only mb-3 h-10 w-auto print:hidden" />
            <Image src="/brand/logo-chargerquick-stacked-black.svg" alt="" width={238} height={276} className="mb-3 hidden h-20 w-auto print:block" />
            <h1 className="text-display font-bold">{m.orderStatus.invoiceTitle}</h1>
            <p className="text-body-s font-semibold">{m.common.storeName}</p>
          </div>
          <dl className="text-body-s">
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.invoiceNumber} :</dt>
              <dd dir="ltr">#{order.id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.invoiceDate} :</dt>
              <dd>{formatStoreDateTime(locale, order.created_at)}</dd>
            </div>
            {order.payment_method ? (
              <div className="flex gap-2">
                <dt className="text-[var(--color-ink-muted)]">{m.orderStatus.paymentMethod} :</dt>
                <dd>{m.paymentMethodName[order.payment_method]}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        <table className="mt-4 w-full text-body-s">
          <thead>
            <tr className="border-b border-[var(--color-divider)] text-[var(--color-ink-muted)]">
              <th className="py-2 text-start font-semibold">{m.checkout.productDetails}</th>
              <th className="py-2 text-center font-semibold">{m.cart.colQuantity}</th>
              <th className="py-2 text-end font-semibold">{m.cart.colPrice}</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((item, index) => (
              <tr key={index} className="border-b border-[var(--color-divider)] align-top">
                <td className="py-2">
                  {lineName(item, locale)}
                  {lineDenomination(item, locale) ? ` — ${lineDenomination(item, locale)}` : ""}
                </td>
                <td dir="ltr" className="py-2 text-center">
                  {item.quantity}
                </td>
                <td dir="ltr" className="py-2 text-end">
                  {item.final_price ? money(item.final_price) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* An order placed before purchase details were kept: its names are the
            store's current ones, and an invoice must not pass them off as what
            was bought. Printed with the rest. */}
        {hasUnrecordedLines(order.items) ? (
          <p className="mt-2 text-caption leading-[1.6] text-[var(--color-ink-muted)]">{m.orderStatus.invoiceNamesAsListed}</p>
        ) : null}

        <dl className="ms-auto mt-4 flex max-w-[320px] flex-col gap-1 text-body-s">
          {/* v0.1.141 — before the coupon; the discount row takes it off. */}
          <Row label={`${m.orderStatus.goods} :`} value={money(p.subtotal ?? p.final_price)} />
          {p.discount && Number(p.discount) > 0 ? (
            <Row label={`${m.checkout.invoiceDiscount}${p.coupon_code ? ` (${p.coupon_code})` : ""} :`} value={`− ${money(p.discount)}`} />
          ) : null}
          {p.processing_fee !== undefined && Number(p.processing_fee) > 0 ? (
            <Row label={`${m.orderStatus.processingFee} :`} value={money(p.processing_fee)} />
          ) : null}
          {/* ADR 0043 §3 — what Charger Points and Charger Balance paid, as
              the order page shows them; without these rows a points or
              balance order's invoice did not add up to the total. */}
          {p.points_value && isNonZeroAmount(p.points_value) && p.points_redeemed_pts ? (
            <Row
              label={`${m.loyalty.checkout.pointsLine.replace("{pts}", formatPoints(locale, String(p.points_redeemed_pts)))} :`}
              value={`− ${money(p.points_value)}`}
            />
          ) : null}
          {p.balance_used && isNonZeroAmount(p.balance_used) ? (
            <Row label={`${m.loyalty.checkout.balanceLine} :`} value={`− ${money(p.balance_used)}`} />
          ) : null}
          {p.tax !== undefined && Number(p.tax) > 0 ? (
            <Row label={m.orderStatus.vat} value={money(p.tax)} muted />
          ) : allExempt(order.items) ? (
            // v0.1.87 — an exempt sale's invoice states the exemption rather than a zero VAT line.
            <Row label={`${m.orderStatus.vatLabel} :`} value={m.orderStatus.vatExempt} muted />
          ) : null}
          <div className="mt-1 flex justify-between gap-3 border-t border-[var(--color-divider)] pt-2 font-bold">
            <dt>{order.payment_state === "captured" ? m.orderStatus.grandTotal : m.orderStatus.total} :</dt>
            <dd dir="ltr">{money(p.total)}</dd>
          </div>
        </dl>
      </article>
    </main>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? "text-caption text-[var(--color-ink-muted)]" : ""}`}>
      <dt>{label}</dt>
      <dd dir="ltr">{value}</dd>
    </div>
  );
}
