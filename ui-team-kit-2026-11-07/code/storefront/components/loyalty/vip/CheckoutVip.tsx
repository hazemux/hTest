import type { ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { formatMoney, messagesFor } from "@/lib/i18n/messages";
import { fill, formatPts } from "@/lib/loyalty/format";

import { Coin } from "../parts";
import { VipChip } from "./VipChip";
import { VipCrestMono } from "./VipCrest";

/**
 * The VIP effect at checkout («VIP Experience» frame 8). Every figure is the
 * preview's (`POST /orders/preview`, v0.1.112) — the struck fee is
 * `processing_fee_waived_amount`, the points and their worth are
 * `points_earned_pts` / `points_earned_value`, the chip's multiplier is
 * `points_vip_multiplier`. Nothing here adds, multiplies or converts.
 */

/**
 * «رسوم المعالجة ~~4.41~~ مجاناً لأعضاء VIP» — drawn only when the server
 * says VIP (not a perk) waived the fee. It rises in once and one gold shine
 * crosses it when it first appears (`.cq-vip-row-in`, `.cq-vip-shine`,
 * mirrored in Arabic, none under reduced motion); re-quotes keep the row
 * mounted, so the shine does not replay.
 */
export function VipFeeWaivedRow({
  locale,
  label,
  waivedAmount,
  currency,
  settling = false,
}: {
  locale: Locale;
  label: string;
  /** The fee the method would have charged — null when the server did not say: then no struck figure. */
  waivedAmount: string | null;
  currency: string;
  settling?: boolean;
}) {
  const t = messagesFor(locale).loyalty.checkout;
  const was = waivedAmount ? formatMoney(locale, waivedAmount, currency) : null;

  return (
    <div
      data-vip-fee=""
      className={`cq-vip-row-in relative -mx-2 flex min-h-10 items-center justify-between gap-2 overflow-hidden rounded-[10px] bg-[var(--color-surface-raised)] px-2 text-body-s leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-brand-wash)] transition-opacity duration-200 lg:text-body-l ${settling ? "opacity-35" : ""}`}
    >
      <span aria-hidden className="cq-vip-shine pointer-events-none absolute inset-y-0 start-0 w-[35%] bg-[linear-gradient(90deg,rgba(255,190,50,0),rgba(255,190,50,0.28),rgba(255,190,50,0))]" />
      <span className="text-[var(--color-ink-muted)]">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {was ? (
          <s dir="ltr" aria-label={fill(t.feeWas, { amount: was })} className="text-caption font-semibold tabular-nums text-[var(--color-ink-subtle)]">
            {was}
          </s>
        ) : null}
        <span className="inline-flex items-center gap-1 font-extrabold text-[var(--color-brand-500)]">
          <span aria-hidden className="grid size-[18px] place-items-center rounded-full bg-[var(--vip-navy)] shadow-[inset_0_0_0_1px_var(--vip-gold)]">
            <VipCrestMono className="size-3 bg-[var(--vip-gold)]" />
          </span>
          {t.feeFreeVip}
        </span>
      </span>
    </div>
  );
}

/**
 * «تكسب نحو 6,000 نقطة ×1.5 VIP» on the success wash, with «≈ 22.04 د.إ ·
 * ذهبي، مضاعفة VIP» under it. «نحو» and «≈» because it is an ESTIMATE
 * (granted on capture at the rate frozen then). The tier is the wallet's
 * name; without one the caption says only what the server stated.
 */
export function EarnRow({
  locale,
  pts,
  value,
  currency,
  vipMultiplier,
  tierName,
  info,
}: {
  locale: Locale;
  pts: number;
  value: string | null;
  currency: string;
  vipMultiplier: string | null;
  tierName: string | null;
  /** The «?» that explains when the points land, beside the figure. */
  info?: ReactNode;
}) {
  const t = messagesFor(locale).loyalty.checkout;
  const rate = vipMultiplier ? (tierName ? fill(t.earnTierVip, { tier: tierName }) : t.earnVip) : tierName ? fill(t.earnTier, { tier: tierName }) : null;
  const caption = [value ? `≈ ${formatMoney(locale, value, currency)}` : null, rate].filter(Boolean).join(" · ");

  return (
    <div data-earn-row="" className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-success-wash)] p-3">
      <Coin size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex flex-wrap items-center gap-1.5 text-body-s font-extrabold text-[var(--color-ink)]">
          {fill(t.earnTitle, { pts: formatPts(locale, pts) })}
          {vipMultiplier ? <VipChip multiplier={vipMultiplier} /> : null}
        </span>
        {caption ? (
          <span dir="auto" className="text-caption-xs font-semibold text-[var(--color-ink-muted)]">
            {caption}
          </span>
        ) : null}
      </div>
      {info}
    </div>
  );
}

/** The phone's pay bar line under the total: «بلا رسوم معالجة · VIP». */
export function VipPayBarLine({ locale }: { locale: Locale }) {
  return (
    <span data-vip-paybar="" className="flex items-center justify-center gap-1 text-caption-xs font-extrabold text-[var(--color-brand-500)] lg:hidden">
      <VipCrestMono className="size-3 bg-current" />
      {messagesFor(locale).loyalty.checkout.barVip}
    </span>
  );
}
