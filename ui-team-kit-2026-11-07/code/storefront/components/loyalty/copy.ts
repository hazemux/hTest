import type { Locale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n/messages";
import { fill, formatPts } from "@/lib/loyalty/format";
import { trimFactor } from "@/lib/loyalty/map";
import type { EarnReward, EarnRule, LoyaltyFeatures } from "@/lib/loyalty/types";

/** What a rule pays, as the badge prints it: «+3,000», «1% نقاط», «2×». Every figure is the API's. */
export function rewardLabel(m: Messages, locale: Locale, reward: EarnReward): string {
  switch (reward.kind) {
    case "points":
      return fill(m.loyalty.reward.points, { pts: formatPts(locale, reward.pts) });
    case "rate":
      return fill(m.loyalty.reward.rate, { rate: reward.rate });
    case "percent":
      return fill(m.loyalty.reward.percent, { pct: trimFactor(reward.pct) });
    case "multiplier":
      return fill(m.loyalty.reward.multiplier, { factor: trimFactor(reward.factor) });
  }
}

/**
 * Whether a rule belongs on screen given the live features: a referral rule
 * while referrals are off, the top-up bonus while top-ups are off, a
 * non-purchase reward while rule rewards are off, or a campaign while
 * campaigns are off would promise something the code does not do (ADR 0043:
 * hidden, never «قريباً»).
 */
export function ruleIsLive(rule: EarnRule, features: LoyaltyFeatures): boolean {
  // Purchases always earn — the programme itself, not an optional rule.
  if (rule.code === PURCHASE_RULE) return true;
  if (rule.code.startsWith("referral_")) return features.referrals;
  if (rule.code === "topup_bonus") return features.topup;
  if (rule.state === "campaign" || rule.reward.kind === "multiplier") return features.campaigns;
  return features.ruleRewards;
}

/** The board's first badge: purchases, at the level's rate (`art.ts` draws it with the cart). */
export const PURCHASE_RULE = "purchase";

/**
 * «المشتريات — N / 1 $», the first badge the design draws. Neither the
 * programme's rules nor the challenges board carry it — purchases are the
 * programme itself, not an earning rule — so it is built here from the
 * level's rate (the API's string), and only when there is one. Always open.
 */
export function purchaseRule(m: Messages, rate: string | null): EarnRule | null {
  if (!rate) return null;
  return { code: PURCHASE_RULE, name: m.loyalty.earn.purchases, reward: { kind: "rate", rate }, state: "available", condition: null, afterFirstOrder: false };
}

/**
 * The rules as THIS customer's board shows them. `challenges` is personal
 * (`/me/loyalty/challenges`) and wins once loaded. Until then the public,
 * cached programme stands in — and it cannot know one customer's progress,
 * so the programme's own flag is applied: before the first paid order, a rule
 * marked «after the first paid order» is drawn locked.
 */
export function boardRules(programRules: EarnRule[], challenges: EarnRule[] | null, hasPaidOrder: boolean): EarnRule[] {
  if (challenges) return challenges;
  if (hasPaidOrder) return programRules;
  return programRules.map((rule) => (rule.afterFirstOrder ? { ...rule, state: "locked" as const } : rule));
}
