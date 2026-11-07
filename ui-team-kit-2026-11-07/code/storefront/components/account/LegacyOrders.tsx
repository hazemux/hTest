import Link from "next/link";

import type { listLegacyOrders } from "@/lib/api/client";
import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { formatStoreDateTime } from "@/lib/i18n/time";

type LegacyList = NonNullable<Awaited<ReturnType<typeof listLegacyOrders>>>;
type LegacyOrder = LegacyList["data"][number];

/**
 * «طلبات سابقة من المتجر القديم» (ADR 0047) — the customer's completed
 * orders from the old WooCommerce store, under their new orders.
 *
 * No comp exists for this section: it is built to the design system, in the
 * orders cards' own idiom. Read-only by design — no pay, reorder, review or
 * open-order link, because none of those exists for an old order. Only the
 * TOTAL is shown: the old store's subtotal/fee split does not add up for most
 * orders, so printing it would show sums that disagree with what was paid. Each card is
 * a `<details>`, so its lines open without any script. Amounts are the old
 * store's own, in the order's own currency, through `formatMoney` only.
 *
 * Renders nothing when there is nothing to show (the archive is off, or the
 * customer has no old orders): an empty section would only be noise.
 */
export function LegacyOrders({ locale, list, moreHref }: { locale: Locale; list: LegacyList | null; moreHref: string | null }) {
  if (list === null || list.data.length === 0) return null;
  const m = messagesFor(locale).legacyOrders;

  return (
    <section
      aria-labelledby="legacy-orders-title"
      className="mt-4 flex flex-col gap-3 lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)]"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id="legacy-orders-title" className="text-body-l font-bold leading-[1.4] text-[var(--color-ink)] lg:text-heading-m">
            {m.title}
          </h2>
          <span dir="ltr" className="rounded-full bg-[var(--color-bg-subtle)] px-2 text-caption font-bold leading-[22px] text-[var(--color-ink-muted)]">
            {list.meta.total}
          </span>
        </div>
        <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.lead}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {list.data.map((order) => (
          <li key={order.number}>
            <LegacyOrderCard locale={locale} order={order} />
          </li>
        ))}
      </ul>

      {moreHref ? (
        <Link href={moreHref} scroll={false} className="self-center px-4 py-2 text-body-s font-bold text-[var(--color-brand-500)] hover:underline lg:text-body-l">
          {messagesFor(locale).orders.loadMore}
        </Link>
      ) : null}

      <p className="text-caption text-[var(--color-ink-subtle)]">{m.codesNote}</p>
    </section>
  );
}

function LegacyOrderCard({ locale, order }: { locale: Locale; order: LegacyOrder }) {
  const m = messagesFor(locale).legacyOrders;
  const names = order.items.map((item) => item.name).filter((name) => name !== "").join(" · ");
  const money = (amount: string) => formatMoney(locale, amount, order.currency);

  return (
    <details className="group rounded-[16px] bg-[var(--color-chip)] p-3.5 lg:px-4">
      <summary className="flex cursor-pointer list-none items-start gap-3 text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-body-s font-bold leading-[1.45] lg:text-body-l">{names}</span>
          <span className="flex gap-1.5 whitespace-nowrap text-caption text-[var(--color-ink-subtle)] lg:text-body-s">
            <bdi dir="ltr">#{order.number}</bdi>
            <span aria-hidden>·</span>
            <span className="truncate">{formatStoreDateTime(locale, order.placed_at, { dateStyle: "medium" })}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span dir="ltr" className="text-body-m font-bold tabular-nums">
            {money(order.total)}
          </span>
          <span
            aria-hidden
            className="block size-4 bg-[var(--color-ink-muted)] transition-transform [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-open:rotate-180"
          />
          <span className="sr-only">{m.details}</span>
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-divider)] pt-3 text-body-s text-[var(--color-ink)]">
        <ul className="flex flex-col gap-2.5">
          {order.items.map((item, index) => (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-semibold">{item.name}</span>
                {item.total !== null ? (
                  <span dir="ltr" className="shrink-0 tabular-nums">
                    {money(item.total)}
                  </span>
                ) : null}
              </div>
              <span className="text-caption text-[var(--color-ink-muted)]">
                {m.quantity}: <bdi dir="ltr">{item.quantity}</bdi>
                {item.sku ? (
                  <>
                    {" · "}
                    <bdi dir="ltr">{item.sku}</bdi>
                  </>
                ) : null}
              </span>
              {Object.entries(item.details).map(([label, value]) => (
                <span key={label} className="text-caption text-[var(--color-ink-muted)]">
                  {label}: <bdi dir="auto" className="font-semibold text-[var(--color-ink)]">{value}</bdi>
                </span>
              ))}
            </li>
          ))}
        </ul>

        <dl className="flex flex-col gap-1.5 border-t border-[var(--color-divider)] pt-3">
          {order.payment_method ? (
            <Row label={m.paidWith}>
              <bdi dir="auto">{order.payment_method}</bdi>
            </Row>
          ) : null}
          <Row label={m.total} strong>
            <span dir="ltr" className="tabular-nums">
              {money(order.total)}
            </span>
          </Row>
        </dl>
      </div>
    </details>
  );
}

function Row({ label, strong = false, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <dt className={strong ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}>{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}
