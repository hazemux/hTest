"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { newAttemptKey } from "@/lib/checkout/attempt-key";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill, formatAmount, formatDay } from "@/lib/loyalty/format";
import type { Money, VipBenefit, VipMembershipView } from "@/lib/loyalty/types";
import { countPhrase, isVipMember, vipEndedText, vipJoinAction, vipPageState, type VipOutcome, type VipPageState } from "@/lib/loyalty/vip";

import { AvatarRing } from "./AvatarRing";
import { factorText } from "./VipChip";
import { VipCrest, VipCrestMono } from "./VipCrest";

/**
 * «عضوية VIP» (ADR 0044) — Claude Design «VIP Experience» frames 1–7: the
 * navy hero (light sweep, crest, the customer in their tier frame, the
 * status pill), the price block or the glass status card, the benefits
 * whose icons draw in, «كيف تعمل العضوية», the stop-renewal sheet and the
 * welcome moment.
 *
 * NO MONEY HERE: the price, the balance, the SHORTFALL (rounded up by the
 * server, v0.1.112) and whether the balance covers it are `GET /me/vip`'s;
 * the days left and the trial's length are its whole numbers too. After a
 * write the page re-reads it (`router.refresh()`), so nothing is assumed
 * from the answer.
 *
 * THE KEY IS MINTED HERE, once per attempt (`lib/checkout/attempt-key.ts`):
 * kept while the outcome is unknown (a failure, a request still running) so
 * a re-press replays instead of paying twice; a new one once the server
 * answered for certain.
 *
 * Cancel = renewal off, behind a sheet that says the membership stays until
 * the period end and nothing is refunded — «إبقاء التجديد» is its primary.
 * A two-step-verified customer turning renewal on (or subscribing) is handed
 * to the store's existing step-up code page (`verifyHref`) when the server
 * answers `step_up`. The welcome plays ONLY after the server said
 * `subscribed` (HANDBOOK «Motion»: success is the server's).
 *
 * Motion is CSS (`globals.css`, «VIP MOTION»): the hero's one sweep, the
 * crest's band, the rows rising and their icons drawing, the sheets, the
 * crest's pop and burst — mirrored in Arabic, final-frame under reduced
 * motion. Nothing here waits on an animation.
 */
export type VipBenefitRow = { code: VipBenefit; title: string; sub: string };

export type VipWho = {
  /** The customer's name, or null — then no name is invented. */
  name: string | null;
  avatar: string | null;
  /** The wallet's tier: its code for the frame, its name for the line. */
  tier: { code: string; name: string } | null;
};

/** The design's benefit glyphs (24 grid, three strokes each, drawn in turn). */
const BENEFIT_PATHS: Record<VipBenefit, [string, string, string]> = {
  fee_waiver: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3z", "M9 8h6M9 12h4", "M3 3l18 18"],
  cashback_multiplier: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8.5 13.5 12 9.5l3.5 4", "M12 9.5V16"],
  priority_support: ["M4 14v-2a8 8 0 0 1 16 0v2", "M4 14h3v5H5a1 1 0 0 1-1-1v-4zM20 14h-3v5h2a1 1 0 0 0 1-1v-4z", "M17 19c0 1.1-1.8 2-4 2"],
  account_manager: ["M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0", "M15.5 14.5l1.5 1.5 3-3"],
  early_access: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2", "M19 3l2 2"],
};

const PILL_DOT: Record<VipPageState, string> = {
  join: "bg-[var(--vip-gold)]",
  low: "bg-[var(--vip-gold)]",
  frozen: "bg-[var(--vip-gold)]",
  active: "bg-[var(--color-success)]",
  off: "bg-[var(--color-warning)]",
  trial: "bg-[var(--vip-sky)]",
  ended: "bg-[var(--vip-on-navy)] opacity-60",
};

