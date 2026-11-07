import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatDay, formatSignedAmount, formatSignedPts, formatWorth, isPositiveAmount } from "@/lib/loyalty/format";
import type { BalanceHistoryRow, PointsHistoryKind, PointsHistoryRow, StatementPage } from "@/lib/loyalty/types";

import { BALANCE_KIND_TONE, POINTS_KIND_TONE, sourceIcon } from "../art";
import { balanceRowTitle, pointsRowTitle, referenceLabel } from "../history";
import { Glyph, Pill } from "../parts";

export const POINTS_STATUS_FILTERS = ["earned", "pending", "spent", "returned", "expired", "clawed", "adjusted"] as const satisfies readonly PointsHistoryKind[];

type Row = {
  id: string;
  icon: string;
  wash: string;
  ink: string;
  title: string;
  reference: string | null;
  date: string;
  amount: string;
  amountTone: string;
  worth: string | null;
  status: string;
  detail: string;
};

export type WalletHistoryProps = {
  locale: Locale;
  /** `features.expiry` — while off, no row says when it expires and «منتهية» is not a filter. */
  expiry: boolean;
  bucket: "points" | "balance";
  /** The points filter in the URL (`?status=`), or null for all. */
  status: PointsHistoryKind | null;
  /** The page the server read for this URL; null = it could not be read. */
  page: StatementPage<PointsHistoryRow> | StatementPage<BalanceHistoryRow> | null;
  /** Builds this page's own URL for a bucket / filter / next page — the tabs are links, so Back and no-JS work. */
  href: (state: { bucket: "points" | "balance"; status?: PointsHistoryKind | null; cursor?: string | null }) => string;
};

/**
 * The wallet's «السجل» (Claude Design `WalletHub` history): points | balance,
 * the points filtered by kind; a table from `lg`, a list on the phone — one
 * set of rows drawn two ways, so the two can never disagree.
 *
 * SERVER-RENDERED FROM THE URL: the bucket, the filter and the page are
 * `?bucket=&status=&cursor=` links, read by the page and fetched `no-store`
 * (`GET /wallet/transactions`), so every state is a URL the back button and a
 * browser without JavaScript both reach. Every amount is the server's.
 */
