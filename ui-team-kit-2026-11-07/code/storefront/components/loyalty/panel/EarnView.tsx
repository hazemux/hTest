import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import { daysUntil, fill, formatDay } from "@/lib/loyalty/format";
import { liveCampaigns, trimFactor } from "@/lib/loyalty/map";
import type { EarnRule, EarnRuleState } from "@/lib/loyalty/types";

import { ruleIcon } from "../art";
import { boardRules, PURCHASE_RULE, purchaseRule, rewardLabel, ruleIsLive } from "../copy";
import { Card, Glyph } from "../parts";
import type { ViewContext } from "./types";

/**
 * «اكسب نقاطاً» — the challenge board: every live way to earn as a badge in
 * one of four states, a legend, and the live campaign's banner when there is
 * one. A rule whose feature is off is not on the board at all.
 */
export function EarnView({ locale, m, program, lists, now, rate, hasPaidOrder }: ViewContext & { rate: string | null; hasPaidOrder: boolean }) {
  const t = m.loyalty.earn;
  // Purchases first, at the customer's level rate (the entry level's before
  // they have one), then the board.
  const purchases = purchaseRule(m, rate ?? program.tiers[0]?.rate ?? null);
  const board = boardRules(program.rules, lists.challenges, hasPaidOrder).filter((rule) => rule.code !== PURCHASE_RULE);
  const rules = [...(purchases ? [purchases] : []), ...board].filter((rule) => ruleIsLive(rule, program.features));
  const campaign = liveCampaigns(program, now)[0] ?? null;
  const legend: { state: EarnRuleState; label: string; dot: string }[] = [
    { state: "earned", label: t.legend.earned, dot: "bg-[var(--color-brand-500)]" },
    { state: "available", label: t.legend.available, dot: "bg-[var(--color-brand-wash)]" },
    { state: "locked", label: t.legend.locked, dot: "bg-[var(--color-surface-subtle)]" },
    ...(program.features.campaigns ? [{ state: "campaign" as const, label: t.legend.campaign, dot: "bg-[var(--color-secondary)]" }] : []),
  ];

  return (
    <>
      <Card className="gap-1.5">
        {rate ? <h3 className="text-body-l font-bold">{fill(t.lead, { rate })}</h3> : null}
        <p className="text-caption font-medium leading-[1.6] text-[var(--color-ink-muted)] [text-wrap:pretty]">
          {fill(t.rule, { hours: program.pendingHoldHours })}
        </p>
      </Card>

      {campaign ? (
        <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-secondary)] px-4 py-3 text-[var(--color-on-secondary)]">
          <span dir="ltr" className="text-[22px] font-extrabold leading-none">
            {fill(m.loyalty.reward.multiplier, { factor: trimFactor(campaign.multiplier) })}
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-body-s font-extrabold">{campaign.title}</span>
            <span className="text-caption font-semibold">
              {fill(t.campaignEnds, { days: daysUntil(campaign.endsAt, now), date: formatDay(locale, campaign.endsAt, { year: false }) })}
            </span>
          </span>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-3 text-caption font-semibold text-[var(--color-ink-muted)]" aria-hidden>
        {legend.map((item) => (
          <li key={item.state} className="flex items-center gap-1">
            <span className={`size-2.5 rounded-full ${item.dot}`} />
            {item.label}
          </li>
        ))}
      </ul>

      <ul className="grid grid-cols-3 gap-2">
        {rules.map((rule) => (
          <li key={rule.code} className="flex">
            <ChallengeBadge rule={rule} locale={locale} m={m} />
          </li>
        ))}
      </ul>
    </>
  );
}

const LOOK: Record<EarnRuleState, { circle: string; ink: string; mark: string | null; markBg: string; name: string; value: string; card: string }> = {
  earned: {
    circle: "bg-[var(--color-brand-500)]",
    ink: "bg-[var(--color-on-primary)]",
    mark: "/brand/icon-check-white.svg",
    markBg: "bg-[var(--color-success)]",
    name: "text-[var(--color-ink)]",
    value: "text-[var(--color-success)]",
    card: "shadow-[0_0_12px_rgba(0,0,0,0.07)]",
  },
  available: {
    circle: "bg-[var(--color-brand-wash)]",
    ink: "bg-[var(--color-brand-500)]",
    mark: null,
    markBg: "",
    name: "text-[var(--color-ink)]",
    value: "text-[var(--color-brand-500)]",
    card: "shadow-[0_0_12px_rgba(0,0,0,0.07)]",
  },
  locked: {
    circle: "bg-[var(--color-surface-subtle)]",
    ink: "bg-[var(--color-ink-subtle)]",
    mark: "/brand/icon-lock.svg",
    markBg: "bg-[var(--color-ink-subtle)]",
    name: "text-[var(--color-ink-subtle)]",
    value: "text-[var(--color-ink-subtle)]",
    card: "shadow-[0_0_12px_rgba(0,0,0,0.07)]",
  },
  campaign: {
    circle: "bg-[var(--color-secondary)] shadow-[0_0_0_4px_var(--color-secondary-wash-strong)]",
    ink: "bg-[var(--color-on-secondary)]",
    mark: null,
    markBg: "",
    name: "text-[var(--color-ink)]",
    value: "text-[var(--color-warning-strong)]",
    card: "shadow-[0_0_0_1.5px_var(--color-secondary)]",
  },
};

/** One badge: the rule's glyph in its state's circle, a corner mark, name, value, condition. */
export function ChallengeBadge({ rule, locale, m }: { rule: EarnRule; locale: Locale; m: Messages }) {
  const look = LOOK[rule.state];
  const stateLabel = m.loyalty.earn.legend[rule.state];
  return (
    <div
      data-state={rule.state}
      className={`relative flex w-full flex-col items-center gap-1.5 rounded-[16px] bg-[var(--color-surface-raised)] px-1.5 py-3 text-center ${look.card}`}
    >
      <span className={`relative grid size-14 place-items-center rounded-full ${look.circle}`}>
        <Glyph src={ruleIcon(rule.code)} tone={look.ink} className="size-[26px]" />
        {look.mark ? (
          <span className={`absolute -bottom-0.5 -end-0.5 grid size-5 place-items-center rounded-full shadow-[0_0_0_2px_var(--color-surface-raised)] ${look.markBg}`}>
            <Glyph src={look.mark} tone="bg-[var(--color-on-primary)]" className="size-[11px]" />
          </span>
        ) : null}
      </span>
      <span className={`text-caption font-bold leading-[1.3] ${look.name}`}>{rule.name}</span>
      <span className={`text-caption-xs font-bold ${look.value}`}>
        {rewardLabel(m, locale, rule.reward)}
      </span>
      {rule.condition ? <span className="text-caption-xs font-medium leading-[1.3] text-[var(--color-ink-subtle)]">{rule.condition}</span> : null}
      {/* The state is colour AND a mark; a screen reader gets it in words. */}
      <span className="sr-only">{stateLabel}</span>
    </div>
  );
}
