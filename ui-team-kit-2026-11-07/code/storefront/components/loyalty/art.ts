import type { BalanceHistoryKind, PointsHistoryKind, ReferralStatus } from "@/lib/loyalty/types";

/**
 * Which picture and which colours each loyalty value gets — one map per
 * thing, so the panel, the wallet and the order page cannot disagree.
 *
 * TIER ARTWORK: the design's level medals, 128 px WebP (~5 KB each) under
 * `public/brand/`. A level whose file is not listed here draws its
 * gradient-and-star fallback (`TierMark`).
 */
export const TIER_ARTWORK: Readonly<Record<string, string | null>> = {
  bronze: "/brand/tier-bronze.webp",
  silver: "/brand/tier-silver.webp",
  gold: "/brand/tier-gold.webp",
  platinum: "/brand/tier-platinum.webp",
};

/** The design's per-level gradients, as Tailwind classes on the tokens. */
export const TIER_GRADIENT: Readonly<Record<string, string>> = {
  bronze: "bg-[linear-gradient(135deg,var(--color-warning),var(--color-warning-strong))]",
  silver: "bg-[linear-gradient(135deg,var(--color-border-strong),var(--color-border))]",
  gold: "bg-[linear-gradient(135deg,var(--color-secondary),var(--color-secondary-hover))]",
  platinum: "bg-[image:var(--gradient-brand)]",
};

const icon = (name: string) => `/brand/${name}.svg`;

/** An earning rule's glyph, by rule code. */
const RULE_ICONS: Readonly<Record<string, string>> = {
  purchase: "icon-cart",
  order_cashback: "icon-cart",
  topup_bonus: "icon-wallet",
  referral_referrer: "icon-share",
  referral_friend: "icon-share",
  birthday: "icon-nav-gift",
  profile_email: "icon-email",
  profile_birthday: "icon-edit",
  profile_player_id: "icon-account-profile",
  order_review: "icon-star-rate-filled",
  milestone_5th_order: "icon-menu-orders",
  milestone_10th_order: "icon-menu-orders",
  anniversary: "icon-order-done",
  campaign: "icon-nav-games",
};

export function ruleIcon(code: string): string {
  return icon(RULE_ICONS[code] ?? "icon-add-circle");
}

/** A perk's glyph, by perk code. */
export function perkIcon(code: string): string {
  const byCode: Record<string, string> = {
    fee_waiver: "icon-card",
    points_boost: "icon-refresh",
    vip_trial: "icon-menu-loyalty",
  };
  return icon(byCode[code] ?? "icon-nav-discount");
}

/** A points ledger row's glyph, by ledger source. */
export function sourceIcon(source: string, kind?: PointsHistoryKind): string {
  if (kind === "pending" || kind === "expired") return icon("icon-order-pending");
  if (kind === "clawed") return icon("icon-order-failed");
  if (kind === "returned") return icon("icon-refresh");
  const byCode: Record<string, string> = {
    order_redemption: "icon-nav-discount",
    perk_redemption: "icon-nav-discount",
    admin_adjustment: "icon-edit",
    topup: "icon-wallet",
    order_payment: "icon-cart",
    order_refund: "icon-refresh",
    topup_reversal: "icon-order-failed",
  };
  return icon(byCode[source] ?? RULE_ICONS[source] ?? "icon-add-circle");
}

type Tone = { wash: string; ink: string };

/** History kinds: the wash behind the icon and pill, and the ink on it. */
export const POINTS_KIND_TONE: Readonly<Record<PointsHistoryKind, Tone>> = {
  earned: { wash: "bg-[var(--color-success-wash)]", ink: "text-[var(--color-success)]" },
  pending: { wash: "bg-[var(--color-warning-wash)]", ink: "text-[var(--color-warning-strong)]" },
  spent: { wash: "bg-[var(--color-brand-wash)]", ink: "text-[var(--color-brand-500)]" },
  expired: { wash: "bg-[var(--color-surface-subtle)]", ink: "text-[var(--color-ink-subtle)]" },
  clawed: { wash: "bg-[var(--color-error-wash)]", ink: "text-[var(--color-danger)]" },
  returned: { wash: "bg-[var(--color-success-wash)]", ink: "text-[var(--color-success)]" },
  adjusted: { wash: "bg-[var(--color-chip)]", ink: "text-[var(--color-ink-muted)]" },
};

