"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDay, formatSignedAmount, formatSignedPts, formatWhen, formatWorth, isPositiveAmount } from "@/lib/loyalty/format";
import type { PointsHistoryKind } from "@/lib/loyalty/types";

import { BALANCE_KIND_TONE, POINTS_KIND_TONE, notificationArt, sourceIcon } from "../art";
import { balanceRowTitle, pointsRowTitle, pointsRowWhen, referenceLabel } from "../history";
import { Card, ChipButton, Glyph, Pill, Segmented } from "../parts";
import { notificationCopy } from "@/lib/loyalty/notification-copy";

import type { MemberViewContext, ViewContext } from "./types";

const POINTS_FILTERS = ["all", "earned", "pending", "spent", "returned", "expired", "clawed", "adjusted"] as const;
type PointsFilter = (typeof POINTS_FILTERS)[number];

function Loading({ text }: { text: string }) {
  return <p className="py-7 text-center text-body-s font-semibold text-[var(--color-ink-subtle)]">{text}</p>;
}

/** «السجل» in the panel — points | balance, the points filtered by kind. The latest page; the wallet has the rest. */
export function HistoryView({ locale, m, program, lists, failed, links }: MemberViewContext) {
  const t = m.loyalty.history;
  const [tab, setTab] = useState<"points" | "balance">("points");
  const [filter, setFilter] = useState<PointsFilter>("all");
  const filters = program.features.expiry ? POINTS_FILTERS : POINTS_FILTERS.filter((key) => key !== "expired");

  const points = lists.pointsHistory?.filter((row) => filter === "all" || row.kind === filter) ?? null;
  const balance = lists.balanceHistory;
  const rows = tab === "points" ? points : balance;
  const unreadable = tab === "points" ? failed.has("pointsHistory") : failed.has("balanceHistory");

  return (
    <>
      <Segmented
        label={m.loyalty.panel.views.history}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setFilter("all");
        }}
        options={[
          { key: "points", label: t.points },
          { key: "balance", label: t.balance },
        ]}
      />
      {tab === "points" ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {filters.map((key) => (
            <ChipButton key={key} active={filter === key} onClick={() => setFilter(key)}>
              {key === "all" ? t.all : t.kind[key as PointsHistoryKind]}
            </ChipButton>
          ))}
        </div>
      ) : null}

      <Card className="px-3.5 py-1">
        {rows === null ? (
          <Loading text={unreadable ? m.loyalty.panel.unavailable : m.loyalty.panel.loading} />
        ) : rows.length === 0 ? (
          <Loading text={t.empty} />
        ) : tab === "points" && points ? (
          <ul className="flex flex-col">
            {points.map((row, index) => {
              const tone = POINTS_KIND_TONE[row.kind];
              const reference = referenceLabel(m, row.reference);
              const when = pointsRowWhen(m, locale, row, { expiry: program.features.expiry });
              return (
                <li key={row.id} className={`flex items-start gap-2.5 py-3 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone.wash}`}>
                    <Glyph src={sourceIcon(row.source, row.kind)} tone={`bg-current ${tone.ink}`} className="size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="text-body-s font-bold">{pointsRowTitle(m, row)}</span>
                    {reference || when ? (
                      <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{[reference, when].filter(Boolean).join(" · ")}</span>
                    ) : null}
                    <Pill tone={`${tone.wash} ${tone.ink}`} className="mt-1 self-start">
                      {t.kind[row.kind]}
                    </Pill>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-px">
                    <span
                      dir="ltr"
                      className={`text-body-s font-extrabold ${
                        row.kind === "pending"
                          ? "text-[var(--color-warning-strong)]"
                          : row.pts > 0
                            ? "text-[var(--color-success)]"
                            : row.kind === "clawed"
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--color-ink)]"
                      }`}
                    >
                      {formatSignedPts(locale, row.pts)}
                    </span>
                    <span className="text-caption-xs font-semibold text-[var(--color-ink-subtle)]">{formatWorth(locale, row.value)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="flex flex-col">
            {(balance ?? []).map((row, index) => {
              const tone = BALANCE_KIND_TONE[row.kind];
              return (
                <li key={row.id} className={`flex items-start gap-2.5 py-3 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone.wash}`}>
                    <Glyph src={sourceIcon(row.source)} tone={`bg-current ${tone.ink}`} className="size-[18px]" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="text-body-s font-bold">{balanceRowTitle(m, row)}</span>
                    <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">
                      {[referenceLabel(m, row.reference), formatDay(locale, row.createdAt, { year: false })].filter(Boolean).join(" · ")}
                    </span>
                    <Pill tone={`${tone.wash} ${tone.ink}`} className="mt-1 self-start">
                      {t.balanceKind[row.kind]}
                    </Pill>
                  </span>
                  <span
                    dir="ltr"
                    className={`shrink-0 text-body-s font-extrabold ${isPositiveAmount(row.amount.amount) ? "text-[var(--color-success)]" : "text-[var(--color-ink)]"}`}
                  >
                    {formatSignedAmount(locale, row.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {links.wallet ? (
        <Link href={links.wallet} className="self-center p-1 text-body-s font-bold text-[var(--color-brand-500)]">
          {t.fullHistory}
        </Link>
      ) : null}
    </>
  );
}

/** «الإشعارات» — the loyalty inbox, newest first; unread rows carry a dot. Opening it marks them read (the host). */
export function NotificationsView(ctx: ViewContext) {
  const { locale, m, lists, now, program, failed } = ctx;
  const items = (lists.notifications ?? null)?.filter((item) => program.features.expiry || item.type !== "points_expiring") ?? null;

  return (
    <Card className="px-3.5 py-1">
      {items === null ? (
        <Loading text={failed.has("notifications") ? m.loyalty.panel.unavailable : m.loyalty.panel.loading} />
      ) : items.length === 0 ? (
        <Loading text={m.loyalty.notifications.empty} />
      ) : (
        <ul className="flex flex-col">
          {items.map((item, index) => {
            const art = notificationArt(item.type);
            const copy = notificationCopy(ctx, item);
            return (
              <li key={item.id} data-read={item.read ? "" : undefined} className={`flex items-start gap-2.5 py-3 ${index ? "border-t border-[var(--color-line)]" : ""}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${art.wash}`}>
                  <Glyph src={art.icon} tone={`bg-current ${art.ink}`} className="size-[18px]" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-body-s font-bold">
                    {item.read ? null : <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />}
                    {copy.title}
                  </span>
                  {copy.body ? <span className="text-caption font-medium leading-[1.5] text-[var(--color-ink-muted)]">{copy.body}</span> : null}
                  <span className="text-caption-xs font-medium text-[var(--color-ink-subtle)]">{formatWhen(locale, item.createdAt, now)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
