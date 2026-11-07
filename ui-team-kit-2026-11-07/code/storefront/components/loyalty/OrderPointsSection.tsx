import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatAmount, formatDay, formatPts, formatWorth } from "@/lib/loyalty/format";
import type { OrderPoints, OrderPointsLine } from "@/lib/loyalty/types";

import { Coin } from "./parts";

/**
 * «نقاط تشارجر» on an order's page (Claude Design «Loyalty Storefront»): a
 * row per movement, each with a coloured dot — points spent, Charger Balance
 * used, points earned (pending until the hold after delivery, then available)
 * and points taken back after a refund — and one line saying how the earn was
 * computed. Every figure is the order's own record from the API (`loyalty`),
 * in the ORDER's currency at its frozen rate; nothing here is recomputed.
 *
 * SIGNS ARE THE MOVEMENT'S, NOT ARITHMETIC: spending and a refund's clawback
 * take points away (−), an earn adds them (+). A reversed earn is drawn as
 * the earn (struck) beside the clawback, so «+90» and «−90» are never read as
 * one figure (review finding, 2026-10-08).
 *
 * An order with no loyalty movement renders nothing (HANDBOOK §5).
 */
export function OrderPointsSection({ locale, points }: { locale: Locale; points: OrderPoints | null }) {
  const t = messagesFor(locale).loyalty.order;
  if (!points || (points.lines.length === 0 && !points.feeWaived)) return null;

  const row = (line: OrderPointsLine) => {
    switch (line.kind) {
      case "spent":
        return { dot: "bg-[var(--color-brand-500)]", label: t.spent, sub: null, value: `−${formatPts(locale, line.pts)}`, worth: line.value ? `−${formatAmount(locale, line.value)}` : null, tone: "text-[var(--color-ink)]", struck: false };
      case "balance":
        return { dot: "bg-[var(--color-ink-muted)]", label: t.balance, sub: null, value: `−${formatAmount(locale, line.amount)}`, worth: null, tone: "text-[var(--color-ink)]", struck: false };
      case "earned": {
        const reversed = line.status === "reversed";
        return {
          dot: reversed ? "bg-[var(--color-ink-subtle)]" : line.status === "pending" ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)]",
          label: line.status === "pending" ? t.earnedPending : reversed ? t.earnedWas : t.earnedAvailable,
          sub: line.status === "pending" && line.availableAt ? fill(t.availableOn, { date: formatDay(locale, line.availableAt, { year: false }) }) : null,
          value: `+${formatPts(locale, line.pts)}`,
          worth: line.value ? formatWorth(locale, line.value) : null,
          tone: reversed ? "text-[var(--color-ink-subtle)]" : line.status === "pending" ? "text-[var(--color-warning-strong)]" : "text-[var(--color-success)]",
          struck: reversed,
        };
      }
      case "reversed":
        return { dot: "bg-[var(--color-danger)]", label: t.earnedReversed, sub: null, value: `−${formatPts(locale, line.pts)}`, worth: null, tone: "text-[var(--color-danger)]", struck: false };
    }
  };

  const how = points.basis ? fill(t.how, { rate: points.basis.rate, base: formatAmount(locale, points.basis.cashGoods) }) : null;

  return (
    <section className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
      <h2 className="flex items-center gap-2 text-body-l font-bold lg:text-heading-m">
        <Coin size={24} />
        {t.title}
      </h2>
      <ul className="flex flex-col">
        {points.lines.map((line, index) => {
          const r = row(line);
          return (
            <li key={`${line.kind}-${index}`} data-line={line.kind} className={`flex items-start gap-2.5 py-2.5 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
              <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${r.dot}`} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-s font-semibold">{r.label}</span>
                {r.sub ? <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{r.sub}</span> : null}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span dir="ltr" data-value className={`text-body-s font-extrabold ${r.tone} ${r.struck ? "line-through" : ""}`}>
                  {r.value}
                </span>
                {r.worth ? <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{r.worth}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {points.feeWaived ? <p className="text-caption font-semibold text-[var(--color-success)]">{t.feeWaived}</p> : null}
      {how ? <p className="rounded-[12px] bg-[var(--color-field)] px-3 py-2.5 text-caption font-medium text-[var(--color-ink-muted)]">{how}</p> : null}
    </section>
  );
}
