"use client";

import { useState } from "react";

import type { Messages } from "@/lib/i18n/messages";
import { fill, formatAmount, formatDay, formatPts, formatWorth } from "@/lib/loyalty/format";
import type { ReferralRow, ReferralStatus, ReferralSummary } from "@/lib/loyalty/types";

import { REFERRAL_TONE } from "../art";
import { Card, ChipButton, Coin, Glyph, Pill } from "../parts";
import { ReferralShare } from "./ReferralShare";
import type { MemberViewContext } from "./types";

/** Customers only ever see «غير مؤهلة» for a referral that will not pay — never the internal reason (ADR 0043 §7). */
function referralNote(m: Messages, row: ReferralRow): string {
  const t = m.loyalty.referral;
  switch (row.status) {
    case "pending":
      return t.notePending;
    case "rewarded":
      return t.noteRewarded;
    case "ordered":
      return t.noteOrdered;
    case "not_eligible":
      return t.noteIneligible;
    default:
      return t.noteSigned;
  }
}

/** Friends who placed their first order, whatever happened after — `ordered`, `pending` and `rewarded`. */
export function orderedCount(rows: readonly ReferralRow[]): number {
  return rows.filter((row) => row.status === "ordered" || row.status === "pending" || row.status === "rewarded").length;
}

function Initial({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-wash)] text-body-s font-extrabold text-[var(--color-brand-500)]">
      {Array.from(name.trim())[0] ?? "·"}
    </span>
  );
}

/** «جارٍ التحميل» or, when the list could not be read, «تعذّر التحميل» — never an empty list. */
function Waiting({ m, failed }: { m: Messages; failed: boolean }) {
  return <p className="py-6 text-center text-body-s font-semibold text-[var(--color-ink-subtle)]">{failed ? m.loyalty.panel.unavailable : m.loyalty.panel.loading}</p>;
}

