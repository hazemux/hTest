import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatAmount, formatPts, formatWorth } from "@/lib/loyalty/format";
import type { TopUpView } from "@/lib/loyalty/types";

import { Glyph } from "../parts";

/** The four looks of a top-up that is past the transfer step. */
export type TopUpOutcome = "review" | "success" | "failed";

const LOOK: Record<TopUpOutcome, { wash: string; ink: string; icon: string }> = {
  review: { wash: "bg-[var(--color-warning-wash)]", ink: "bg-[var(--color-warning-strong)]", icon: "/brand/icon-shield-tick.svg" },
  success: { wash: "bg-[var(--color-success-wash)]", ink: "bg-[var(--color-success)]", icon: "/brand/icon-tick-circle.svg" },
  failed: { wash: "bg-[var(--color-error-wash)]", ink: "bg-[var(--color-danger)]", icon: "/brand/icon-order-failed.svg" },
};

/** Which look a top-up's SERVER status takes. `awaiting_transfer` has none: it is the transfer step. */
export function topUpOutcome(status: TopUpView["status"]): TopUpOutcome | null {
  switch (status) {
    case "proof_submitted":
    case "under_review":
      return "review";
    case "approved":
      return "success";
    case "rejected":
    case "expired":
    case "cancelled":
      return "failed";
    default:
      return null;
  }
}

/**
 * Where a top-up stands (Claude Design `WalletHub` result states). The status
 * is the SERVER's (`GET /wallet/topups/{id}`): «review» is the honest state
 * after a receipt — the money is not in the balance until staff matched the
 * transfer — and «success» is drawn only once the API says approved. The
 * amount shown is what was RECEIVED once staff recorded it, and the bonus is
 * the server's (an estimate until approval, and said so).
 */
export function TopUpResult({
  locale,
  topUp,
  pendingHoldHours,
  ctaHref,
  refreshHref,
  children,
}: {
  locale: Locale;
  topUp: TopUpView;
  pendingHoldHours: number;
  /** Where the button goes: the wallet (review), the store (success), a new top-up (failed). */
  ctaHref: string | null;
  /** The page again, to see whether staff have decided — under review only. */
  refreshHref: string | null;
  children?: React.ReactNode;
}) {
  const t = messagesFor(locale).loyalty.wallet.topup;
  const outcome = topUpOutcome(topUp.status) ?? "review";
  const copy = t[outcome];
  const look = LOOK[outcome];
  const amount = topUp.received ?? topUp.amount;
  const bonus =
    outcome !== "failed" && topUp.bonusPts > 0
      ? `+${formatPts(locale, topUp.bonusPts)} (${formatWorth(locale, topUp.bonusValue)})${topUp.bonusIsEstimate ? ` · ${t.estimate}` : ""}`
      : "—";
  const body = outcome === "failed" ? t.failedBody[topUp.status as "rejected" | "expired" | "cancelled"] ?? copy.body : copy.body;

  return (
    <section
      role={outcome === "failed" ? "alert" : "status"}
      data-outcome={outcome}
      className="flex w-full max-w-[520px] flex-col items-center gap-3 self-center rounded-[16px] bg-[var(--color-surface-raised)] px-6 py-8 text-center shadow-[0_0_12px_rgba(0,0,0,0.07)]"
    >
      <span className={`grid size-[72px] place-items-center rounded-full ${look.wash}`}>
        <Glyph src={look.icon} tone={look.ink} className="size-[34px]" />
      </span>
      <h2 className="text-heading-l font-extrabold">{copy.title}</h2>
      <p className="text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)] [text-wrap:pretty]">{fill(body, { hours: pendingHoldHours })}</p>
      {topUp.rejectionReason ? (
        <p dir="auto" className="text-body-s font-semibold text-[var(--color-danger)]">
          {fill(t.rejectionReason, { reason: topUp.rejectionReason })}
        </p>
      ) : null}
      <dl className="flex w-full flex-col gap-1.5 rounded-[12px] bg-[var(--color-chip)] p-3 text-body-s font-bold">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-muted)]">{t.resultReference}</dt>
          <dd dir="ltr">{topUp.reference}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-muted)]">{topUp.received ? t.resultReceived : t.resultAmount}</dt>
          <dd dir="ltr">{formatAmount(locale, amount)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--color-ink-muted)]">{t.resultBonus}</dt>
          <dd dir="ltr">{bonus}</dd>
        </div>
      </dl>
      {children}
      {refreshHref ? (
        <Link href={refreshHref} className="text-body-s font-bold text-[var(--color-brand-500)]">
          {t.refresh}
        </Link>
      ) : null}
      {ctaHref ? (
        <Link href={ctaHref} className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold text-[var(--color-on-primary)]">
          {copy.cta}
        </Link>
      ) : null}
    </section>
  );
}
