"use client";

import Link from "next/link";
import { useId } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { fill, formatPts, isNonZeroAmount, pointsUnit } from "@/lib/loyalty/format";
import { trimFactor } from "@/lib/loyalty/map";
import type { CheckoutLoyaltyQuote } from "@/lib/loyalty/types";

import { Coin, Glyph } from "./parts";

export type CheckoutLoyaltyProps = {
  locale: Locale;
  /** The latest preview's loyalty answer, and the currency its figures are in. */
  quote: CheckoutLoyaltyQuote | null;
  currency: string;
  /**
   * The server has not yet priced the CURRENT choices (a slider move waiting
   * out its debounce, or a preview in flight): every money figure here is the
   * previous answer's, so it is dimmed — and the page's Pay button is locked.
   */
  settling: boolean;
  /** The customer's spendable points (`GET /wallet`), for the switch's sub-line. */
  pointsAvailable: number;
  program: { minRedeem: number; maxSharePct: number; topUp: boolean };
  useBalance: boolean;
  /** What the customer CHOSE (0 = points off) — shown at once; the server's applied figure prices it. */
  pointsToRedeem: number;
  onUseBalanceChange: (next: boolean) => void;
  /** Always a multiple of the step within the server's bounds, or 0. */
  onPointsChange: (next: number) => void;
  topUpHref?: string | null;
  /** The top-up bonus in % (the programme's string), for the «اشحن رصيدك» note. */
  topUpBonusPct?: string | null;
};

