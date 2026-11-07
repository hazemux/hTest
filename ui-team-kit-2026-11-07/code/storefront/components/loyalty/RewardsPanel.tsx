"use client";

import * as mo from "motion/react-m";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { FaqList } from "@/components/content/FaqList";
import { MotionScope } from "@/components/ui/motion/MotionScope";
import { DIRECTIONS } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CLARITY_MASK } from "@/lib/analytics/clarity";
import { fill } from "@/lib/loyalty/format";
import { useMotionTransition } from "@/lib/motion/useMotionTransition";

import { EarnView } from "./panel/EarnView";
import { GuestView } from "./panel/GuestView";
import { HistoryView, NotificationsView } from "./panel/HistoryView";
import { HomeView } from "./panel/HomeView";
import { LevelsView } from "./panel/LevelsView";
import { RedeemView } from "./panel/RedeemView";
import { RefListView, ReferralView } from "./panel/ReferralView";
import type { PanelListKey, PanelLists, PanelView, RewardsPanelProps, ViewContext } from "./panel/types";
import { Chevron, Glyph, TierMark } from "./parts";
import { AvatarRing } from "./vip/AvatarRing";

const NO_LISTS: PanelLists = { pointsHistory: null, balanceHistory: null, notifications: null, referrals: null, challenges: null, perks: null };
const NO_FAILURES: ReadonlySet<PanelListKey> = new Set();

/** Views a guest may open: their own root and the FAQ — everything else is a member's. */
const GUEST_VIEWS: ReadonlySet<PanelView> = new Set(["guest", "faq"]);

/**
 * The view the panel opens on. A guest may open only the guest views; a
 * MEMBER never opens the guest root — it would invite someone signed in to
 * create an account (review finding, 2026-10-08).
 */
export function openingView(member: boolean, wanted: PanelView | undefined): PanelView {
  const root: PanelView = member ? "home" : "guest";
  if (!wanted) return root;
  if (member) return wanted === "guest" ? "home" : wanted;
  return GUEST_VIEWS.has(wanted) ? wanted : root;
}

/**
 * «نقاط تشارجر» — the rewards panel (Claude Design `RewardsPanel`): a
 * gradient header with back / history / notifications / close, and nine
 * views pushed inside it. It is the same component in the desktop dropdown
 * and the phone's bottom sheet; the host decides which (`PointsChip`).
 *
 * WHAT IS NOT DRAWN: any section whose feature flag is off (ADR 0043 — hidden,
 * never «قريباً»), any link whose destination is null, and the lazy lists
 * before they arrive («جارٍ التحميل», never an empty list that is not empty).
 *
 * MOTION (ADR 0041): pushing a view slides the NEW one in from the reading
 * end — mirrored in Arabic — and fades it; the old one is gone at once, so a
 * tap never waits on an exit. The first view is the server's final state:
 * nothing animates until the customer moves.
 */
