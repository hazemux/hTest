import Link from "next/link";

import { compareDecimal, fill, formatPts } from "@/lib/loyalty/format";

import { ruleIcon } from "../art";
import { rewardLabel, ruleIsLive } from "../copy";
import { Card, Coin, Glyph } from "../parts";
import type { ViewContext } from "./types";

/**
 * The guest root — what the programme offers, never a zero balance (a guest
 * holds nothing; showing «0» reads as «you have lost something»). Every
 * figure comes from the programme: the tier range, the referral and birthday
 * rewards are dashboard settings, not copy.
 */
export function GuestView({ locale, m, program, links }: ViewContext) {
  const t = m.loyalty.guest;
  const { minRate, maxRate, factor } = rateRange(program.tiers.map((tier) => tier.rate));
  const birthday = program.features.ruleRewards ? program.rules.find((rule) => rule.code === "birthday" && rule.reward.kind === "points") : undefined;
  const ways = program.rules.filter((rule) => ruleIsLive(rule, program.features) && rule.state !== "campaign");

  const perks: { title: string; sub: string }[] = [];
  if (minRate && maxRate && factor > 1) {
    perks.push({
      title: fill(t.tiersTitle, { factor }),
      sub: fill(t.tiersSub, { min: minRate, max: maxRate }),
    });
  }
  if (program.features.referrals && program.referral) {
    perks.push({
      title: fill(t.referralTitle, { pts: formatPts(locale, program.referral.referrerPts) }),
      sub: fill(t.referralSub, { pts: formatPts(locale, program.referral.friendPts) }),
    });
  }
  if (birthday && birthday.reward.kind === "points") {
    perks.push({ title: fill(t.birthdayTitle, { pts: formatPts(locale, birthday.reward.pts) }), sub: t.birthdaySub });
  }

  return (
    <>
      <Card className="items-center gap-3 px-4 pb-4 pt-6 text-center">
        <span className="grid size-[104px] place-items-center rounded-full bg-[var(--color-brand-wash)]">
          <Coin size={64} />
        </span>
        <h3 className="text-heading-l font-extrabold">{t.title}</h3>
        <p className="text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)] [text-wrap:pretty]">{t.sub}</p>
        {perks.length > 0 ? (
          <div className="flex w-full flex-col gap-2.5 rounded-[12px] bg-[var(--color-primary-wash-lighter)] p-3 text-start">
            <span className="text-body-s font-extrabold text-[var(--color-ink)]">{t.lead}</span>
            <ul className="flex flex-col gap-2.5">
              {perks.map((perk) => (
                <li key={perk.title} className="flex items-center gap-2.5">
                  <Coin size={26} />
                  <span className="flex flex-1 flex-col">
                    <b className="text-body-s text-[var(--color-brand-500)]">{perk.title}</b>
                    <span className="text-caption-xs font-semibold text-[var(--color-ink-muted)]">{perk.sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {links.signUp ? (
          <Link
            href={links.signUp}
            className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-bold text-[var(--color-on-primary)]"
          >
            {t.join}
          </Link>
        ) : null}
        {links.signIn ? (
          <p className="text-body-s font-semibold">
            {t.haveAccount}{" "}
            <Link href={links.signIn} className="text-[var(--color-brand-500)]">
              {t.signIn}
            </Link>
          </p>
        ) : null}
      </Card>

      {ways.length > 0 || minRate ? (
        <Card className="gap-2.5">
          <h3 className="text-body-l font-bold">{t.ways}</h3>
          <ul className="flex flex-col">
            {minRate && maxRate ? (
              <li className="flex items-center gap-2.5 border-t border-[var(--color-line)] py-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-[var(--color-brand-wash)]">
                  <Glyph src={ruleIcon("purchase")} tone="bg-[var(--color-brand-500)]" className="size-4" />
                </span>
                <span className="flex-1 text-body-s font-semibold">{t.purchase}</span>
                <b className="text-body-s text-[var(--color-brand-500)]">
                  {minRate === maxRate ? fill(m.loyalty.reward.rate, { rate: minRate }) : fill(m.loyalty.reward.rateRange, { min: minRate, max: maxRate })}
                </b>
              </li>
            ) : null}
            {ways.map((rule) => (
              <li key={rule.code} className="flex items-center gap-2.5 border-t border-[var(--color-line)] py-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-[var(--color-brand-wash)]">
                  <Glyph src={ruleIcon(rule.code)} tone="bg-[var(--color-brand-500)]" className="size-4" />
                </span>
                <span className="flex-1 text-body-s font-semibold">{rule.name}</span>
                <b className="text-body-s text-[var(--color-brand-500)]">{rewardLabel(m, locale, rule.reward)}</b>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

/**
 * The lowest and highest earning rate across the levels, as the API wrote
 * them, and how many times the top one is the entry one — a ratio of two
 * points rates for the «up to 4×» line, never money.
 */
export function rateRange(rates: string[]): { minRate: string | null; maxRate: string | null; factor: number } {
  const live = rates.filter((rate) => compareDecimal(rate, "0") > 0);
  if (live.length === 0) return { minRate: null, maxRate: null, factor: 0 };
  const sorted = [...live].sort(compareDecimal);
  const minRate = sorted[0] as string;
  const maxRate = sorted[sorted.length - 1] as string;
  return { minRate, maxRate, factor: Math.round(Number(maxRate) / Number(minRate)) };
}
