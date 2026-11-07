import type { PanelLinks } from "./panel/types";
import type { LoyaltyFeatures, LoyaltyProgram, LoyaltyWallet, Money, ReferralSummary } from "@/lib/loyalty/types";

/**
 * Shared test data for the loyalty components' tests — the design's own
 * sample customer (Gold, 24,350 points, $49.70 balance), so a test reads like
 * the comp it guards. Every money figure is a server-shaped `Money`, exactly
 * as the API would state it. Imported only by `*.test.tsx`.
 */

export const usd = (amount: string): Money => ({ amount, currency: "USD" });

export const ALL_ON: LoyaltyFeatures = { topup: true, referrals: true, perks: true, campaigns: true, expiry: true, vip: true, ruleRewards: true };
export const ALL_OFF: LoyaltyFeatures = { topup: false, referrals: false, perks: false, campaigns: false, expiry: false, vip: false, ruleRewards: false };

export function program(features: Partial<LoyaltyFeatures> = {}): LoyaltyProgram {
  return {
    pointsPerUsd: 1000,
    minRedeem: 2000,
    maxSharePct: 50,
    redeemStep: 50,
    pendingHoldHours: 24,
    graceDays: 30,
    tiers: [
      { code: "bronze", level: 1, name: "برونزي", rate: "3", minSpendUsd: "0", minSpend: { amount: "0.00", currency: "USD" }, benefits: [] },
      { code: "silver", level: 2, name: "فضي", rate: "5", minSpendUsd: "250", minSpend: { amount: "250.00", currency: "USD" }, benefits: ["هدية عيد ميلاد مضاعفة"] },
      { code: "gold", level: 3, name: "ذهبي", rate: "8", minSpendUsd: "1000", minSpend: { amount: "1000.00", currency: "USD" }, benefits: ["وصول مبكر للعروض"] },
      { code: "platinum", level: 4, name: "بلاتيني", rate: "12", minSpendUsd: "5000", minSpend: { amount: "5000.00", currency: "USD" }, benefits: ["دعم ذو أولوية"] },
    ],
    rules: [
      { code: "topup_bonus", name: "مكافأة الشحن", reward: { kind: "percent", pct: "1" }, state: "available", condition: null, afterFirstOrder: false },
      { code: "referral_referrer", name: "دعوة صديق", reward: { kind: "points", pts: 3000 }, state: "available", condition: null, afterFirstOrder: true },
      { code: "birthday", name: "عيد ميلادك", reward: { kind: "points", pts: 1000 }, state: "available", condition: null, afterFirstOrder: true },
      { code: "profile_email", name: "توثيق البريد", reward: { kind: "points", pts: 200 }, state: "available", condition: null, afterFirstOrder: true },
    ],
    perks: [{ code: "fee_waiver", name: "إعفاء من رسوم المعالجة", description: "على طلبك القادم", pricePts: 1500, priceValue: null, active: false, canGet: null, remainingThisMonth: null, endsAt: null }],
    campaigns: [{ code: "c1", title: "أسبوع الألعاب: نقاط مضاعفة على شحن الألعاب", multiplier: "2.00", target: "all", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-13T20:00:00Z" }],
    referral: { referrerPts: 3000, friendPts: 2000, minFirstOrder: { amount: "10.00", currency: "USD" } },
    faq: [{ id: "a", question: "ما الفرق بين رصيد تشارجر ونقاط تشارجر؟", answer: "الرصيد مال دفعته مسبقاً." }],
    topUp: {
      currencies: [{ currency: "AED", presets: ["50", "100", "250"], min: { amount: "10.00", currency: "AED" }, max: { amount: "2000.00", currency: "AED" } }],
      bonusPct: "1",
      newAccountDays: 7,
      transferWindowHours: 48,
    },
    title: null,
    vip: { price: { amount: "29.01", currency: "AED" }, multiplier: "1.50", benefits: ["fee_waiver", "cashback_multiplier", "priority_support", "account_manager", "early_access"], noticeDays: 3 },
    features: { ...ALL_ON, ...features },
  };
}

export function wallet(overrides: Partial<LoyaltyWallet> = {}): LoyaltyWallet {
  return {
    firstName: "أحمد",
    points: {
      available: 24350,
      pending: 1840,
      reserved: 0,
      earnedThisYear: 18920,
      availableValue: usd("24.35"),
      pendingValue: usd("1.84"),
      expiringSoon: { pts: 3200, on: "2026-10-20T12:00:00Z", value: usd("3.20") },
    },
    balance: { available: usd("49.70"), underReview: usd("0.00") },
    tier: {
      code: "gold",
      level: 3,
      name: "ذهبي",
      rate: "8",
      spend12m: usd("3910.00"),
      spend12mUsd: "3910.000000",
      next: { code: "platinum", name: "بلاتيني", minSpend: usd("5000.00"), minSpendUsd: "5000.000000", remaining: usd("1090.00") },
      atRisk: null,
    },
    unreadNotifications: 2,
    hasPaidOrder: true,
    firstOrderInProgress: false,
    referral: { code: "AHMED26", link: "https://chargerquick.net/ar/r/AHMED26" },
    vip: null,
    avatar: null,
    ...overrides,
  };
}

/** A customer who has signed up and not yet paid for an order. */
export function newWallet(): LoyaltyWallet {
  return wallet({
    firstName: null,
    points: { available: 0, pending: 75, reserved: 0, earnedThisYear: 0, availableValue: usd("0.00"), pendingValue: usd("0.07"), expiringSoon: null },
    balance: { available: usd("0.00"), underReview: usd("0.00") },
    hasPaidOrder: false,
    firstOrderInProgress: true,
    referral: null,
    tier: {
      code: "bronze",
      level: 1,
      name: "برونزي",
      rate: "3",
      spend12m: usd("0.00"),
      spend12mUsd: "0.000000",
      next: { code: "silver", name: "فضي", minSpend: usd("250.00"), minSpendUsd: "250.000000", remaining: usd("250.00") },
      atRisk: null,
    },
  });
}

export function referrals(overrides: Partial<ReferralSummary> = {}): ReferralSummary {
  return {
    locked: false,
    code: "AHMED26",
    link: "https://chargerquick.net/ar/r/AHMED26",
    referrerPts: 3000,
    referrerValue: usd("3.00"),
    friendPts: 2000,
    friendValue: usd("2.00"),
    friendMinOrder: usd("10.00"),
    stats: { invited: 4, inProgress: 2, rewarded: 1, notEligible: 1, earnedPts: 3000, earnedValue: usd("3.00") },
    items: [
      { id: "1", displayName: "سارة م.", status: "rewarded", pts: 3000, value: usd("3.00"), joinedAt: "2026-09-01T10:00:00Z" },
      { id: "2", displayName: "خالد ع.", status: "pending", pts: 3000, value: usd("3.00"), joinedAt: "2026-09-20T10:00:00Z" },
      { id: "3", displayName: "منى س.", status: "ordered", pts: null, value: null, joinedAt: "2026-10-01T10:00:00Z" },
      { id: "4", displayName: "ليلى ح.", status: "not_eligible", pts: null, value: null, joinedAt: "2026-10-02T10:00:00Z" },
    ],
    ...overrides,
  };
}

export const LINKS: PanelLinks = {
  signUp: "/ar/account/sign-up",
  signIn: "/ar/account/sign-in",
  topUp: "/ar/account/points/top-up",
  checkout: "/ar/cart",
  wallet: "/ar/account/points",
  rewards: "/ar/rewards",
  verify: "/ar/account/verify?next=%2Far%2Faccount%2Fpoints",
};
