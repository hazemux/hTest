"use client";

import Link from "next/link";
import { useState } from "react";

import { daysUntil, fill, formatAmount, formatPts } from "@/lib/loyalty/format";
import type { PerkOffer } from "@/lib/loyalty/types";

import { perkIcon } from "../art";
import { usePointsValue } from "../usePointsValue";
import { Card, ChipButton, Glyph, Ring } from "../parts";
import type { MemberViewContext, PerkOutcome } from "./types";

/** The calculator moves a thousand points (one dollar) at a press, as drawn. */
const CALC_STEP = 1000;

/**
 * «استبدل نقاطك»: how redemption works, a calculator of what the points are
 * worth, and — behind `features.perks` — the perks points can buy.
 *
 * The calculator only ANSWERS A QUESTION («what is 10,000 points worth?»); it
 * spends nothing. Its answer is the SERVER's (`GET /loyalty/points-value`,
 * through our cached route, debounced) — the page multiplies nothing. Spending
 * happens at checkout, where the server applies the cap and the minimum.
 */
export function RedeemView({ locale, m, program, wallet, links, lists, failed, now, onRedeemPerk }: MemberViewContext & { onRedeemPerk?: (code: string) => Promise<PerkOutcome> }) {
  const t = m.loyalty.redeem;
  const available = lists.perks?.availablePts ?? wallet.points.available;
  const min = program.minRedeem;
  const max = Math.floor(available / CALC_STEP) * CALC_STEP;
  const canCalc = max >= min && max > 0;
  const [picked, setPicked] = useState(() => Math.min(max, Math.max(min, 10_000)));
  const value = Math.min(max, Math.max(min, picked));
  const worth = usePointsValue(locale, canCalc ? value : null);
  const perks = program.features.perks ? (lists.perks?.perks ?? program.perks) : [];

  const chips = [
    { key: "min", label: t.minimum, value: min },
    ...(max > 10_000 ? [{ key: "10k", label: formatPts(locale, 10_000), value: 10_000 }] : []),
    { key: "all", label: t.allMine, value: max },
  ];

  return (
    <>
      <Card className="gap-2.5">
        <h3 className="text-body-l font-bold">{t.howTitle}</h3>
        <ol className="flex flex-col gap-2.5">
          {[t.how1, t.how2, t.how3].map((text, index) => (
            <li key={text} className="flex items-start gap-2.5 text-body-s font-medium leading-[1.5] text-[var(--color-ink-muted)]">
              <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[var(--color-brand-wash)] text-caption font-extrabold text-[var(--color-brand-500)]">
                {index + 1}
              </span>
              <span className="flex-1 [text-wrap:pretty]">{text}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-body-l font-bold">{t.calcTitle}</h3>
          <span className="text-caption font-semibold text-[var(--color-ink-muted)]">{fill(t.calcAvail, { pts: formatPts(locale, available) })}</span>
        </div>
        {canCalc ? (
          <>
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--color-input-border)] bg-[var(--color-field)] p-2">
              <StepButton label={t.less} disabled={value <= min} onClick={() => setPicked(Math.max(min, value - CALC_STEP))}>
                −
              </StepButton>
              <output aria-live="polite" className="flex flex-1 flex-col items-center">
                <span dir="ltr" className="text-[26px] font-extrabold leading-[1.2] tabular-nums text-[var(--color-ink)]">
                  {formatPts(locale, value)}
                </span>
                {/* The server's figure for THIS number — dimmed while the
                    next answer is on its way, never a stale figure beside a
                    new number. */}
                <span
                  data-settling={worth.settling ? "" : undefined}
                  className={`text-caption font-bold text-[var(--color-success)] transition-opacity ${worth.settling ? "opacity-35" : ""}`}
                >
                  {worth.value ? fill(t.calcOff, { amount: `≈ ${formatAmount(locale, worth.value)}` }) : worth.failed ? t.calcUnavailable : " "}
                </span>
              </output>
              <StepButton label={t.more} disabled={value >= max} onClick={() => setPicked(Math.min(max, value + CALC_STEP))}>
                +
              </StepButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <ChipButton key={chip.key} active={value === chip.value} onClick={() => setPicked(chip.value)}>
                  {chip.label}
                </ChipButton>
              ))}
            </div>
          </>
        ) : (
          <p className="rounded-[12px] bg-[var(--color-chip)] px-3 py-2.5 text-caption font-bold text-[var(--color-ink-muted)]">
            {fill(t.calcBelowMin, { min: formatPts(locale, min) })}
          </p>
        )}
        <p className="text-caption font-medium leading-[1.5] text-[var(--color-ink-subtle)]">
          {fill(t.calcRule, { min: formatPts(locale, min), pct: program.maxSharePct })}
        </p>
        {links.checkout ? (
          <Link
            href={links.checkout}
            className="flex h-12 items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-bold text-[var(--color-on-primary)]"
          >
            {t.calcCta}
          </Link>
        ) : null}
      </Card>

      {perks.length > 0 ? (
        <>
          <h3 className="px-1 pt-1 text-body-l font-bold">{t.perksTitle}</h3>
          {failed.has("perks") ? <p className="px-1 text-caption font-semibold text-[var(--color-ink-subtle)]">{m.loyalty.panel.unavailable}</p> : null}
          <ul className="flex flex-col gap-3">
            {perks.map((perk) => (
              <li key={perk.code}>
                {/* Redeemable only once THIS customer's perks are in — the
                    public programme cannot say what they already hold. */}
                <PerkRow perk={perk} available={available} ctx={{ locale, m, now, links, onRedeemPerk: lists.perks ? onRedeemPerk : undefined }} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-[10px] bg-[var(--color-surface-raised)] text-[24px] font-bold text-[var(--color-brand-500)] disabled:opacity-40"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}

function PerkRow({
  perk,
  available,
  ctx,
}: {
  perk: PerkOffer;
  available: number;
  ctx: Pick<MemberViewContext, "locale" | "m" | "now" | "links"> & { onRedeemPerk?: (code: string) => Promise<PerkOutcome> };
}) {
  const { locale, m, now, links, onRedeemPerk } = ctx;
  const t = m.loyalty.redeem;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PerkOutcome | null>(null);
  // How many the customer can get is the SERVER's count (`can_get`): what
  // their points buy AND what this month's cap leaves — never worked out here
  // from the balance alone, which would offer 6 of a once-a-month perk. Null
  // until `/me/perks` is in: then no count and no button.
  const canGet = perk.canGet;
  const usedThisMonth = perk.remainingThisMonth === 0;
  // Points, not money: how far along the balance is towards the price.
  const pct = perk.pricePts > 0 ? Math.min(99, Math.round((available / perk.pricePts) * 100)) : 0;
  const active = perk.active || outcome === "redeemed";

  async function redeem() {
    if (!onRedeemPerk || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await onRedeemPerk(perk.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--color-surface-raised)] px-4 py-3.5 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-brand-wash)]">
          <Glyph src={perkIcon(perk.code)} tone="bg-[var(--color-brand-500)]" className="size-[22px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body-s font-bold">{perk.name}</span>
          {perk.description ? <span className="text-caption font-medium text-[var(--color-ink-muted)]">{perk.description}</span> : null}
          <span className="text-caption font-extrabold text-[var(--color-brand-500)]">
            {fill(m.loyalty.ptsAmount, { pts: formatPts(locale, perk.pricePts) })}
            {perk.priceValue ? <span className="ms-1 font-semibold text-[var(--color-ink-subtle)]">{`≈ ${formatAmount(locale, perk.priceValue)}`}</span> : null}
          </span>
        </div>
        <div className="flex min-w-[72px] shrink-0 flex-col items-center gap-1 text-center">
          {active ? (
            <>
              <span className="rounded-full bg-[var(--color-success-wash)] px-2.5 py-1 text-caption font-extrabold text-[var(--color-success)]">{t.activeChip}</span>
              {perk.endsAt ? <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{fill(t.endsIn, { days: daysUntil(perk.endsAt, now) })}</span> : null}
            </>
          ) : usedThisMonth ? (
            <span className="rounded-full bg-[var(--color-surface-subtle)] px-2.5 py-1 text-caption font-extrabold text-[var(--color-ink-muted)]">{t.usedThisMonth}</span>
          ) : canGet !== null && canGet >= 1 ? (
            onRedeemPerk ? (
              <>
                <button
                  type="button"
                  onClick={redeem}
                  disabled={busy}
                  aria-busy={busy || undefined}
                  className="flex h-[34px] items-center rounded-[10px] bg-[var(--color-brand-500)] px-3.5 text-caption font-bold text-[var(--color-on-primary)] disabled:opacity-60"
                >
                  {busy ? m.common.loading : t.redeemBtn}
                </button>
                <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{fill(t.canBuy, { count: canGet })}</span>
              </>
            ) : null
          ) : canGet === null && available >= perk.pricePts ? null : (
            <>
              <Ring pct={pct}>
                <span className="text-caption-xs font-extrabold">{pct}%</span>
              </Ring>
              <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{fill(t.toGo, { pts: formatPts(locale, perk.pricePts - available) })}</span>
            </>
          )}
        </div>
      </div>
      {outcome && outcome !== "redeemed" ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--color-warning-wash)] px-3 py-2 text-caption font-bold text-[var(--color-warning-strong)]">
          <span className="flex-1">{t.outcome[outcome]}</span>
          {outcome === "step_up" && links.verify ? (
            <Link href={links.verify} className="text-[var(--color-brand-500)]">
              {m.account.stepUpAction}
            </Link>
          ) : null}
        </p>
      ) : null}
      {outcome === "redeemed" ? (
        <p role="status" className="text-caption font-bold text-[var(--color-success)]">
          {t.outcome.redeemed}
        </p>
      ) : null}
    </div>
  );
}
