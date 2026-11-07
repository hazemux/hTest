import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { LegacyOrders } from "@/components/account/LegacyOrders";
import { listLegacyOrders, listOrders } from "@/lib/api/client";
import { requireCustomer } from "@/lib/account/guard";
import { reorder } from "@/lib/cart/actions";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { formatMoney, formatPoints, messagesFor } from "@/lib/i18n/messages";
import { pointsUnit } from "@/lib/i18n/points-plural";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";
import { formatStoreDateTime } from "@/lib/i18n/time";
import { CUSTOMER_STATUS_PILL, customerStatus } from "@/lib/orders/customer-status";
import { canReorderOrder, orderStage, type OrderStage } from "@/lib/orders/status";
import type { Artwork } from "@/lib/catalog/product-artwork";
import { lineArtworks, linePackIcons } from "@/lib/orders/line-artwork";
import { boughtLines } from "@/lib/orders/purchased";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ArtworkFill } from "@/components/catalog/ArtworkFill";

/** How many more orders «عرض المزيد» brings, and the most one page can hold. */
const STEP = 10;
const MOST = 100;

const FILTERS = ["all", "active", "done", "failed"] as const;
type Filter = (typeof FILTERS)[number];

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; show?: string; page?: string; legacy?: string; lpage?: string }>;
};

type ListedOrder = Awaited<ReturnType<typeof listOrders>>["data"][number];

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.ordersTitle } : {};
}

/**
 * «طلباتي» as «Orders Mobile» (Claude Design, 2026-09-30) draws it.
 *
 * FILTER CHIPS with the server's counts (`status` on `GET /orders`, v0.1.63),
 * so «مكتملة» filters every order, not just the loaded page. Links, not
 * buttons: the page works before any script loads.
 *
 * A CARD PER ORDER led by WHAT WAS BOUGHT (its artwork and name), then
 * `#number · date` in one quiet line, the stage pill, the server's total and —
 * once granted — the points it earned. The whole card opens the order; the
 * ONE action beside the total fits the stage (`orderStage`): pay an unpaid
 * order, upload a transfer's receipt, buy a finished one again, nothing while
 * it is being delivered.
 *
 * «عرض المزيد» grows the list (`show`) instead of paging it, up to 100 orders;
 * past that it opens the next hundred. From `lg` the same rows sit in the
 * desktop comp's table (`7231:24996`).
 */