/** «ادعُ أصدقاءك»: the two rewards, the link and code, how it works, and the first friends. */
export function ReferralView({ locale, m, program, lists, failed, go }: MemberViewContext) {
  const t = m.loyalty.referral;
  const summary = lists.referrals;
  if (!program.features.referrals) return null;
  if (!summary) return <Waiting m={m} failed={failed.has("referrals")} />;
  if (summary.locked || !summary.link) {
    return (
      <Card className="items-center gap-2 text-center">
        <Glyph src="/brand/icon-lock.svg" tone="bg-[var(--color-ink-subtle)]" className="size-8" />
        <p className="text-body-s font-semibold text-[var(--color-ink-muted)]">{t.locked}</p>
      </Card>
    );
  }
  const friends = summary.items;

  return (
    <>
      <Card className="gap-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: m.loyalty.home.youGet, pts: summary.referrerPts, value: summary.referrerValue },
            { label: m.loyalty.home.friendGets, pts: summary.friendPts, value: summary.friendValue },
          ].map((bullet) => (
            <div key={bullet.label} className="flex flex-col gap-0.5 rounded-[12px] bg-[var(--color-primary-wash-lighter)] p-3">
              <span className="text-caption font-bold text-[var(--color-ink-muted)]">{bullet.label}</span>
              <span className="flex items-center gap-1.5">
                <Coin size={22} />
                <span dir="ltr" className="text-heading-l font-extrabold text-[var(--color-brand-500)]">
                  {formatPts(locale, bullet.pts)}
                </span>
              </span>
              <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{formatWorth(locale, bullet.value)}</span>
            </div>
          ))}
        </div>
        <span className="text-caption font-bold text-[var(--color-ink-muted)]">{t.yourLink}</span>
        <ReferralShare m={m} link={summary.link} />
        {summary.code ? (
          <p className="flex items-center gap-2 text-caption font-semibold text-[var(--color-ink-muted)]">
            <span>{t.orCode}</span>
            <b dir="ltr" className="text-body-m tracking-[0.08em] text-[var(--color-ink)]">
              {summary.code}
            </b>
          </p>
        ) : null}
      </Card>

      <Card className="gap-2.5">
        <h3 className="text-body-l font-bold">{t.howTitle}</h3>
        <ol className="flex flex-col gap-2.5">
          {[t.step1, fill(t.step2, { amount: formatAmount(locale, summary.friendMinOrder) }), fill(t.step3, { hours: program.pendingHoldHours })].map((text, index) => (
            <li key={text} className="flex items-start gap-2.5 text-body-s font-medium leading-[1.5] text-[var(--color-ink-muted)]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)] text-caption font-extrabold text-[var(--color-on-primary)]">
                {index + 1}
              </span>
              <span className="flex-1 [text-wrap:pretty]">{text}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-body-l font-bold">{t.friendsTitle}</h3>
          {friends.length > 0 ? (
            <button type="button" onClick={() => go("refList")} className="whitespace-nowrap text-caption font-bold text-[var(--color-brand-500)]">
              {t.seeAll}
            </button>
          ) : null}
        </div>
        {friends.length === 0 ? (
          <p className="py-2 text-caption font-semibold text-[var(--color-ink-subtle)]">{t.none}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {friends.slice(0, 3).map((row) => (
              <li key={row.id} className="flex items-center gap-2.5 border-t border-[var(--color-line)] pt-2.5">
                <Initial name={row.displayName} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body-s font-bold">{row.displayName}</span>
                  <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{referralNote(m, row)}</span>
                </span>
                <Pill tone={`${REFERRAL_TONE[row.status].wash} ${REFERRAL_TONE[row.status].ink}`}>{t.status[row.status]}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

const FILTERS = ["all", "rewarded", "pending", "ordered", "signed_up", "not_eligible"] as const;
type Filter = (typeof FILTERS)[number];

/** «من سجّل بدعوتك» — the server's stats, status filters and every friend, first name + last initial only. */
export function RefListView({ locale, m, program, lists, failed }: MemberViewContext) {
  const t = m.loyalty.referral;
  const [filter, setFilter] = useState<Filter>("all");
  const summary: ReferralSummary | null = lists.referrals;

  if (!summary) return <Waiting m={m} failed={failed.has("referrals")} />;

  const rows = summary.items;
  const count = (status: ReferralStatus) => rows.filter((row) => row.status === status).length;
  // Points still on their way: an integer sum of display points, not money.
  const coming = rows.filter((row) => row.status === "pending").reduce((total, row) => total + (row.pts ?? 0), 0);
  const shown = rows.filter((row) => filter === "all" || row.status === filter);
  const stats = [
    { key: "signed", label: t.statSigned, value: formatPts(locale, summary.stats.invited), sub: t.statSignedSub, tone: "bg-[var(--color-surface-raised)]", coin: false },
    { key: "ordered", label: t.statOrdered, value: formatPts(locale, orderedCount(rows)), sub: fill(t.statOrderedSub, { count: summary.stats.invited }), tone: "bg-[var(--color-surface-raised)]", coin: false },
    { key: "earned", label: t.statEarned, value: formatPts(locale, summary.stats.earnedPts), sub: formatWorth(locale, summary.stats.earnedValue), tone: "bg-[var(--color-success-wash)]", coin: true },
    { key: "coming", label: t.statComing, value: formatPts(locale, coming), sub: fill(t.statComingSub, { hours: program.pendingHoldHours }), tone: "bg-[var(--color-warning-wash)]", coin: true },
  ];

  return (
    <>
      <dl className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.key} data-stat={stat.key} className={`flex flex-col gap-0.5 rounded-[16px] px-3.5 py-3 ${stat.tone}`}>
            <dt className="text-caption font-bold text-[var(--color-ink-muted)]">{stat.label}</dt>
            <dd className="flex items-center gap-1.5 text-[22px] font-extrabold leading-[1.3]">
              {stat.coin ? <Coin size={20} /> : null}
              <span dir="ltr">{stat.value}</span>
            </dd>
            <dd className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{stat.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {FILTERS.map((key) => (
          <ChipButton key={key} active={filter === key} onClick={() => setFilter(key)}>
            {`${key === "all" ? t.all : t.status[key]} ${key === "all" ? rows.length : count(key)}`}
          </ChipButton>
        ))}
      </div>

      <Card className="px-4 py-1">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-body-s font-semibold text-[var(--color-ink-subtle)]">{t.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {shown.map((row, index) => (
              <li key={row.id} className={`flex items-center gap-2.5 py-3 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                <Initial name={row.displayName} />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-body-s font-bold">{row.displayName}</span>
                  <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{fill(t.joined, { date: formatDay(locale, row.joinedAt, { year: false }) })}</span>
                  <span className="text-caption-xs font-semibold text-[var(--color-ink-muted)]">{referralNote(m, row)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Pill tone={`${REFERRAL_TONE[row.status].wash} ${REFERRAL_TONE[row.status].ink}`}>{t.status[row.status]}</Pill>
                  <span
                    dir="ltr"
                    className={`text-caption font-extrabold ${
                      row.status === "rewarded" ? "text-[var(--color-success)]" : row.status === "pending" ? "text-[var(--color-warning-strong)]" : "text-[var(--color-ink-subtle)]"
                    }`}
                  >
                    {row.pts && (row.status === "rewarded" || row.status === "pending") ? `${row.status === "rewarded" ? "+" : ""}${formatPts(locale, row.pts)}` : "—"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-start gap-2.5 rounded-[12px] bg-[var(--color-field)] px-3.5 py-3">
        <Glyph src="/brand/icon-lock.svg" tone="bg-[var(--color-ink-subtle)]" className="mt-px size-[18px]" />
        <span className="text-caption font-semibold leading-[1.6] text-[var(--color-ink-muted)] [text-wrap:pretty]">{t.privacy}</span>
      </p>
    </>
  );
}