export function WalletHistory({ locale, expiry, bucket, status, page, href }: WalletHistoryProps) {
  const m = messagesFor(locale);
  const t = m.loyalty.wallet;
  const h = m.loyalty.history;
  const isPoints = bucket === "points";
  const filters = expiry ? POINTS_STATUS_FILTERS : POINTS_STATUS_FILTERS.filter((key) => key !== "expired");

  const rows: Row[] | null =
    page === null
      ? null
      : isPoints
        ? (page.rows as PointsHistoryRow[]).map((row) => {
            const tone = POINTS_KIND_TONE[row.kind];
            return {
              id: row.id,
              icon: sourceIcon(row.source, row.kind),
              ...tone,
              title: pointsRowTitle(m, row),
              reference: row.reference,
              date: formatDay(locale, row.createdAt, { year: false }),
              amount: formatSignedPts(locale, row.pts),
              amountTone:
                row.kind === "pending" ? "text-[var(--color-warning-strong)]" : row.pts > 0 ? "text-[var(--color-success)]" : row.kind === "clawed" ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]",
              worth: formatWorth(locale, row.value),
              status: h.kind[row.kind],
              detail:
                row.kind === "pending" && row.availableAt
                  ? fill(h.availableOn, { date: formatDay(locale, row.availableAt, { year: false }) })
                  : expiry && row.expiresAt && row.kind === "earned"
                    ? fill(h.expiresOn, { date: formatDay(locale, row.expiresAt) })
                    : "—",
            };
          })
        : (page.rows as BalanceHistoryRow[]).map((row) => {
            const tone = BALANCE_KIND_TONE[row.kind];
            return {
              id: row.id,
              icon: sourceIcon(row.source),
              ...tone,
              title: balanceRowTitle(m, row),
              reference: row.reference,
              date: formatDay(locale, row.createdAt, { year: false }),
              amount: formatSignedAmount(locale, row.amount),
              amountTone: isPositiveAmount(row.amount.amount) ? "text-[var(--color-success)]" : "text-[var(--color-ink)]",
              worth: null,
              status: h.balanceKind[row.kind],
              detail: "—",
            };
          });

  const head = [t.col.date, t.col.source, t.col.order, isPoints ? t.col.points : t.col.amount, isPoints ? t.col.value : "", t.col.status, isPoints ? t.col.expiry : t.col.details];
  const columns = "lg:grid-cols-[90px_minmax(0,2fr)_110px_90px_100px_110px_minmax(0,1.3fr)]";
  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-bold transition-colors ${
      active ? "bg-[var(--color-brand-500)] text-[var(--color-on-primary)]" : "bg-[var(--color-chip)] text-[var(--color-ink-muted)]"
    }`;

  return (
    <>
      <nav aria-label={t.tabs.history} className="flex gap-5 border-b border-[var(--color-line)]">
        {(["points", "balance"] as const).map((key) => (
          <Link
            key={key}
            href={href({ bucket: key })}
            scroll={false}
            aria-current={bucket === key ? "page" : undefined}
            className={`px-0.5 py-2 text-body-l font-bold ${bucket === key ? "text-[var(--color-brand-500)] shadow-[inset_0_-2px_0_var(--color-brand-500)]" : "text-[var(--color-ink-muted)]"}`}
          >
            {key === "points" ? t.historyPoints : t.historyBalance}
          </Link>
        ))}
      </nav>

      {isPoints ? (
        <nav aria-label={t.historyPoints} className="flex flex-wrap gap-1.5">
          <Link href={href({ bucket })} scroll={false} aria-current={status === null ? "page" : undefined} className={chip(status === null)}>
            {h.all}
          </Link>
          {filters.map((key) => (
            <Link key={key} href={href({ bucket, status: key })} scroll={false} aria-current={status === key ? "page" : undefined} className={chip(status === key)}>
              {h.kind[key]}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="overflow-hidden rounded-[16px] bg-[var(--color-surface-raised)] shadow-[0_0_12px_rgba(0,0,0,0.07)]">
        {rows === null || rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-body-s font-semibold text-[var(--color-ink-subtle)]">{rows === null ? m.loyalty.panel.unavailable : h.empty}</p>
        ) : (
          <>
            {/* From lg: the table. */}
            <div role="table" className="hidden lg:block">
              <div role="row" className={`grid gap-3 bg-[var(--color-chip)] px-5 py-3 text-caption font-bold text-[var(--color-ink-muted)] ${columns}`}>
                {head.map((cell, index) => (
                  <span key={index} role="columnheader">
                    {cell}
                  </span>
                ))}
              </div>
              {rows.map((row) => (
                <div key={row.id} role="row" className={`grid items-center gap-3 border-t border-[var(--color-line)] px-5 py-3.5 text-body-s ${columns}`}>
                  <span role="cell" className="font-semibold text-[var(--color-ink-muted)]">
                    {row.date}
                  </span>
                  <span role="cell" className="flex min-w-0 items-center gap-2.5">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${row.wash}`}>
                      <Glyph src={row.icon} tone={`bg-current ${row.ink}`} className="size-4" />
                    </span>
                    <span className="font-bold">{row.title}</span>
                  </span>
                  <span role="cell" dir="ltr" className="text-start font-semibold text-[var(--color-brand-500)]">
                    {row.reference ?? "—"}
                  </span>
                  <span role="cell" dir="ltr" className={`text-start font-extrabold ${row.amountTone}`}>
                    {row.amount}
                  </span>
                  <span role="cell" className="font-semibold text-[var(--color-ink-muted)]">
                    {row.worth ?? ""}
                  </span>
                  <span role="cell">
                    <Pill tone={`${row.wash} ${row.ink}`} className="text-caption">
                      {row.status}
                    </Pill>
                  </span>
                  <span role="cell" className="text-caption font-semibold text-[var(--color-ink-muted)]">
                    {row.detail}
                  </span>
                </div>
              ))}
            </div>

            {/* Below lg: the list. */}
            <ul className="lg:hidden">
              {rows.map((row, index) => {
                const reference = referenceLabel(m, row.reference);
                return (
                  <li key={row.id} className={`flex items-start gap-2.5 px-3.5 py-3 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${row.wash}`}>
                      <Glyph src={row.icon} tone={`bg-current ${row.ink}`} className="size-[18px]" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-body-s font-bold">{row.title}</span>
                      <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">
                        {row.date}
                        {reference ? (
                          <>
                            {" · "}
                            <bdi>{reference}</bdi>
                          </>
                        ) : null}
                      </span>
                      {row.detail !== "—" ? <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{row.detail}</span> : null}
                      <Pill tone={`${row.wash} ${row.ink}`} className="self-start">
                        {row.status}
                      </Pill>
                    </span>
                    <span className="flex flex-col items-end">
                      <span dir="ltr" className={`text-body-s font-extrabold ${row.amountTone}`}>
                        {row.amount}
                      </span>
                      {row.worth ? <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{row.worth}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {page?.nextCursor ? (
        <Link href={href({ bucket, status, cursor: page.nextCursor })} scroll={false} className="self-center p-1 text-body-s font-bold text-[var(--color-brand-500)]">
          {h.more}
        </Link>
      ) : null}
    </>
  );
}
