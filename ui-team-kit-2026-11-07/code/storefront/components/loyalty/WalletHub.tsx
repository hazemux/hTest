import Link from "next/link";
import type { ReactNode } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { daysUntil, fill, formatAmount, formatPts, formatWorth, isPositiveAmount, pointsUnit, tierProgressPct } from "@/lib/loyalty/format";
import { trimFactor } from "@/lib/loyalty/map";
import type { LoyaltyProgram, LoyaltyWallet } from "@/lib/loyalty/types";

import { Coin, Glyph, ProgressBar, TierMark, VipBadge } from "./parts";
import { WalletHistory, type WalletHistoryProps } from "./wallet/WalletHistory";

export type WalletTab = "overview" | "history" | "topup";

export type WalletHubProps = {
  locale: Locale;
  program: LoyaltyProgram;
  wallet: LoyaltyWallet;
  now: string;
  tab: WalletTab;
  /** Each tab is a link to the page's own URL state, so the tabs work before any script. */
  tabHrefs: Record<WalletTab, string>;
  /** The history tab's URL state and the page the server read for it. */
  history: Omit<WalletHistoryProps, "locale" | "expiry"> | null;
  /**
   * The top-up tab's content (the page builds it: the amount form, or a
   * top-up's transfer step and result). Null hides the tab and every way to
   * it — `features.topup` off, or no currency to top up in.
   */
  topUp: ReactNode | null;
  links: { checkout: string | null; invite: string | null };
};

/**
 * «المحفظة والنقاط» (Claude Design `WalletHub`): the account page's content
 * column — the side navigation is `AccountShell`'s. Three tabs: an overview of
 * the two buckets (never merged, ADR 0043 decision 2), the history, and the
 * bank-transfer top-up with its result states. Every figure is the server's.
 */
export function WalletHub(props: WalletHubProps) {
  const { locale, program, tab, tabHrefs, topUp } = props;
  const m = messagesFor(locale);
  const t = m.loyalty.wallet;
  const topUpLive = program.features.topup && topUp !== null;
  const tabs: WalletTab[] = topUpLive ? ["overview", "history", "topup"] : ["overview", "history"];
  // An existing top-up (`?id=`) stays reachable while the switch is off.
  const current: WalletTab = tab === "topup" && topUp === null ? "overview" : tab === "history" && !props.history ? "overview" : tab;

  return (
    <div className="flex min-w-0 flex-col gap-3.5 lg:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-heading-m font-bold leading-[1.4] lg:text-heading-l">{t.title}</h1>
        <nav aria-label={t.title} className="flex rounded-[30px] bg-[var(--color-primary-wash-lighter)] p-[3px]">
          {tabs.map((key) => (
            <Link
              key={key}
              href={tabHrefs[key]}
              scroll={false}
              aria-current={current === key ? "page" : undefined}
              className={`whitespace-nowrap rounded-[40px] px-4 py-2 text-body-s font-bold ${
                current === key ? "bg-[var(--color-brand-500)] text-[var(--color-on-cta)]" : "text-[var(--color-ink-muted)]"
              }`}
            >
              {t.tabs[key]}
            </Link>
          ))}
        </nav>
      </div>

      {current === "overview" ? <Overview {...props} topUpLive={topUpLive} /> : null}
      {current === "history" && props.history ? <WalletHistory locale={locale} expiry={program.features.expiry} {...props.history} /> : null}
      {current === "topup" ? topUp : null}
    </div>
  );
}

