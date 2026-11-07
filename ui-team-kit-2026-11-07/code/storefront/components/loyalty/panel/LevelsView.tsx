"use client";

import { daysUntil, fill, formatAmount, formatDay, tierProgressPct } from "@/lib/loyalty/format";

import { Card, Glyph, ProgressBar, Ring, TierMark } from "../parts";
import type { MemberViewContext } from "./types";

/**
 * «المستويات» — the rolling-12-month ladder (ADR 0043 §6): the spend that
 * decides it, a vertical timeline with EVERY level's benefits in view (owner
 * 2026-10-10: customers should see what the higher levels unlock without
 * tapping), and the grace warning while a level is at risk.
 *
 * The customer's own figures (spend, what is left, what keeps the level) are
 * the server's, in their currency; so is each level's threshold (the
 * programme's `min_spend`, v0.1.107 — its USD twin only sizes the bar). The
 * earn rate is the first benefit line, drawn here from the level's rate; the
 * server's benefits never repeat it. VIP (ADR 0044) is not drawn as a
 * level here: it has its own page (`/account/vip`) and a badge beside the
 * tier on the home view and the wallet.
 */
export function LevelsView({ locale, m, program, wallet, now }: MemberViewContext) {
  const t = m.loyalty.levels;
  const tier = wallet.tier;
  const currentIndex = tier ? Math.max(0, program.tiers.findIndex((level) => level.code === tier.code)) : -1;
  const fromUsd = program.tiers[currentIndex]?.minSpendUsd ?? "0";
  const pct = tier ? tierProgressPct(tier.spend12mUsd, fromUsd, tier.next?.minSpendUsd ?? null) : 0;
  const lower = tier?.atRisk?.dropToCode ? program.tiers.find((level) => level.code === tier.atRisk?.dropToCode) : undefined;

  return (
    <>
      {tier?.atRisk ? (
        <div role="status" className="flex items-start gap-3 rounded-[16px] bg-[var(--color-error-wash)] px-4 py-3.5">
          <Glyph src="/brand/icon-info-circle.svg" tone="bg-[var(--color-danger)]" className="size-[22px]" />
          <div className="flex flex-1 flex-col gap-0.5">
            <h3 className="text-body-s font-bold">{fill(t.riskTitle, { tier: tier.name, days: daysUntil(tier.atRisk.endsAt, now) })}</h3>
            <p className="text-caption font-medium leading-[1.5] text-[var(--color-ink-muted)]">
              {lower
                ? fill(t.riskSub, {
                    amount: formatAmount(locale, tier.atRisk.keepSpend),
                    date: formatDay(locale, tier.atRisk.endsAt, { year: false }),
                    tier: tier.name,
                    lower: lower.name,
                    rate: lower.rate,
                  })
                : fill(t.riskSubKeep, {
                    amount: formatAmount(locale, tier.atRisk.keepSpend),
                    date: formatDay(locale, tier.atRisk.endsAt, { year: false }),
                    tier: tier.name,
                  })}
            </p>
          </div>
        </div>
      ) : null}

      {tier ? (
        <Card className="gap-1.5">
          <h3 className="text-caption font-bold text-[var(--color-ink-muted)]">{t.spend12}</h3>
          <span dir="ltr" className="text-start text-[28px] font-extrabold leading-[1.2]">
            {formatAmount(locale, tier.spend12m)}
          </span>
          <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)] [text-wrap:pretty]">{fill(t.rollingNote, { days: program.graceDays })}</p>
        </Card>
      ) : null}

      {program.tiers.length > 0 ? (
        <Card>
          <ol className="flex flex-col">
            {program.tiers.map((level, index) => {
              const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
              return (
                <LevelRow
                  key={level.code}
                  last={index === program.tiers.length - 1}
                  state={state}
                  code={level.code}
                  name={fill(t.name, { tier: level.name, level: level.level })}
                  meta={fill(t.meta, { amount: formatAmount(locale, level.minSpend), rate: level.rate })}
                  tag={state === "done" ? t.done : state === "current" ? t.current : t.upcoming}
                  benefits={[fill(t.benefitRate, { rate: level.rate }), ...level.benefits]}
                  progress={
                    state === "current" && tier?.next
                      ? { pct, label: fill(m.loyalty.home.toNext, { amount: formatAmount(locale, tier.next.remaining), tier: tier.next.name }) }
                      : null
                  }
                />
              );
            })}
          </ol>
        </Card>
      ) : null}
    </>
  );
}

function LevelRow({
  last,
  state,
  code,
  name,
  meta,
  tag,
  benefits,
  progress,
}: {
  last: boolean;
  state: "done" | "current" | "upcoming";
  code: string;
  name: string;
  meta: string;
  tag: string;
  benefits: string[];
  progress: { pct: number; label: string } | null;
}) {
  const dim = state === "upcoming" ? "opacity-60" : "";
  const dot =
    state === "done" ? (
      <span className="grid size-10 place-items-center rounded-full bg-[var(--color-success)]">
        <Glyph src="/brand/icon-check-white.svg" tone="bg-[var(--color-on-primary)]" className="size-4" />
      </span>
    ) : state === "current" ? (
      <span className="grid size-10 place-items-center rounded-full bg-[var(--color-surface-raised)]">
        <Ring pct={progress?.pct ?? 100} size={40} radius={16} stroke={3}>
          <Glyph src="/brand/icon-star-rate-filled.svg" tone="bg-[var(--color-brand-500)]" className="size-4" />
        </Ring>
      </span>
    ) : (
      <span className="grid size-10 place-items-center rounded-full bg-[var(--color-surface-subtle)]">
        <Glyph src="/brand/icon-lock.svg" tone="bg-[var(--color-ink-subtle)]" className="size-4" />
      </span>
    );
  const tagTone =
    state === "done"
      ? "bg-[var(--color-success-wash)] text-[var(--color-success)]"
      : state === "current"
        ? "bg-[var(--color-brand-500)] text-[var(--color-on-primary)]"
        : "bg-[var(--color-chip)] text-[var(--color-ink-muted)]";

  return (
    <li className="flex gap-3" aria-current={state === "current" ? "step" : undefined}>
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className={dim}>{dot}</span>
        {last ? null : <span className={`min-h-4 w-0.5 flex-1 ${state === "done" ? "bg-[var(--color-success)]" : "bg-[var(--color-line)]"}`} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pb-4">
        <div className={`flex min-h-10 items-center gap-2 ${dim}`}>
          <TierMark code={code} size={44} dimmed={state === "upcoming"} />
          <span className="flex flex-1 flex-col">
            <span className="text-body-l font-bold">{name}</span>
            <span className="text-caption font-semibold text-[var(--color-ink-muted)]">{meta}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-caption-xs font-extrabold ${tagTone}`}>{tag}</span>
        </div>
        <ul className="flex flex-col gap-1.5 rounded-[12px] bg-[var(--color-field)] px-3 py-2.5">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-caption font-semibold text-[var(--color-ink-muted)]">
              <Glyph src="/brand/icon-check.svg" tone="bg-[var(--color-success)]" className="size-3.5" />
              {benefit}
            </li>
          ))}
          {progress ? (
            <>
              <ProgressBar pct={progress.pct} className="mt-1 h-1.5" />
              <span className="text-caption font-bold text-[var(--color-brand-500)]">{progress.label}</span>
            </>
          ) : null}
        </ul>
      </div>
    </li>
  );
}