export const BALANCE_KIND_TONE: Readonly<Record<BalanceHistoryKind, Tone>> = {
  added: { wash: "bg-[var(--color-success-wash)]", ink: "text-[var(--color-success)]" },
  spent: { wash: "bg-[var(--color-brand-wash)]", ink: "text-[var(--color-brand-500)]" },
  returned: { wash: "bg-[var(--color-success-wash)]", ink: "text-[var(--color-success)]" },
  adjusted: { wash: "bg-[var(--color-chip)]", ink: "text-[var(--color-ink-muted)]" },
};

export const REFERRAL_TONE: Readonly<Record<ReferralStatus, Tone>> = {
  signed_up: { wash: "bg-[var(--color-chip)]", ink: "text-[var(--color-ink-muted)]" },
  ordered: { wash: "bg-[var(--color-brand-wash)]", ink: "text-[var(--color-brand-500)]" },
  pending: { wash: "bg-[var(--color-warning-wash)]", ink: "text-[var(--color-warning-strong)]" },
  rewarded: { wash: "bg-[var(--color-success-wash)]", ink: "text-[var(--color-success)]" },
  not_eligible: { wash: "bg-[var(--color-surface-subtle)]", ink: "text-[var(--color-ink-subtle)]" },
};

/**
 * A notification's glyph and tone, by its `type`. The API may add a type this
 * build has not met: it gets the generic look (`notificationArt`), never an
 * undefined that would take the panel down.
 */
const NOTIFICATION_ART: Readonly<Record<string, Tone & { icon: string }>> = {
  points_pending: { icon: icon("icon-order-pending"), ...POINTS_KIND_TONE.pending },
  points_available: { icon: icon("icon-tick-circle"), ...POINTS_KIND_TONE.earned },
  points_expiring: { icon: icon("icon-info-circle"), ...POINTS_KIND_TONE.pending },
  tier_up: { icon: icon("icon-star-rate-filled"), wash: "bg-[var(--color-secondary)]", ink: "text-[var(--color-on-secondary)]" },
  tier_at_risk: { icon: icon("icon-info-circle"), ...POINTS_KIND_TONE.clawed },
  tier_down: { icon: icon("icon-info-circle"), ...POINTS_KIND_TONE.adjusted },
  birthday: { icon: icon("icon-nav-gift"), ...POINTS_KIND_TONE.spent },
  referral_rewarded: { icon: icon("icon-share"), ...POINTS_KIND_TONE.earned },
  reward_granted: { icon: icon("icon-add-circle"), ...POINTS_KIND_TONE.earned },
  perk_activated: { icon: icon("icon-nav-discount"), ...POINTS_KIND_TONE.spent },
  topup_review: { icon: icon("icon-shield-tick"), ...POINTS_KIND_TONE.spent },
  topup_approved: { icon: icon("icon-tick-circle"), ...POINTS_KIND_TONE.earned },
  topup_rejected: { icon: icon("icon-order-failed"), ...POINTS_KIND_TONE.clawed },
};

const GENERIC_NOTIFICATION: Tone & { icon: string } = { icon: icon("icon-bell"), ...POINTS_KIND_TONE.adjusted };

export function notificationArt(type: string): Tone & { icon: string } {
  return Object.hasOwn(NOTIFICATION_ART, type) ? (NOTIFICATION_ART[type] as Tone & { icon: string }) : GENERIC_NOTIFICATION;
}