/** Snap a slider value onto the server's bounds and step — integers of display points only. */
export function snapPoints(value: number, min: number, max: number, step: number): number {
  if (max < min || max <= 0) return 0;
  const safeStep = step > 0 ? step : 1;
  const clamped = Math.min(max, Math.max(min, Math.round(value)));
  const snapped = min + Math.floor((clamped - min) / safeStep) * safeStep;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * «رصيدك ونقاطك» at checkout (Claude Design `CheckoutPoints`): two
 * independent switches — Charger Balance and Charger Points — and, with
 * points on, a slider in the server's steps between its minimum and maximum.
 *
 * CONTROLLED, AND IT COMPUTES NO MONEY (HANDBOOK §1). The points the customer
 * picks show at once (an integer); what they are worth, what the balance
 * covers and what is left for the card are the latest `POST /orders/preview`
 * answer for exactly these choices, which the page asks for (debounced) and
 * passes back as `quote`. Until it is in, `settling` dims those figures and
 * the page keeps Pay locked. The slider's bounds are the preview's too
 * (`redemption`), so the cap and the minimum are the server's.
 */
export function CheckoutLoyaltyControls(props: CheckoutLoyaltyProps) {
  const { locale, quote, currency, settling, program, useBalance, pointsToRedeem, onUseBalanceChange, onPointsChange, topUpHref } = props;
  const m = messagesFor(locale);
  const t = m.loyalty.checkout;
  const sliderId = useId();
  if (!quote?.redemption) return null;

  const bounds = quote.redemption;
  const canUsePoints = bounds.maxPts >= bounds.minPts && bounds.maxPts > 0;
  const pointsOn = pointsToRedeem > 0;
  const minLabel = formatPts(locale, bounds.minPts);
  const money = (amount: string | null) => (amount ? formatMoney(locale, amount, currency) : null);
  const balanceText = money(quote.balanceAvailable);
  const canUseBalance = quote.balanceAvailable !== null && isNonZeroAmount(quote.balanceAvailable);
  const canTopUp = program.topUp && Boolean(topUpHref) && Boolean(props.topUpBonusPct);
  const dim = settling ? "opacity-35" : "";
  const warnings = new Set(quote.warnings);
  const pointsValue = money(quote.pointsValue);
  const balanceUsed = money(quote.balanceUsed);

  let pointsNote: { text: string; tone: string } | null = null;
  if (bounds.availablePts <= 0) {
    pointsNote = quote.pointsEarnedPts
      ? { text: fill(t.noteEmpty, { pts: formatPts(locale, quote.pointsEarnedPts) }), tone: "bg-[var(--color-chip)] text-[var(--color-ink-muted)]" }
      : null;
  } else if (warnings.has("order_too_small")) {
    pointsNote = { text: fill(t.noteTooSmall, { pct: program.maxSharePct, min: minLabel }), tone: "bg-[var(--color-chip)] text-[var(--color-ink-muted)]" };
  } else if (warnings.has("below_min") || bounds.availablePts < bounds.minPts) {
    pointsNote = {
      // Integers of points, not money: how many more reach the minimum.
      text: fill(t.noteBelowMin, { have: formatPts(locale, bounds.availablePts), missing: formatPts(locale, Math.max(0, bounds.minPts - bounds.availablePts)), min: minLabel }),
      tone: "bg-[var(--color-warning-wash)] text-[var(--color-warning-strong)]",
    };
  } else if (warnings.has("cap_reached") && pointsOn) {
    pointsNote = { text: fill(t.noteCap, { pct: program.maxSharePct }), tone: "bg-[var(--color-brand-wash)] text-[var(--color-brand-500)]" };
  }

  let balanceNote: { text: string; tone: string; topUp: boolean } | null = null;
  if (!canUseBalance) {
    balanceNote = canTopUp ? { text: fill(t.balanceTopUpNote, { pct: trimFactor(props.topUpBonusPct ?? "") }), tone: "bg-[var(--color-chip)] text-[var(--color-ink-muted)]", topUp: true } : null;
  } else if (useBalance && balanceUsed && warnings.has("insufficient_balance")) {
    balanceNote = { text: fill(t.balanceShort, { amount: balanceUsed }), tone: "bg-[var(--color-success-wash)] text-[var(--color-success)]", topUp: canTopUp };
  } else if (useBalance && balanceUsed) {
    balanceNote = { text: fill(t.balanceUsed, { amount: balanceUsed }), tone: "bg-[var(--color-success-wash)] text-[var(--color-success)]", topUp: false };
  }

  return (
    <section aria-label={t.title} data-settling={settling ? "" : undefined} className="flex flex-col gap-3">
      {canUseBalance || canTopUp ? (
        <div className={`flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] ${canUseBalance ? "" : "opacity-60"}`}>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--color-surface-subtle)]">
              <Glyph src="/brand/icon-wallet.svg" tone="bg-[var(--color-ink)]" className="size-[22px]" />
            </span>
            <SwitchLabel title={t.useBalance} sub={canUseBalance && balanceText ? fill(t.balanceSub, { amount: balanceText }) : t.balanceNone} />
            <Switch label={t.useBalance} checked={canUseBalance && useBalance} disabled={!canUseBalance} onChange={onUseBalanceChange} />
          </div>
          {balanceNote ? (
            <p className={`flex items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 text-caption font-bold transition-opacity ${balanceNote.tone} ${dim}`}>
              <span>{balanceNote.text}</span>
              {balanceNote.topUp && topUpHref ? (
                <Link href={topUpHref} className="whitespace-nowrap text-[var(--color-brand-500)]">
                  {t.topUp}
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex flex-col gap-3 rounded-[16px] border bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] ${
          pointsOn ? "border-[var(--color-brand-500)]" : "border-transparent"
        }`}
      >
        <div className={`flex items-center gap-3 ${canUsePoints ? "" : "opacity-60"}`}>
          <Coin size={40} />
          <SwitchLabel title={t.usePoints} sub={props.pointsAvailable > 0 ? fill(t.pointsSub, { pts: formatPts(locale, props.pointsAvailable) }) : t.pointsNone} />
          <Switch label={t.usePoints} checked={pointsOn} disabled={!canUsePoints} onChange={(next) => onPointsChange(next ? bounds.maxPts : 0)} />
        </div>

        {pointsOn && canUsePoints ? (
          <div className="flex flex-col gap-2 rounded-[12px] bg-[var(--color-primary-wash-lighter)] p-3.5">
            <output htmlFor={sliderId} aria-live="polite" className="flex items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-1.5">
                <b dir="ltr" data-points-chosen className="text-[26px] font-extrabold text-[var(--color-brand-500)]">
                  {formatPts(locale, pointsToRedeem)}
                </b>
                <span className="text-body-s font-bold text-[var(--color-ink-muted)]">{pointsUnit(locale, pointsToRedeem)}</span>
              </span>
              {/* The SERVER's discount for the points it applied — dimmed while
                  the answer for the new number is on its way. */}
              <span dir="ltr" data-points-value className={`text-body-l font-extrabold text-[var(--color-success)] transition-opacity ${dim}`}>
                {pointsValue ? `−${pointsValue}` : ""}
              </span>
            </output>
            <input
              id={sliderId}
              type="range"
              min={bounds.minPts}
              max={bounds.maxPts}
              step={bounds.stepPts}
              value={Math.min(bounds.maxPts, Math.max(bounds.minPts, pointsToRedeem))}
              aria-label={t.usePoints}
              aria-valuetext={fill(t.sliderValue, { pts: formatPts(locale, pointsToRedeem) })}
              onChange={(event) => onPointsChange(snapPoints(Number(event.currentTarget.value), bounds.minPts, bounds.maxPts, bounds.stepPts))}
              className="w-full accent-[var(--color-brand-500)]"
            />
            <div className="flex justify-between text-caption-xs font-bold text-[var(--color-ink-subtle)]">
              <span dir="ltr">{minLabel}</span>
              <span>{fill(bounds.maxPts < bounds.availablePts ? t.maxCap : t.maxAll, { pts: formatPts(locale, bounds.maxPts), pct: program.maxSharePct })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPointsChange(bounds.minPts)}
                className="rounded-full bg-[var(--color-surface-raised)] px-3 py-1.5 text-caption font-bold shadow-[inset_0_0_0_1px_var(--color-line)]"
              >
                {t.minimum}
              </button>
              <button
                type="button"
                onClick={() => onPointsChange(bounds.maxPts)}
                className="rounded-full bg-[var(--color-brand-500)] px-3 py-1.5 text-caption font-bold text-[var(--color-on-primary)]"
              >
                {t.useMax}
              </button>
            </div>
          </div>
        ) : null}

        {pointsNote ? (
          <p role="status" className={`flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-caption font-bold leading-[1.5] ${pointsNote.tone}`}>
            <Glyph src="/brand/icon-info-circle.svg" className="mt-px size-4" />
            <span>{pointsNote.text}</span>
          </p>
        ) : null}
        <p className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{fill(t.rules, { min: minLabel, pct: program.maxSharePct })}</p>
      </div>
    </section>
  );
}

function SwitchLabel({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-body-l font-bold">{title}</span>
      <span className="text-caption font-semibold text-[var(--color-ink-muted)]">{sub}</span>
    </span>
  );
}

/** A switch the design draws (46×26, the toggle gradient when on). The knob slides by CSS. */
function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full disabled:cursor-not-allowed ${checked ? "bg-[image:var(--gradient-toggle-active)]" : "bg-[var(--color-border-strong)]"}`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] size-5 rounded-full bg-[var(--color-on-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[inset-inline-start] duration-150 ${checked ? "start-[23px]" : "start-[3px]"}`}
      />
    </button>
  );
}