export function VipMembership({
  locale,
  state,
  who,
  benefits,
  twoFactor = false,
  topUpHref,
  verifyHref,
  shopHref,
  noticeDays = null,
  subscribe,
  setRenewal,
}: {
  locale: Locale;
  state: VipMembershipView;
  who?: VipWho;
  benefits: VipBenefitRow[];
  /** `GET /me`'s `two_factor_enabled` — the off-state note says a code will be asked. */
  twoFactor?: boolean;
  topUpHref: string | null;
  verifyHref: string;
  /** Where «ابدأ التسوق» leads after the welcome. */
  shopHref?: string;
  /** The programme's `vip.renewal_notice_days` — the dashboard's reminder, never assumed. */
  noticeDays?: number | null;
  subscribe: (locale: string, attemptKey: string) => Promise<VipOutcome>;
  setRenewal: (locale: string, enabled: boolean) => Promise<VipOutcome>;
}) {
  const m = messagesFor(locale);
  const t = m.loyalty.vip;
  const p = t.page;
  const router = useRouter();
  const attempt = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [welcome, setWelcome] = useState<Money | null>(null);
  const [outcome, setOutcome] = useState<VipOutcome | null>(null);
  const stopTitle = useId();
  const welcomeTitle = useId();

  const view = vipPageState(state);
  const member = isVipMember(state);
  const price = formatAmount(locale, state.price);
  const date = state.periodEnd ? formatDay(locale, state.periodEnd) : "";
  const factor = factorText(state.multiplier);
  const action = vipJoinAction(state);
  const tierName = who?.tier?.name ?? "";
  // «شروط عضوية VIP» — the legal content page (`vip-terms`). Accepting is
  // the act itself; the server records it (no checkbox, owner 2026-10-09).
  const termsHref = `/${locale}/vip-terms`;
  // «نذكّرك قبله بـ 3 أيام» — the dashboard's number, or no number at all.
  const before = noticeDays ? countPhrase(locale, noticeDays, p.remindBefore) : p.remindBefore.zero;

  async function onSubscribe() {
    if (busy) return;
    setBusy(true);
    attempt.current ??= newAttemptKey();
    const charged = state.price;
    try {
      const result = await subscribe(locale, attempt.current);
      // Unknown outcomes keep the key, so a retry replays the first attempt.
      if (result !== "failed" && result !== "pending") attempt.current = null;
      setOutcome(result);
      // The welcome is the SERVER's: only a definite «subscribed».
      if (result === "subscribed") setWelcome(charged);
      if (result === "subscribed" || result === "already") router.refresh();
    } catch {
      setOutcome("failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRenewal(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await setRenewal(locale, enabled);
      setOutcome(result);
      setConfirming(false);
      if (result === "saved") router.refresh();
    } catch {
      setOutcome("failed");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    view === "active"
      ? p.heading.active
      : view === "off"
        ? date
          ? fill(p.heading.off, { date })
          : p.heading.offNoDate
        : view === "trial"
          ? p.heading.trial
          : view === "ended"
            ? p.heading.ended
            : p.heading.join;

  const lead =
    view === "active"
      ? fill(p.lead.active, { factor })
      : view === "off"
        ? p.lead.off
        : view === "trial"
          ? state.autoRenew
            ? p.lead.trialRenews
            : p.lead.trial
          : view === "ended"
            ? endedLead()
            : view === "low"
              ? p.lead.low
              : p.lead.join;

  function endedLead(): string {
    if (state.endedReason === "cancelled" && date) return fill(p.lead.endedCancelled, { date });
    if (state.endedReason === "balance_short" && date) return fill(state.balanceCovers ? p.lead.endedBalance : p.lead.endedBalanceShort, { date });
    return vipEndedText(m, state.endedReason);
  }

  const pill = member ? (view === "trial" ? p.pill.trial : view === "off" ? p.pill.off : p.pill.active) : view === "ended" ? p.pill.ended : p.pill.join;
  const benefitsTitle = view === "active" || view === "trial" ? p.benefitsTitle.member : view === "off" ? p.benefitsTitle.off : view === "ended" ? p.benefitsTitle.ended : p.benefitsTitle.join;
  const frameLabel = who?.name && who.tier ? fill(member ? p.frameLabelVip : p.frameLabel, { name: who.name, tier: who.tier.name }) : undefined;

  const whiteButton =
    "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--vip-on-navy)] px-[22px] text-body-m font-extrabold text-[var(--vip-deep)] shadow-[0_6px_16px_rgba(14,27,35,0.25)] transition disabled:opacity-60 lg:w-auto";
  const ghostButton =
    "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[12px] px-5 text-body-s font-extrabold text-[var(--vip-on-navy)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)] transition disabled:opacity-60 lg:w-auto";

  return (
    <div className="flex flex-col gap-4 lg:gap-6" data-vip-state={view}>
      {/* THE HERO — the same navy in light and dark (the canvas's VIP surface). */}
      <section className="relative isolate flex flex-col gap-[18px] overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,var(--vip-navy)_0%,var(--vip-deep)_55%,var(--vip-blue)_120%)] p-5 text-[var(--vip-on-navy)] shadow-[0_12px_32px_rgba(14,27,35,0.18)] lg:gap-6 lg:px-8 lg:pb-8 lg:pt-7">
        <span aria-hidden className="absolute -end-[120px] -top-40 -z-10 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(53,169,233,0.45),rgba(53,169,233,0))]" />
        <span aria-hidden className="cq-vip-hero-sweep absolute inset-y-0 start-0 -z-10 w-[30%] bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.10),rgba(255,255,255,0))]" />
        <span aria-hidden className="absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(90deg,rgba(255,190,50,0),var(--vip-gold),rgba(255,190,50,0))] opacity-70" />

        <div className="flex items-center gap-3">
          {who ? (
            <>
              <AvatarRing size={40} tier={who.tier?.code} vip={member} src={who.avatar} label={frameLabel} className="lg:hidden" />
              <AvatarRing size={56} tier={who.tier?.code} vip={member} src={who.avatar} label={frameLabel} className="max-lg:hidden" />
            </>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {who?.name ? <b className="truncate text-body-l leading-[1.3]">{who.name}</b> : null}
            {tierName ? <span className="text-caption font-bold text-[rgba(255,255,255,0.85)]">{tierName}</span> : null}
          </div>
          <span
            data-testid={member ? "vip-badge" : undefined}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgba(255,255,255,0.12)] px-2.5 text-caption font-extrabold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]"
          >
            <span aria-hidden className={`size-2 rounded-full ${PILL_DOT[view]}`} />
            {pill}
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-5 lg:grid-cols-[minmax(0,1fr)_168px]">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-caption font-extrabold tracking-[0.08em] text-[var(--vip-gold)]" dir="ltr">
              {p.eyebrow}
            </span>
            <h3 className="text-[22px] font-extrabold leading-[1.3] [text-wrap:balance] lg:text-[30px]">{heading}</h3>
            <p className="text-body-s font-medium leading-[1.6] text-[rgba(255,255,255,0.88)] [text-wrap:pretty] lg:text-body-l" data-testid="vip-lead">
              {lead}
            </p>
          </div>
          <div className="relative grid place-items-center">
            <span aria-hidden className="absolute size-[120%] rounded-full bg-[radial-gradient(closest-side,rgba(255,190,50,0.22),rgba(255,190,50,0))]" />
            <VipCrest size={72} className="lg:hidden" />
            <VipCrest size={148} className="max-lg:hidden" />
          </div>
        </div>

        {member ? (
          <GlassCard
            locale={locale}
            view={view}
            state={state}
            price={price}
            date={date}
            twoFactor={twoFactor}
            before={before}
            busy={busy}
            onStop={() => setConfirming(true)}
            onTurnOn={() => onRenewal(true)}
            termsHref={termsHref}
            whiteButton={whiteButton}
            ghostButton={ghostButton}
          />
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="flex items-baseline gap-1.5">
                  <b className="text-[28px] font-extrabold leading-[1.1] lg:text-[34px]" dir="ltr">
                    {price}
                  </b>
                  <span className="text-body-m font-semibold text-[rgba(255,255,255,0.85)]">{p.perMonth}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-body-s font-semibold text-[rgba(255,255,255,0.88)]">
                  <span aria-hidden className="block size-[18px] bg-current [mask-image:url(/brand/icon-wallet.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                  {p.yourBalance}{" "}
                  <b className="text-[var(--vip-on-navy)]" dir="ltr">
                    {formatAmount(locale, state.balance)}
                  </b>
                  {action === "topUp" && state.shortfall ? (
                    <span data-testid="vip-shortfall" className="inline-flex h-6 items-center rounded-full bg-[rgba(255,190,50,0.18)] px-2 text-caption font-extrabold text-[var(--vip-on-navy)] shadow-[inset_0_0_0_1px_rgba(255,190,50,0.55)]">
                      {fill(p.shortBy, { amount: formatAmount(locale, state.shortfall) })}
                    </span>
                  ) : null}
                </span>
              </div>
              {action === "subscribe" ? (
                <button type="button" className={whiteButton} disabled={busy} onClick={onSubscribe}>
                  <VipCrestMono className="size-5 bg-current" />
                  {busy ? m.common.loading : <span>{fill(view === "ended" ? p.rejoin : t.subscribe, { price })}</span>}
                </button>
              ) : action === "topUp" ? (
                <div className="w-full lg:w-auto" data-testid="vip-insufficient">
                  {topUpHref ? (
                    <Link href={topUpHref} className={whiteButton}>
                      <span aria-hidden className="block size-5 bg-current [mask-image:url(/brand/icon-wallet.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                      {p.topUp}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            <span className="text-caption font-medium leading-[1.6] text-[rgba(255,255,255,0.8)]">
              {action === "none" ? t.frozen : action === "topUp" ? p.help.low : view === "ended" ? p.help.ended : fill(p.help.join, { before })}
            </span>
            {action === "subscribe" ? <TermsLine template={p.legal.join} label={p.legal.terms} href={termsHref} /> : null}
          </div>
        )}
      </section>

      <Outcome locale={locale} outcome={outcome} verifyHref={verifyHref} topUpHref={topUpHref} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6">
        <section className="flex flex-col gap-1 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] lg:p-6">
          <h4 className="mb-2 text-heading-m font-bold leading-[1.4] text-[var(--color-ink)]">{benefitsTitle}</h4>
          <ul className="flex flex-col">
            {benefits.map((benefit, i) => (
              <li
                key={benefit.code}
                className={`cq-vip-rise flex min-h-16 items-center gap-3.5 ${i ? "border-t border-[var(--color-line)]" : ""}`}
                style={{ ["--i" as string]: i }}
              >
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-primary-wash-lighter)] text-[var(--color-brand-500)]">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    {BENEFIT_PATHS[benefit.code].map((d, k) => (
                      <path key={d} d={d} pathLength={1} className="cq-vip-draw" style={{ ["--i" as string]: i, ["--k" as string]: k }} />
                    ))}
                  </svg>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className="text-body-m leading-[1.4] text-[var(--color-ink)]">{benefit.title}</b>
                  <span className="text-caption font-medium leading-[1.5] text-[var(--color-ink-muted)]">{benefit.sub}</span>
                </div>
                {member ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-caption font-extrabold text-[var(--color-success)]">
                    <svg aria-hidden viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                    {p.benefitOn}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-[16px] bg-[var(--color-surface-raised)] p-4 shadow-[0_0_12px_rgba(0,0,0,0.07)] lg:p-6">
          <h4 className="text-heading-m font-bold leading-[1.4] text-[var(--color-ink)]">{p.howTitle}</h4>
          {[p.how.balanceOnly, fill(p.how.renews, { before }), p.how.short, p.how.stop].map((line) => (
            <p key={line} className="flex gap-2.5 text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)]">
              <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
              <span>{line}</span>
            </p>
          ))}
          <Link
            href={termsHref}
            className="mt-1 flex min-h-11 items-center justify-between gap-2 border-t border-[var(--color-line)] pt-2 text-body-s font-bold text-[var(--color-brand-500)]"
          >
            {p.legal.terms}
            <span aria-hidden className="block size-3.5 shrink-0 bg-current [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5px_10px] ltr:-scale-x-100" />
          </Link>
        </section>
      </div>

      {/* «إيقاف التجديد التلقائي؟» — says plainly VIP stays until the end
          date and nothing is refunded; KEEPING renewal is the primary. */}
      <VipSheet open={confirming} onClose={() => setConfirming(false)} labelledBy={stopTitle} role="alertdialog">
        <div className="flex flex-col gap-4 p-6">
          <span aria-hidden className="grid size-[52px] place-items-center rounded-full bg-[var(--color-warning-wash)] text-[var(--color-warning-strong)]">
            <span className="block size-[26px] bg-current [mask-image:url(/brand/icon-info-circle.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          </span>
          <h3 id={stopTitle} className="text-heading-l font-extrabold leading-[1.4]">
            {p.stopSheet.title}
          </h3>
          <p className="text-body-m leading-[1.7] text-[var(--color-ink-muted)]">{fill(p.stopSheet.body, { date })}</p>
          <div className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-chip)] px-3.5 py-3">
            <span aria-hidden className="block size-[18px] shrink-0 bg-[var(--color-ink-muted)] [mask-image:url(/brand/icon-wallet.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            <span className="text-body-s font-bold">{p.stopSheet.noRefund}</span>
          </div>
          <div className="mt-1 flex flex-col gap-2.5 lg:flex-row">
            <button
              type="button"
              className="min-h-[52px] flex-1 rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-extrabold text-[var(--color-on-primary)]"
              onClick={() => setConfirming(false)}
            >
              {p.stopSheet.keep}
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-[52px] flex-1 rounded-[12px] text-body-m font-extrabold text-[var(--color-danger)] shadow-[inset_0_0_0_1px_var(--color-danger)] disabled:opacity-60"
              onClick={() => onRenewal(false)}
            >
              {p.stopSheet.stop}
            </button>
          </div>
        </div>
      </VipSheet>

      {/* The welcome — only after the server said «subscribed». */}
      <VipSheet open={welcome !== null} onClose={() => setWelcome(null)} labelledBy={welcomeTitle} role="dialog">
        {welcome ? (
          <>
            <div className="relative flex flex-col items-center gap-1.5 overflow-hidden bg-[linear-gradient(160deg,var(--vip-navy),var(--vip-deep)_60%,var(--vip-blue))] px-6 pb-7 pt-9 text-center text-[var(--vip-on-navy)]">
              <div className="relative grid size-[132px] place-items-center">
                <span aria-hidden className="cq-vip-burst absolute inset-0 rounded-full shadow-[0_0_0_2px_var(--vip-gold)]" />
                <span className="cq-vip-pop block">
                  <VipCrest size={104} />
                </span>
              </div>
              <h3 id={welcomeTitle} className="mt-2 text-[26px] font-extrabold leading-[1.3]">
                {p.welcome.title}
              </h3>
              <p className="text-body-s font-semibold leading-[1.6] text-[rgba(255,255,255,0.88)]">
                {date && isVipMember(state)
                  ? fill(p.welcome.bodyRenews, { price: formatAmount(locale, welcome), date })
                  : fill(p.welcome.body, { price: formatAmount(locale, welcome) })}
              </p>
            </div>
            <div className="flex flex-col gap-3 px-6 pb-6 pt-5">
              <div className="flex flex-wrap justify-center gap-2">
                {[p.welcome.chipFee, fill(p.welcome.chipPoints, { factor }), p.welcome.chipSupport].map((chip) => (
                  <span key={chip} className="inline-flex h-8 items-center rounded-full bg-[var(--color-primary-wash-lighter)] px-3 text-caption font-extrabold text-[var(--color-brand-500)]">
                    {chip}
                  </span>
                ))}
              </div>
              {shopHref ? (
                <Link href={shopHref} className="grid min-h-[52px] place-items-center rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-extrabold text-[var(--color-on-primary)]">
                  {p.welcome.shop}
                </Link>
              ) : null}
              <button type="button" onClick={() => setWelcome(null)} className="min-h-11 text-body-s font-bold text-[var(--color-ink-muted)]">
                {p.welcome.close}
              </button>
            </div>
          </>
        ) : null}
      </VipSheet>
    </div>
  );
}

/** The glass status card on the navy hero: a member's period, price and the renewal control. */
function GlassCard({
  locale,
  view,
  state,
  price,
  date,
  twoFactor,
  before,
  busy,
  onStop,
  onTurnOn,
  termsHref,
  whiteButton,
  ghostButton,
}: {
  locale: Locale;
  view: VipPageState;
  state: VipMembershipView;
  price: string;
  date: string;
  twoFactor: boolean;
  before: string;
  busy: boolean;
  onStop: () => void;
  onTurnOn: () => void;
  termsHref: string;
  whiteButton: string;
  ghostButton: string;
}) {
  const t = messagesFor(locale).loyalty.vip;
  const p = t.page;
  const monthly = fill(p.rows.priceValue, { price });
  const balance = formatAmount(locale, state.balance);

  const rows: { label: string; value: string }[] =
    view === "active"
      ? [
          { label: p.rows.renewsOn, value: date },
          { label: p.rows.price, value: monthly },
          { label: p.rows.chargedTo, value: fill(p.rows.chargedToValue, { amount: balance }) },
        ]
      : view === "off"
        ? [
            { label: p.rows.endsOn, value: date },
            { label: p.rows.renewal, value: t.renewalOff },
            { label: p.rows.balance, value: balance },
          ]
        : [
            { label: p.rows.endsOn, value: date },
            { label: p.rows.after, value: monthly },
          ];

  const note =
    view === "active"
      ? fill(p.note.remind, { before })
      : view === "off"
        ? twoFactor
          ? p.note.twoFactor
          : fill(p.note.firstRenewal, { date })
        : state.autoRenew
          ? fill(p.note.trialRenewOn, { date })
          : twoFactor
            ? p.note.twoFactor
            : p.note.trialRenew;
  const lock = !state.autoRenew && twoFactor;
  const renewing = state.autoRenew;

  return (
    <div className="flex flex-col gap-4 rounded-[16px] bg-[rgba(255,255,255,0.10)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_8px_24px_rgba(14,27,35,0.2)] backdrop-blur-[14px] lg:px-[22px] lg:py-5">
      {view === "trial" && state.daysLeft !== null ? (
        <div className="flex flex-col gap-2" data-testid="vip-trial">
          <div className="flex items-baseline justify-between gap-2">
            <b className="text-[28px] font-extrabold leading-[1.1] lg:text-[34px]">{countPhrase(locale, state.daysLeft, p.daysLeft)}</b>
            {state.periodDays !== null ? <span className="text-caption font-bold text-[rgba(255,255,255,0.85)]">{countPhrase(locale, state.periodDays, p.trialLength)}</span> : null}
          </div>
          {state.periodDays ? (
            // The share of the trial LEFT — two whole numbers the server gave, not money.
            <span aria-hidden className="relative block h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.18)]">
              <span
                className="absolute inset-y-0 start-0 rounded-full bg-[linear-gradient(90deg,var(--vip-sky),var(--vip-gold))] rtl:bg-[linear-gradient(270deg,var(--vip-sky),var(--vip-gold))]"
                style={{ width: `${Math.min(100, Math.max(0, Math.round((state.daysLeft / state.periodDays) * 100)))}%` }}
              />
            </span>
          ) : null}
        </div>
      ) : null}
      <dl className={`grid gap-x-5 gap-y-3.5 ${rows.length === 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2"}`} data-testid="vip-period">
        {rows.map((row) => (
          <div key={row.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption font-semibold text-[rgba(255,255,255,0.8)]">{row.label}</dt>
            <dd className="text-body-l font-extrabold leading-[1.35]">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(255,255,255,0.16)] pt-3.5">
        <span className="flex min-w-[200px] flex-1 items-center gap-2 text-caption font-semibold leading-[1.6] text-[rgba(255,255,255,0.88)]">
          <span
            aria-hidden
            className="block size-4 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
            style={{ maskImage: `url(/brand/${lock ? "icon-lock" : "icon-info-circle"}.svg)`, WebkitMaskImage: `url(/brand/${lock ? "icon-lock" : "icon-info-circle"}.svg)` }}
          />
          {note}
        </span>
        {renewing ? (
          <button type="button" className={ghostButton} disabled={busy} onClick={onStop}>
            {t.stopRenewal}
          </button>
        ) : (
          <button type="button" className={whiteButton} disabled={busy} onClick={onTurnOn}>
            {view === "trial" ? p.turnOnTrial : p.turnOn}
          </button>
        )}
      </div>
      {renewing ? null : <TermsLine template={p.legal.renew} label={p.legal.terms} href={termsHref} />}
    </div>
  );
}

/**
 * «بالاشتراك، توافق على شروط عضوية VIP» — one caption under the button that
 * commits (the checkout's «Paying is agreeing» line, on the navy hero: the
 * link is white and underlined there, the brand blue would not read).
 */
function TermsLine({ template, label, href }: { template: string; label: string; href: string }) {
  const [before, after = ""] = template.split("{terms}");
  return (
    <p data-vip-terms="" className="text-caption leading-[1.6] text-[rgba(255,255,255,0.8)] [text-wrap:pretty]">
      {before}
      <Link href={href} className="font-bold text-[var(--vip-on-navy)] underline underline-offset-2">
        {label}
      </Link>
      {after}
    </p>
  );
}

/** What a write answered, below the hero — an error with its way through, or a quiet «تم الحفظ». */
function Outcome({ locale, outcome, verifyHref, topUpHref }: { locale: Locale; outcome: VipOutcome | null; verifyHref: string; topUpHref: string | null }) {
  const m = messagesFor(locale);
  const t = m.loyalty.vip;
  return (
    <div aria-live="polite">
      {outcome && outcome !== "saved" && outcome !== "subscribed" ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-ink)]">
          <span>{t.outcome[outcome]}</span>
          {outcome === "step_up" ? (
            // The store's existing step-up code page, back here after.
            <Link href={verifyHref} className="font-bold text-[var(--color-brand-500)] underline">
              {m.account.stepUpAction}
            </Link>
          ) : null}
          {outcome === "insufficient" && topUpHref ? (
            <Link href={topUpHref} className="font-bold text-[var(--color-brand-500)] underline">
              {t.topUp}
            </Link>
          ) : null}
        </div>
      ) : outcome === "saved" ? (
        <p role="status" className="text-body-s font-semibold text-[var(--color-brand-500)]">
          {t.outcome.saved}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A VIP sheet: the store's `cq-sheet` native `<dialog>` (focus trap, Escape
 * and the inert page from the browser), entering as the canvas draws it
 * (`cq-vip-sheet`). Its content stays rendered so the exit has something to
 * carry away; a closed dialog is not in the accessibility tree.
 */
function VipSheet({ open, onClose, labelledBy, role, children }: { open: boolean; onClose: () => void; labelledBy: string; role: "dialog" | "alertdialog"; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    } else if (!open && element.open) {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      role={role}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="cq-sheet cq-vip-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-[var(--color-surface-raised)] p-0 pb-[env(safe-area-inset-bottom)] text-[var(--color-ink)] shadow-[0_24px_48px_rgba(14,27,35,0.3)] backdrop:bg-[color-mix(in_srgb,var(--vip-navy)_55%,transparent)] lg:inset-0 lg:m-auto lg:max-w-[480px] lg:rounded-[20px]"
    >
      <span aria-hidden className="relative z-[1] mx-auto mt-2.5 block h-1 w-10 rounded-full bg-[var(--color-border-strong)] lg:hidden" />
      {children}
    </dialog>
  );
}
