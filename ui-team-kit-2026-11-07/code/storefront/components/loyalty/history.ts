import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import { fill, formatDay } from "@/lib/loyalty/format";
import type { BalanceHistoryRow, PointsHistoryRow } from "@/lib/loyalty/types";

/**
 * The words for a ledger row — shared by the panel's history and the wallet's
 * table so the two can never name the same row differently. The API names a
 * row by its `source` (`title_key` is `wallet.tx.<source>`); a source the
 * dictionary does not know yet reads as the generic «حركة نقاط», never as the
 * raw ledger code. A staff adjustment carries its own reason — the only free
 * text the server sends — shown after the label.
 */

export function pointsSourceLabel(m: Messages, source: string): string {
  const labels = m.loyalty.history.source as Record<string, string>;
  return Object.hasOwn(labels, source) ? (labels[source] as string) : labels.other ?? source;
}

export function balanceSourceLabel(m: Messages, source: string): string {
  const labels = m.loyalty.history.balanceSource as Record<string, string>;
  return Object.hasOwn(labels, source) ? (labels[source] as string) : labels.other ?? source;
}

/** «مشتريات» / «تعديل من فريق الدعم · تعويض». */
export function pointsRowTitle(m: Messages, row: PointsHistoryRow): string {
  const label = pointsSourceLabel(m, row.source);
  return row.reason ? `${label} · ${row.reason}` : label;
}

export function balanceRowTitle(m: Messages, row: BalanceHistoryRow): string {
  const label = balanceSourceLabel(m, row.source);
  return row.reason ? `${label} · ${row.reason}` : label;
}

/** «طلب CQ-100482» — the row's reference as the customer reads it. */
export function referenceLabel(m: Messages, reference: string | null): string | null {
  if (!reference) return null;
  return reference.startsWith("CQ-") ? fill(m.loyalty.history.order, { ref: reference }) : reference;
}

/** «متاحة 9 أكتوبر» / «تنتهي 30 سبتمبر 2028» — when the row's points move next. */
export function pointsRowWhen(m: Messages, locale: Locale, row: PointsHistoryRow, { expiry }: { expiry: boolean }): string | null {
  if (row.kind === "pending" && row.availableAt) return fill(m.loyalty.history.availableOn, { date: formatDay(locale, row.availableAt, { year: false }) });
  if (expiry && row.kind === "earned" && row.expiresAt) return fill(m.loyalty.history.expiresOn, { date: formatDay(locale, row.expiresAt) });
  return null;
}
