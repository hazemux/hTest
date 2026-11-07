import Link from "next/link";

import { daysUntil, fill, formatAmount, formatDay, formatPts, formatWorth, isPositiveAmount, pointsUnit, tierProgressPct } from "@/lib/loyalty/format";

import { boardRules, ruleIsLive } from "../copy";
import { ruleIcon } from "../art";
import { Card, Chevron, Coin, Glyph, ProgressBar, TierMark, VipBadge } from "../parts";
import { ReferralShare } from "./ReferralShare";
import type { MemberViewContext } from "./types";

/**
 * The signed-in root («RewardsPanel» `home`). Points and balance are TWO
 * cards, never one total (ADR 0043 decision 2): one is a reward that expires,
 * the other is money the customer paid.
 */
export function HomeView(ctx: MemberViewContext) {
  const { locale, m, program, wallet, links, go, now } = ctx;
  const t = m.loyalty;
  const tier = wallet.tier;
  const fromUsd = program.tiers.find((level) => level.code === tier?.code)?.minSpendUsd ?? "0";
  const pct = tier ? tierProgressPct(tier.spend12mUsd, fromUsd, tier.next?.minSpendUsd ?? null) : 0;
  const referrals = ctx.lists.referrals;
  const shareLink = referrals?.link ?? wallet.referral?.link ?? null;
  const showReferral = program.features.referrals && wallet.hasPaidOrder && wallet.referral !== null && program.referral !== null;
  // The friend's minimum, as the server states it — the referrals list once
  // it is in, the programme's figure (same currency, v0.1.107) until then.
  const referMin = referrals
    ? formatAmount(locale, referrals.friendMinOrder)
    : program.referral?.minFirstOrder
      ? formatAmount(locale, program.referral.minFirstOrder)
      : null;
  const expiring = program.features.expiry ? wallet.points.expiringSoon : null;
  const locked = wallet.hasPaidOrder
    ? []
    : boardRules(program.rules, ctx.lists.challenges, false).filter((rule) => rule.state === "locked" && ruleIsLive(rule, program.features));

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* CHARGER POINTS */}
        <section className="flex flex-col gap-3 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-primary-wash-lighter)] p-4">
          <div className="flex items-center gap-2">
            <Coin size={24} />
            <h3 className="flex-1 text-body-s font-bold text-[var(--color-ink-muted)]">{t.pointsTitle}</h3>
            <span className="whitespace-nowrap text-caption font-bold text-[var(--color-brand-500)]">
              {fill(t.peg, { pts: formatPts(locale, program.pointsPerUsd) })}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="flex items-baseline gap-2">
              <span dir="ltr" className="text-[40px] font-extrabold leading-none tabular-nums text-[var(--color-brand-500)]">
                {formatPts(locale, wallet.points.available)}
              </span>
              <span className="text-body-l font-bold text-[var(--color-ink-muted)]">{pointsUnit(locale, wallet.points.available)}</span>
            </p>
            <span className="text-body-m font-bold text-[var(--color-ink)]">{formatWorth(locale, wallet.points.availableValue)}</span>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-[12px] bg-[var(--color-surface-raised)] px-3 py-2.5">
              <dt className="text-caption font-medium text-[var(--color-ink-muted)]">{t.home.available}</dt>
              <dd dir="ltr" className="text-start text-heading-m font-extrabold text-[var(--color-success)]">{formatPts(locale, wallet.points.available)}</dd>
            </div>
            <div className="rounded-[12px] bg-[var(--color-surface-raised)] px-3 py-2.5">
              <dt className="text-caption font-medium text-[var(--color-ink-muted)]">{t.home.pending}</dt>
              <dd dir="ltr" className="text-start text-heading-m font-extrabold text-[var(--color-ink)]">{formatPts(locale, wallet.points.pending)}</dd>
            </div>
          </dl>
          <p className="text-caption font-medium leading-[1.5] text-[var(--color-ink-muted)] [text-wrap:pretty]">
            {fill(t.home.pendingNote, { hours: program.pendingHoldHours })}
          </p>
        </section>

        {/* CHARGER BALANCE */}
        <section className="flex items-center gap-3 rounded-[16px] bg-[var(--color-surface-raised)] px-4 py-3 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--color-surface-subtle)]">
            <Glyph src="/brand/icon-wallet.svg" tone="bg-[var(--color-ink)]" className="size-[22px]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="text-caption font-bold text-[var(--color-ink-muted)]">{t.balanceTitle}</h3>
            <span dir="ltr" className="text-start text-heading-l font-extrabold leading-[1.3] text-[var(--color-ink)]">
              {formatAmount(locale, wallet.balance.available)}
            </span>
            <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{t.home.balanceNote}</span>
            {isPositiveAmount(wallet.balance.underReview.amount) ? (
              <span className="text-caption-xs font-bold text-[var(--color-warning-strong)]">
                {fill(t.home.underReview, { amount: formatAmount(locale, wallet.balance.underReview) })}
              </span>
            ) : null}
          </div>
          {program.features.topup && links.topUp ? (
            <Link
              href={links.topUp}
              className="flex h-9 shrink-0 items-center rounded-[10px] px-3 text-body-s font-bold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
            >
              {t.home.topUp}
            </Link>
          ) : null}
        </section>
      </div>

      {/* EARN / REDEEM */}
      <div className="grid grid-cols-2 gap-3">
        <Tile icon="/brand/icon-add-circle.svg" title={t.home.earnTile} sub={t.home.earnTileSub} onClick={() => go("earn")} />
        <Tile icon="/brand/icon-nav-discount.svg" title={t.home.redeemTile} sub={t.home.redeemTileSub} onClick={() => go("redeem")} />
      </div>

      {/* LEVEL — absent only in a store with no rate card. */}
      {tier ? (
        <button
          type="button"
          onClick={() => go("levels")}
          className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-4 text-start shadow-[0_0_12px_rgba(0,0,0,0.07)]"
        >
          <span className="flex items-center gap-3">
            <TierMark code={tier.code} size={52} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex flex-wrap items-center gap-2 text-body-l font-bold text-[var(--color-ink)]">
                {fill(t.home.tierTitle, { tier: tier.name, level: tier.level })}
                {wallet.vip && program.features.vip ? <VipBadge label={m.loyalty.vip.badge} /> : null}
              </span>
              <span className="text-caption font-semibold text-[var(--color-ink-muted)]">
                {tier.next ? fill(t.home.toNext, { amount: formatAmount(locale, tier.next.remaining), tier: tier.next.name }) : t.home.topTier}
              </span>
            </span>
            <Chevron to="forward" />
          </span>
          <ProgressBar pct={pct} />
          <span className="text-caption font-medium text-[var(--color-ink-subtle)]">
            {fill(t.home.spendFoot, { amount: formatAmount(locale, tier.spend12m) })}
          </span>
        </button>
      ) : null}

      {showReferral && program.referral ? (
        <Card className="gap-3">
          <div className="flex items-center gap-2">
            <h3 className="flex-1 text-body-l font-bold">{t.home.referTitle}</h3>
            <button type="button" onClick={() => go("referral")} className="text-caption font-bold text-[var(--color-brand-500)]">
              {t.home.details}
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            <ReferBullet label={t.home.youGet} pts={program.referral.referrerPts} ctx={ctx} />
            <ReferBullet label={t.home.friendGets} pts={program.referral.friendPts} ctx={ctx} />
          </ul>
          {referMin ? <p className="text-caption text-[var(--color-ink-subtle)]">{fill(t.home.referCond, { amount: referMin })}</p> : null}
          {/* The link exists once the referrals screen has minted the code
              (`GET /me/referrals`); until then «التفاصيل» is the way to it. */}
          {shareLink ? <ReferralShare m={m} link={shareLink} compact /> : null}
          {referrals ? (
            <p className="text-end text-caption font-semibold text-[var(--color-ink-muted)]">{fill(t.home.invited, { count: referrals.stats.invited })}</p>
          ) : null}
        </Card>
      ) : null}

      {expiring ? (
        <div className="flex items-start gap-3 rounded-[16px] bg-[var(--color-warning-wash)] px-4 py-3.5">
          <Glyph src="/brand/icon-info-circle.svg" tone="bg-[var(--color-warning-strong)]" className="size-[22px]" />
          <div className="flex flex-1 flex-col gap-0.5">
            <h3 className="text-body-s font-bold text-[var(--color-ink)]">
              {fill(t.home.expTitle, { pts: formatPts(locale, expiring.pts), days: daysUntil(expiring.on, now) })}
            </h3>
            <p className="text-caption font-medium text-[var(--color-ink-muted)]">
              {fill(t.home.expSub, { worth: formatWorth(locale, expiring.value), date: formatDay(locale, expiring.on) })}
            </p>
            {links.checkout ? (
              <Link href={links.checkout} className="mt-1 text-caption font-bold text-[var(--color-warning-strong)]">
                {t.home.expCta}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {locked.length > 0 ? (
        <Card className="gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--color-surface-subtle)]">
              <Glyph src="/brand/icon-lock.svg" tone="bg-[var(--color-ink-muted)]" className="size-5" />
            </span>
            <div className="flex flex-1 flex-col">
              <h3 className="text-body-l font-bold">{t.home.lockedTitle}</h3>
              <p className="text-caption font-medium text-[var(--color-ink-muted)]">{t.home.lockedSub}</p>
            </div>
          </div>
          <ul className="flex flex-col">
            {locked.map((rule) => (
              <li key={rule.code} className="flex items-center gap-2.5 border-t border-[var(--color-line)] py-2.5 text-body-s font-semibold text-[var(--color-ink-muted)]">
                <Glyph src={ruleIcon(rule.code)} tone="bg-[var(--color-ink-subtle)]" className="size-[18px]" />
                <span className="flex-1">{rule.name}</span>
                {rule.reward.kind === "points" ? (
                  <b dir="ltr" className="text-[var(--color-ink-subtle)]">{formatPts(locale, rule.reward.pts)}</b>
                ) : null}
              </li>
            ))}
          </ul>
          {wallet.firstOrderInProgress ? (
            <p className="flex items-center gap-2 rounded-[12px] bg-[var(--color-brand-wash)] px-3 py-2.5 text-caption font-bold text-[var(--color-brand-500)]">
              <Glyph src="/brand/icon-order-pending.svg" className="size-4" />
              {t.home.firstOrderPending}
            </p>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function Tile({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[108px] flex-col gap-2.5 rounded-[16px] bg-[var(--color-surface-raised)] p-4 text-start shadow-[0_0_12px_rgba(0,0,0,0.07)]"
    >
      <span className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-full bg-[var(--color-brand-wash)]">
          <Glyph src={icon} tone="bg-[var(--color-brand-500)]" className="size-[22px]" />
        </span>
        <Chevron to="forward" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-heading-m font-bold text-[var(--color-ink)]">{title}</span>
        <span className="text-caption font-medium text-[var(--color-ink-muted)]">{sub}</span>
      </span>
    </button>
  );
}

function ReferBullet({ label, pts, ctx }: { label: string; pts: number; ctx: MemberViewContext }) {
  return (
    <li className="flex items-center gap-2 text-body-s font-semibold">
      <Coin size={18} />
      <span className="flex-1">{label}</span>
      <b className="text-[var(--color-brand-500)]">
        {fill(ctx.m.loyalty.ptsAmount, { pts: formatPts(ctx.locale, pts) })}
      </b>
    </li>
  );
}