export function RewardsPanel(props: RewardsPanelProps) {
  const { locale, viewer, program, links, onNeed, onClose, layout } = props;
  const m = messagesFor(locale);
  const t = m.loyalty.panel;
  const member = viewer.kind === "member" ? viewer.wallet : null;
  const root: PanelView = member ? "home" : "guest";
  const [view, setView] = useState<PanelView>(() => openingView(member !== null, props.initialView));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [moved, setMoved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const enter = useMotionTransition("base");
  const lists: PanelLists = { ...NO_LISTS, ...props.lists };
  const now = new Date(props.now);

  // The first view's list, if it needs one, is asked for ONCE per mount. An
  // effect event, not a dependency: a host passing an inline callback would
  // otherwise re-ask on every render its own fetch caused — a refetch loop.
  const firstView = useRef(view);
  const needFirst = useEffectEvent(() => onNeed?.(firstView.current));
  useEffect(() => {
    needFirst();
  }, []);

  // After a push, focus follows the customer to the new view's title — a
  // keyboard or screen-reader user otherwise stays on a button that is gone.
  useEffect(() => {
    if (moved) heading.current?.focus();
  }, [view, moved]);

  function go(next: PanelView) {
    if (!member && !GUEST_VIEWS.has(next)) return;
    if (member && next === "guest") return;
    setDirection(next === root ? -1 : 1);
    setMoved(true);
    setView(next);
    onNeed?.(next);
  }

  const back = () => go(view === "refList" ? "referral" : root);
  const isRoot = view === root;
  const ctx: ViewContext = { locale, m, program, now, links, lists, failed: props.failedLists ?? NO_FAILURES, go };
  const unread = member ? member.unreadNotifications : 0;
  const reading = DIRECTIONS[locale] === "rtl" ? -1 : 1;

  const headerButton = "grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-footer-rule)]";

  return (
    <section
      aria-labelledby={titleId}
      data-layout={layout}
      className={`flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)] text-[var(--color-ink)] ${
        layout === "sheet" ? "rounded-t-[16px]" : "rounded-[16px] shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      }`}
    >
      <header className="flex shrink-0 flex-col gap-3 bg-[image:var(--gradient-brand)] px-4 pb-4 pt-3 text-[var(--color-on-primary)]">
        {layout === "sheet" ? <span aria-hidden className="h-1 w-10 self-center rounded-full bg-[var(--color-on-primary)] opacity-55" /> : null}
        <div className="flex items-center gap-2">
          {/* «VIP Experience» 10e: the member's avatar in its tier frame
              (+ the VIP halo and crest dot) leads the band. */}
          {isRoot && member ? <AvatarRing size={40} tier={member.tier?.code} vip={member.vip !== null} src={member.avatar} /> : null}
          {isRoot ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 id={titleId} ref={heading} tabIndex={-1} className="text-heading-m font-bold leading-[1.4] outline-none">
                {program.title ?? t.welcome}
              </h2>
              <p {...CLARITY_MASK} className="text-body-s font-medium opacity-90">
                {member ? (member.firstName ? fill(t.hello, { name: member.firstName }) : t.helloNoName) : t.guestHello}
              </p>
            </div>
          ) : (
            <>
              <button type="button" onClick={back} aria-label={t.back} className={headerButton}>
                <Chevron to="back" tone="bg-current" className="size-4 [mask-size:6px_12px]" />
              </button>
              <h2 id={titleId} ref={heading} tabIndex={-1} className="min-w-0 flex-1 text-heading-m font-bold leading-[1.4] outline-none">
                {t.views[view as keyof typeof t.views] ?? ""}
              </h2>
            </>
          )}
          {member ? (
            <>
              <button type="button" onClick={() => go("history")} aria-label={t.history} aria-pressed={view === "history"} className={headerButton}>
                <Glyph src="/brand/icon-refresh.svg" className="size-5" />
              </button>
              <button type="button" onClick={() => go("notifs")} aria-label={unread > 0 ? `${t.notifications} · ${t.unread}` : t.notifications} aria-pressed={view === "notifs"} className={`relative ${headerButton}`}>
                <Glyph src="/brand/icon-bell.svg" className="size-5" />
                {unread > 0 ? (
                  <span aria-hidden data-unread="" className="absolute end-[7px] top-1.5 size-2 rounded-full bg-[var(--color-secondary)] shadow-[0_0_0_2px_var(--color-brand-500)]" />
                ) : null}
              </button>
            </>
          ) : null}
          <button type="button" onClick={onClose} aria-label={t.close} className={headerButton}>
            <Glyph src="/brand/icon-close.svg" className="size-3" />
          </button>
        </div>
        {isRoot ? (
          <div className="flex flex-wrap gap-2">
            {program.faq.length > 0 ? (
              <button type="button" onClick={() => go("faq")} className="flex items-center gap-1.5 rounded-full bg-[var(--color-footer-rule)] px-3 py-1 text-caption font-bold">
                <Glyph src="/brand/icon-info-circle.svg" className="size-3.5" />
                {t.faq}
              </button>
            ) : null}
            {member?.tier ? (
              <button type="button" onClick={() => go("levels")} className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--color-footer-rule)] px-3 py-1 text-caption font-bold">
                <span className="-my-1">
                  <TierMark code={member.tier.code} size={22} />
                </span>
                {fill(t.tierChip, { tier: member.tier.name, rate: member.tier.rate })}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [background:linear-gradient(var(--color-chip),var(--color-chip)),var(--color-surface)]">
        <MotionScope>
          <mo.div
            key={view}
            data-view={view}
            initial={moved ? { opacity: 0, x: 24 * reading * direction } : false}
            animate={{ opacity: 1, x: 0, transition: enter }}
            className="flex flex-col gap-3 p-3"
          >
            {member ? (
              <MemberView view={view} ctx={{ ...ctx, wallet: member }} onRedeemPerk={props.onRedeemPerk} />
            ) : view === "faq" ? (
              <FaqView ctx={ctx} />
            ) : (
              <GuestView {...ctx} />
            )}
          </mo.div>
        </MotionScope>
      </div>
    </section>
  );
}

function MemberView({ view, ctx, onRedeemPerk }: { view: PanelView; ctx: Parameters<typeof HomeView>[0]; onRedeemPerk?: RewardsPanelProps["onRedeemPerk"] }) {
  switch (view) {
    case "earn":
      return <EarnView {...ctx} rate={ctx.wallet.tier?.rate ?? null} hasPaidOrder={ctx.wallet.hasPaidOrder} />;
    case "redeem":
      return <RedeemView {...ctx} onRedeemPerk={ctx.program.features.perks ? onRedeemPerk : undefined} />;
    case "levels":
      return <LevelsView {...ctx} />;
    case "referral":
      return <ReferralView {...ctx} />;
    case "refList":
      return <RefListView {...ctx} />;
    case "history":
      return <HistoryView {...ctx} />;
    case "notifs":
      return <NotificationsView {...ctx} />;
    case "faq":
      return <FaqView ctx={ctx} />;
    default:
      return <HomeView {...ctx} />;
  }
}

function FaqView({ ctx }: { ctx: ViewContext }) {
  return (
    <div className="rounded-[16px] bg-[var(--color-surface-raised)] px-4 py-2 shadow-[0_0_12px_rgba(0,0,0,0.07)]">
      <FaqList entries={ctx.program.faq} labels={ctx.m.loyalty.faq} searchable={false} />
    </div>
  );
}