export default async function OrdersPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const query = await props.searchParams;
  const filter: Filter = FILTERS.includes(query.status as Filter) ? (query.status as Filter) : "all";
  const shown = Math.min(MOST, Math.max(STEP, Number.parseInt(query.show ?? "", 10) || STEP));
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);

  const here = hrefFor(locale, filter, shown, page);
  const { token } = await requireCustomer(locale, here);

  // ADR 0047 — the old store's orders sit under the new ones, on the
  // unfiltered first page only; «عرض المزيد» there grows them (`legacy`) to
  // 100, then opens the next hundred (`lpage`) — like the new orders above.
  const withLegacy = filter === "all" && page === 1;
  const legacyShown = Math.min(MOST, Math.max(STEP, Number.parseInt(query.legacy ?? "", 10) || STEP));
  const legacyPage = legacyShown === MOST ? Math.max(1, Number.parseInt(query.lpage ?? "1", 10) || 1) : 1;

  const [orders, legacy] = await Promise.all([
    listOrders({ page, per_page: shown, ...(filter === "all" ? {} : { status: filter }) }, { locale, bearerToken: token }).catch(() => null),
    withLegacy ? listLegacyOrders({ page: legacyPage, per_page: legacyShown }, { locale, bearerToken: token }).catch(() => null) : Promise.resolve(null),
  ]);
  const legacyMore =
    legacy !== null && legacyPage * legacyShown < legacy.meta.total
      ? legacyHref(
          hrefFor(locale, filter, shown, page),
          legacyShown < MOST ? Math.min(MOST, legacyShown + STEP) : MOST,
          legacyShown < MOST ? 1 : legacyPage + 1,
        )
      : null;

  // Each order's first line, pictured as that product's page pictures it.
  const firstLines = (orders?.data ?? []).flatMap((order) => order.items?.[0] ?? []);
  // And the lines a row names, each pack with its currency picture (`linePackIcons`).
  const shownLines = (orders?.data ?? []).flatMap((order) => (order.items ?? []).slice(0, SHOWN_LINES));
  const [firstArt, shownIcons] = await Promise.all([
    lineArtworks(firstLines, locale).catch(() => firstLines.map(() => null)),
    linePackIcons(shownLines, locale).catch(() => shownLines.map(() => null)),
  ]);
  const artOf = new Map((orders?.data ?? []).filter((order) => order.items?.[0]).map((order, index) => [order.id, firstArt[index] ?? null]));
  const iconsOf = new Map<string, (string | null)[]>();
  let shownAt = 0;
  for (const order of orders?.data ?? []) {
    const count = Math.min(SHOWN_LINES, order.items?.length ?? 0);
    iconsOf.set(order.id, shownIcons.slice(shownAt, shownAt + count));
    shownAt += count;
  }

  const listed = orders?.meta?.total ?? 0;
  const counts = orders?.counts ?? { all: listed, active: 0, done: 0, failed: 0 };
  const more = orders !== null && page * shown < listed;
  const moreHref = shown < MOST ? hrefFor(locale, filter, Math.min(MOST, shown + STEP), 1) : hrefFor(locale, filter, MOST, page + 1);
  const chipLabel: Record<Filter, string> = {
    all: m.orders.filterAll,
    active: m.orders.filterActive,
    done: m.orders.filterDone,
    failed: m.orders.filterFailed,
  };

  return (
    <AccountShell locale={locale} active="orders">
      <section className="flex flex-col gap-4 lg:rounded-[16px] lg:bg-[var(--color-surface-raised)] lg:p-6 lg:shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        <div className="flex items-center gap-2">
          <h2 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)] lg:text-heading-l">{m.account.ordersTitle}</h2>
          {orders ? (
            <span dir="ltr" className="rounded-full bg-[var(--color-bg-subtle)] px-2 text-caption font-bold leading-[22px] text-[var(--color-ink-muted)]">
              {counts.all}
            </span>
          ) : null}
        </div>

        {orders && counts.all > 0 ? (
          // Scrolls sideways inside its own strip on a narrow phone, bleeding
          // to the gutter, so the page itself never does.
          <nav aria-label={m.account.ordersTitle} className="-mx-6 flex gap-2 overflow-x-auto px-6 py-1 [scrollbar-width:none] lg:mx-0 lg:px-0">
            {FILTERS.map((key) => {
              const on = key === filter;
              return (
                <Link
                  key={key}
                  href={hrefFor(locale, key, STEP, 1)}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-body-s font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] ${
                    on
                      ? "bg-[var(--color-brand-500)] text-[var(--color-on-cta)]"
                      : "bg-[var(--color-chip)] text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)]"
                  }`}
                >
                  {chipLabel[key]}
                  <span dir="ltr" className="text-caption opacity-70">
                    {counts[key]}
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        {orders === null ? (
          <p className="rounded-[12px] bg-[var(--color-chip)] p-3.5 text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.sectionUnavailable}</p>
        ) : orders.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-6 text-center">
            <p className="text-body-l font-bold text-[var(--color-ink)] lg:text-heading-m">{filter !== "all" ? m.orders.emptyFilter : legacy && legacy.data.length > 0 ? m.legacyOrders.noNewOrders : m.account.noOrders}</p>
            <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.orders.emptyLead}</p>
            <Link
              href={`/${locale}`}
              className="mt-2 flex h-[46px] items-center rounded-[12px] bg-[var(--color-brand-500)] px-6 text-body-s font-bold text-[var(--color-on-cta)] hover:bg-[var(--color-primary-hover)]"
            >
              {m.orders.browse}
            </Link>
          </div>
        ) : (
          <>
            {/* PHONE — a card per order («Orders Mobile»). */}
            <ul className="flex flex-col gap-3 lg:hidden">
              {orders.data.map((order) => (
                <li key={order.id}>
                  <OrderCard locale={locale} order={order} art={artOf.get(order.id) ?? null} icons={iconsOf.get(order.id) ?? []} />
                </li>
              ))}
            </ul>

            {/* DESKTOP — the comp's table, the same stage and action per row. */}
            <div className="hidden overflow-hidden rounded-[12px] border border-[var(--color-divider)] lg:block">
              <table className="w-full text-body-l">
                <thead className="bg-[var(--color-field)] text-[var(--color-ink-muted)]">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{m.account.colNumber}</th>
                    <th className="px-4 py-3 text-start font-semibold">{m.account.colDate}</th>
                    <th className="px-4 py-3 text-start font-semibold">{m.account.colStatus}</th>
                    <th className="px-4 py-3 text-start font-semibold">{m.account.colTotal}</th>
                    <th className="px-4 py-3 text-start font-semibold">{m.account.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-divider)]">
                  {orders.data.map((order) => {
                    const stage = orderStage(order);
                    return (
                      <tr key={order.id} className="text-[var(--color-ink)]">
                        <td className="max-w-[300px] px-4 py-3">
                          <Link href={orderHref(locale, order.id)} className="flex items-center gap-3 hover:text-[var(--color-brand-500)]">
                            <Artwork art={artOf.get(order.id) ?? null} />
                            <span className="min-w-0">
                              <Bought order={order} locale={locale} icons={iconsOf.get(order.id) ?? []} />
                              <span dir="ltr" className="block text-body-s text-[var(--color-ink-muted)]">
                                #{order.id}
                              </span>
                            </span>
                          </Link>
                        </td>
                        {/* The locale's own date, in its own direction — forcing LTR
                            on an Arabic date scrambles its parts. */}
                        <td className="px-4 py-3">{formatStoreDateTime(locale, order.created_at, { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="px-4 py-3">
                          <StatusPill order={order} locale={locale} />
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums" dir="ltr">
                          <span className="block text-start">{formatMoney(locale, order.pricing.total, order.pricing.currency)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StageAction locale={locale} order={order} stage={stage} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {more ? (
              <Link href={moreHref} scroll={false} className="self-center px-4 py-2 text-body-s font-bold text-[var(--color-brand-500)] hover:underline lg:text-body-l">
                {m.orders.loadMore}
              </Link>
            ) : null}
          </>
        )}
      </section>

      <LegacyOrders locale={locale} list={legacy} moreHref={legacyMore} />
    </AccountShell>
  );
}

function hrefFor(locale: Locale, filter: Filter, shown: number, page: number): string {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("status", filter);
  if (shown !== STEP) query.set("show", String(shown));
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return `/${locale}/account/orders${search ? `?${search}` : ""}`;
}

/** «طلباتي» with the old-store list grown to `shown`, at hundred-page `lpage`. */
function legacyHref(base: string, shown: number, lpage: number): string {
  const url = new URL(base, "http://local");
  url.searchParams.set("legacy", String(shown));
  if (lpage > 1) url.searchParams.set("lpage", String(lpage));
  return `${url.pathname}${url.search}`;
}

function orderHref(locale: Locale, orderId: string): string {
  return `/${locale}/order-status/${encodeURIComponent(orderId)}`;
}

/**
 * One order's card: the card opens the order; the action sits OUTSIDE that
 * link (a link inside a link is invalid), beside the total.
 */
function OrderCard({ locale, order, art, icons }: { locale: Locale; order: ListedOrder; art: Artwork | null; icons: readonly (string | null)[] }) {
  const stage = orderStage(order);

  return (
    <article className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-chip)] p-3.5">
      <Link href={orderHref(locale, order.id)} className="flex items-start gap-3 text-[var(--color-ink)]">
        <Artwork art={art} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Bought order={order} locale={locale} icons={icons} />
          <span className="flex gap-1.5 whitespace-nowrap text-caption text-[var(--color-ink-subtle)]">
            <bdi dir="ltr">#{order.id}</bdi>
            <span aria-hidden>·</span>
            <span className="truncate">{formatStoreDateTime(locale, order.created_at, { dateStyle: "short", timeStyle: "short" })}</span>
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2.5">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <StatusPill order={order} locale={locale} />
          <span dir="ltr" className="text-body-m font-bold tabular-nums text-[var(--color-ink)]">
            {formatMoney(locale, order.pricing.total, order.pricing.currency)}
          </span>
          {/* What the order EARNED, net of any clawback, in display points
              (ADR 0043) — absent until granted; «قيد التأكيد» while the
              order's `loyalty` says the points are still pending. */}
          {order.points_earned_pts ? (
            <span className="flex items-center gap-[3px] text-caption font-bold text-[var(--color-ink-muted)]">
              <Image src={CURRENCY_ICON} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5" />
              <bdi dir="ltr">+{formatPoints(locale, String(order.points_earned_pts))}</bdi>
              {order.loyalty?.points_status === "pending" ? <span className="font-semibold text-[var(--color-warning-strong)]">· {messagesFor(locale).loyalty.home.pending}</span> : null}
            </span>
          ) : null}
          {/* What it SPENT from Charger Points (display points), when it did. */}
          {order.loyalty?.points_spent_pts ? (
            <span className="text-caption font-semibold text-[var(--color-ink-subtle)]">
              <bdi dir="ltr">−{formatPoints(locale, String(order.loyalty.points_spent_pts))}</bdi> {pointsUnit(locale, order.loyalty.points_spent_pts)}
            </span>
          ) : null}
        </span>
        <StageAction locale={locale} order={order} stage={stage} />
      </div>
    </article>
  );
}

/**
 * The status the server says the customer sees (v0.1.121), in its tone:
 * amber waiting, blue on its way, green done, red cancelled, grey refunded.
 */
function StatusPill({ order, locale }: { order: ListedOrder; locale: Locale }) {
  const status = customerStatus(order);
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 text-caption font-bold leading-[22px] lg:text-body-l lg:font-medium ${CUSTOMER_STATUS_PILL[status]}`}>
      {messagesFor(locale).customerStatus[status]}
    </span>
  );
}

/** The ONE action that fits the stage — none while the order is being delivered. */
function StageAction({ locale, order, stage }: { locale: Locale; order: ListedOrder; stage: OrderStage }) {
  const m = messagesFor(locale);
  const filled =
    "flex h-9 shrink-0 items-center whitespace-nowrap rounded-[10px] bg-[var(--color-brand-500)] px-3.5 text-caption font-bold text-[var(--color-on-cta)] lg:text-body-l lg:font-semibold hover:bg-[var(--color-primary-hover)]";

  if (stage === "processing" || stage === "review") return null;
  // A wrong player ID is corrected on the order's page, not bought again.
  if (!canReorderOrder(order)) return null;
  if (stage === "pending") {
    // The order's own page pays THIS order again — no new one is made.
    return (
      <Link href={orderHref(locale, order.id)} className={filled}>
        {m.orders.pay}
      </Link>
    );
  }
  if (stage === "transfer" || stage === "proofRejected") {
    // The SAME order's transfer page — a new proof, never a new order.
    return (
      <Link href={`/${locale}/orders/${encodeURIComponent(order.id)}/bank-transfer`} className={filled}>
        {stage === "transfer" ? m.orders.uploadReceipt : m.orders.sendNewProof}
      </Link>
    );
  }
  if (stage === "proofSent") {
    // Sent and awaiting review: nothing to pay or upload — only where to see it.
    return (
      <Link
        href={`/${locale}/orders/${encodeURIComponent(order.id)}/bank-transfer`}
        className="flex h-9 shrink-0 items-center whitespace-nowrap rounded-[10px] px-3 text-caption font-bold text-[var(--color-ink)] lg:text-body-l lg:font-semibold shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)]"
      >
        {m.orders.viewTransfer}
      </Link>
    );
  }

  // «إعادة الشراء» — a form, so it works without JavaScript. An order whose
  // payment window passed (ADR 0038) says «اطلب من جديد»: the same items and
  // valid player details, priced today, as a NEW order.
  return (
    <form action={reorder} className="shrink-0">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="order" value={order.id} />
      <SubmitButton
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-caption font-bold text-[var(--color-ink)] lg:text-body-l lg:font-semibold shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-[var(--color-bg-subtle)]"
      >
        <span aria-hidden className="block size-[15px] shrink-0 bg-current [mask-image:url(/brand/icon-refresh.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        {stage === "expired" ? m.orderStatus.orderAgain : m.account.reorder}
      </SubmitButton>
    </form>
  );
}

/**
 * The first line's picture, 48 square (`lineArtworks`): THAT line's product,
 * never a later line's. The picture alone, on no plate; the brand blue only
 * where there is none to show.
 */
function Artwork({ art }: { art: Artwork | null }) {
  return (
    <span className={`relative block size-12 shrink-0 overflow-hidden rounded-[12px] ${art ? "" : "bg-[var(--color-brand-500)]"}`}>
      {art ? <ArtworkFill art={art} alt={art.alt} sizes="48px" /> : null}
    </span>
  );
}

/** How many lines a row names before «+N»: a list row, not the receipt. */
const SHOWN_LINES = 2;

/**
 * What the order bought: each line's product, its pack as a brand chip and
 * «×2» when more than one (customers, 2026-11-03 — the name alone made two
 * PUBG orders look the same). The order's own page lists every line.
 */
function Bought({ order, locale, icons }: { order: ListedOrder; locale: Locale; icons: readonly (string | null)[] }) {
  const lines = boughtLines(order.items, locale, icons);
  const rest = lines.length - SHOWN_LINES;

  return (
    <span className="flex min-w-0 flex-col gap-1">
      {lines.slice(0, SHOWN_LINES).map((line, index) => (
        <span key={index} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-body-s font-bold leading-[1.45] lg:text-body-l">
          <span className="min-w-0 truncate">{line.name}</span>
          {line.pack ? (
            <span dir="auto" className="flex max-w-full items-center gap-1 truncate rounded-[6px] bg-[var(--color-primary-wash-lighter)] px-1.5 text-caption font-bold leading-[20px] text-[var(--color-brand-500)] lg:text-body-s lg:leading-[22px]">
              {line.icon ? <Image src={line.icon} alt="" aria-hidden width={14} height={14} unoptimized className="size-3.5 shrink-0 object-contain" /> : null}
              <span className="truncate">{line.pack}</span>
            </span>
          ) : null}
          {line.quantity > 1 ? (
            <bdi dir="ltr" className="text-caption font-bold text-[var(--color-ink-muted)] lg:text-body-s">
              ×{line.quantity}
            </bdi>
          ) : null}
        </span>
      ))}
      {rest > 0 ? (
        <bdi dir="ltr" className="self-start text-caption font-bold text-[var(--color-ink-muted)] lg:text-body-s">
          +{rest}
        </bdi>
      ) : null}
    </span>
  );
}