function Overview({ locale, program, wallet, now, tabHrefs, links, topUpLive }: WalletHubProps & { topUpLive: boolean }) {
  const m = messagesFor(locale);
  const t = m.loyalty.wallet;
  const tier = wallet.tier;
  const today = new Date(now);
  // Belt and braces: the API sends `expiring_soon` only while expiry is
  // enforced, and the programme's flag must agree before anything says «expiring».
  const expiring = program.features.expiry ? wallet.points.expiringSoon : null;
  const fact = "whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold text-[var(--color-ink-muted)]";

  const quick = [
    topUpLive && program.topUp ? { key: "topup", label: t.topUp, sub: fill(t.quickTopUpSub, { pct: trimFactor(program.topUp.bonusPct) }), icon: "/brand/icon-add-circle.svg", href: tabHrefs.topup } : null,
    links.checkout ? { key: "checkout", label: t.quickCheckout, sub: t.quickCheckoutSub, icon: "/brand/icon-cart.svg", href: links.checkout } : null,
    program.features.referrals && program.referral && links.invite
      ? { key: "invite", label: t.quickInvite, sub: fill(t.quickInviteSub, { pts: formatPts(locale, program.referral.referrerPts) }), icon: "/brand/icon-share.svg", href: links.invite }
      : null,
  ].filter((item) => item !== null);

  const stats = [
    { key: "pending", label: t.statPending, pts: wallet.points.pending, worth: formatWorth(locale, wallet.points.pendingValue), tone: "text-[var(--color-ink)]" },
    ...(expiring
      ? [{ key: "expiring", label: fill(t.statExpiring, { days: daysUntil(expiring.on, today) }), pts: expiring.pts, worth: formatWorth(locale, expiring.value), tone: "text-[var(--color-warning-strong)]" }]
      : []),
    { key: "year", label: t.statYear, pts: wallet.points.earnedThisYear, worth: null, tone: "text-[var(--color-success)]" },
  ];
  const fromUsd = program.tiers.find((level) => level.code === tier?.code)?.minSpendUsd ?? "0";

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3.5 rounded-[16px] bg-[var(--color-surface-raised)] p-5 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-[12px] bg-[var(--color-surface-subtle)]">
              <Glyph src="/brand/icon-wallet.svg" tone="bg-[var(--color-ink)]" className="size-[22px]" />
            </span>
            <div className="flex flex-col">
              <h2 className="text-heading-m font-bold">{m.loyalty.balanceTitle}</h2>
              <span className="text-caption font-medium text-[var(--color-ink-muted)]">{t.balWhat}</span>
            </div>
          </div>
          <span dir="ltr" className="text-start text-[34px] font-extrabold leading-[1.1] lg:text-[44px]">
            {formatAmount(locale, wallet.balance.available)}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[t.balNever, t.balCovers, t.balNoCash].map((text) => (
              <span key={text} className={`${fact} bg-[var(--color-chip)]`}>
                {text}
              </span>
            ))}
            {isPositiveAmount(wallet.balance.underReview.amount) ? (
              <span className={`${fact} bg-[var(--color-warning-wash)] text-[var(--color-warning-strong)]`}>
                {fill(m.loyalty.home.underReview, { amount: formatAmount(locale, wallet.balance.underReview) })}
              </span>
            ) : null}
          </div>
          <div className="mt-auto flex gap-2">
            {topUpLive ? (
              <Link
                href={tabHrefs.topup}
                scroll={false}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold text-[var(--color-on-primary)]"
              >
                {t.topUp}
                <Glyph src="/brand/icon-add-circle.svg" className="size-5" />
              </Link>
            ) : null}
            <Link href={tabHrefs.history} scroll={false} className="flex h-12 items-center rounded-[12px] px-4 text-body-s font-bold shadow-[inset_0_0_0_1px_var(--color-line)]">
              {t.history}
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-[16px] border border-[var(--color-brand-500)] bg-[var(--color-brand-50)] p-5">
          <div className="flex items-center gap-2.5">
            <Coin size={40} />
            <div className="flex flex-col">
              <h2 className="text-heading-m font-bold">{m.loyalty.pointsTitle}</h2>
              <span className="text-caption font-medium text-[var(--color-ink-muted)]">{t.ptsWhat}</span>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="flex items-baseline gap-2">
              <span dir="ltr" className="text-[34px] font-extrabold leading-[1.1] text-[var(--color-brand-500)] lg:text-[44px]">
                {formatPts(locale, wallet.points.available)}
              </span>
              <span className="text-body-l font-bold text-[var(--color-ink-muted)]">{pointsUnit(locale, wallet.points.available)}</span>
            </p>
            <span className="text-body-l font-bold">{formatWorth(locale, wallet.points.availableValue)}</span>
          </div>
          <dl className={`grid gap-2 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {stats.map((stat) => (
              <div key={stat.key} className="rounded-[12px] bg-[var(--color-surface-raised)] p-2.5">
                <dt className="text-caption-xs font-semibold text-[var(--color-ink-muted)]">{stat.label}</dt>
                <dd dir="ltr" className={`text-start text-body-l font-extrabold ${stat.tone}`}>
                  {formatPts(locale, stat.pts)}
                </dd>
                {stat.worth ? <dd className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{stat.worth}</dd> : null}
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {[
              fill(m.loyalty.peg, { pts: formatPts(locale, program.pointsPerUsd) }),
              fill(t.ptsCap, { pct: program.maxSharePct }),
              fill(t.ptsMin, { pts: formatPts(locale, program.minRedeem) }),
            ].map((text) => (
              <span key={text} className={`${fact} bg-[var(--color-surface-raised)]`}>
                {text}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            {links.checkout ? (
              <Link
                href={links.checkout}
                className="flex h-12 flex-1 items-center justify-center rounded-[12px] bg-[var(--color-surface-raised)] text-body-m font-bold text-[var(--color-brand-500)] shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
              >
                {t.useAtCheckout}
              </Link>
            ) : null}
            <Link href={tabHrefs.history} scroll={false} className="flex h-12 items-center rounded-[12px] px-4 text-body-s font-bold shadow-[inset_0_0_0_1px_var(--color-line)]">
              {t.history}
            </Link>
          </div>
        </section>
      </div>

      {quick.length > 0 ? (
        <ul className={`grid gap-3 ${quick.length === 3 ? "grid-cols-3" : quick.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {quick.map((item) => (
            <li key={item.key} className="flex">
              <Link
                href={item.href}
                className="flex w-full flex-col items-center gap-2.5 rounded-[16px] bg-[var(--color-surface-raised)] px-1.5 py-3 text-center shadow-[0_0_12px_rgba(0,0,0,0.07)] lg:flex-row lg:p-4 lg:text-start"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-brand-wash)]">
                  <Glyph src={item.icon} tone="bg-[var(--color-brand-500)]" className="size-[22px]" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-body-s font-bold">{item.label}</span>
                  <span className="hidden text-caption-xs font-medium text-[var(--color-ink-muted)] lg:block">{item.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {tier ? (
        <section className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-5 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
          <div className="flex items-center gap-3">
            <TierMark code={tier.code} size={48} />
            <div className="flex flex-1 flex-col">
              <h2 className="flex flex-wrap items-center gap-2 text-heading-m font-bold">
                {fill(m.loyalty.home.tierTitle, { tier: tier.name, level: tier.level })}
                {wallet.vip && program.features.vip ? <VipBadge label={m.loyalty.vip.badge} /> : null}
              </h2>
              <span className="text-caption font-semibold text-[var(--color-ink-muted)]">{fill(t.tierRate, { rate: tier.rate })}</span>
            </div>
          </div>
          <ProgressBar pct={tierProgressPct(tier.spend12mUsd, fromUsd, tier.next?.minSpendUsd ?? null)} className="h-2" />
          <div className="flex flex-wrap justify-between gap-2 text-caption font-bold">
            <span>{fill(t.tierSpend, { amount: formatAmount(locale, tier.spend12m) })}</span>
            {tier.next ? <span className="text-[var(--color-brand-500)]">{fill(t.tierNext, { amount: formatAmount(locale, tier.next.remaining), tier: tier.next.name })}</span> : null}
          </div>
          <p className="text-caption font-medium leading-[1.5] text-[var(--color-ink-subtle)]">{fill(t.tierNote, { days: program.graceDays })}</p>
        </section>
      ) : null}
    </>
  );
}
