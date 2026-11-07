"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { forgetInboxCheck, inboxAlreadyChecked, markInboxChecked } from "@/lib/loyalty/inbox-check";
import { programRoute } from "@/lib/loyalty/links";
import { notificationCopy } from "@/lib/loyalty/notification-copy";
import type { LoyaltyNotification, LoyaltyProgram } from "@/lib/loyalty/types";

import { RewardToast } from "./RewardToast";
import { TierUpToast } from "./TierUpToast";

/** Rewards the server granted that land as an achievement (`RewardToast`) — only with `coin` (CELEBRATIONS_ENABLED). */
export const ACHIEVEMENT_TYPES: readonly string[] = ["reward_granted", "referral_rewarded", "birthday"];

/** Notifications already celebrated in this browser — a courtesy so a closed tab does not replay one. */
const SEEN_KEY = "cq_tier_up_seen";

function seen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-20) : [];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), id].slice(-20)));
  } catch {
    // Storage blocked: the server's read mark is what really counts.
  }
}


/**
 * «مبروك! وصلت إلى مستوى …» — and, with celebrations on, an achievement
 * (`RewardToast`) — shown ONCE, and only from a notification the SERVER
 * wrote and the customer has not read (HANDBOOK
 * «Motion»: success is the server's; nothing here infers a level change).
 *
 * No layout fetch: the layout passes only `GET /wallet`'s unread count, and
 * only when it is above zero does this ask our private route for the inbox —
 * after hydration, like the review prompt. Dismissing marks THAT notification
 * read on the server; the id is also remembered in this browser so leaving
 * without dismissing does not replay it. Fixed under the header, never in a
 * bottom corner, where the support chat sits.
 */
export function TierUpHost({
  locale,
  currency,
  unread,
  benefitsHref,
  coin = false,
}: {
  locale: Locale;
  currency: string;
  unread: number;
  benefitsHref: string | null;
  /** The badge lands as a spinning coin (`TierCoin`, `CELEBRATIONS_ENABLED`). */
  coin?: boolean;
}) {
  const [shown, setShown] = useState<
    | { id: string; kind: "tier"; tier: { code: string; name: string; rate: string } }
    | { id: string; kind: "reward"; title: string; body: string }
    | null
  >(null);

  useEffect(() => {
    if (unread <= 0 || inboxAlreadyChecked(unread)) return;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await fetch(`/api/loyalty/me/notifications?locale=${locale}`, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!inbox.ok) return;
        const { data } = (await inbox.json()) as { data: LoyaltyNotification[] };
        const done = seen();
        const fresh = (item: LoyaltyNotification) => !item.read && !done.includes(item.id);
        // A level-up first; otherwise, with celebrations on, the newest reward.
        const latest = data.find((item) => item.type === "tier_up" && fresh(item)) ?? (coin ? data.find((item) => ACHIEVEMENT_TYPES.includes(item.type) && fresh(item)) : undefined);
        if (!latest) {
          markInboxChecked(unread);
          return;
        }
        const programAnswer = await fetch(programRoute(locale, currency), { headers: { Accept: "application/json" } });
        if (!programAnswer.ok) return;
        const { program } = (await programAnswer.json()) as { program: LoyaltyProgram };
        if (cancelled) return;
        if (latest.type === "tier_up") {
          const code = latest.params.to ?? latest.params.level;
          const tier = program.tiers.find((entry) => entry.code === code);
          if (!tier) {
            markInboxChecked(unread);
            return;
          }
          remember(latest.id);
          setShown({ id: latest.id, kind: "tier", tier: { code: tier.code, name: tier.name, rate: tier.rate } });
          return;
        }
        const copy = notificationCopy({ locale, m: messagesFor(locale), program, now: new Date() }, latest);
        remember(latest.id);
        setShown({ id: latest.id, kind: "reward", title: copy.title, body: copy.body });
      } catch {
        // A nudge, not a promise: any failure is simply no toast.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, currency, unread, coin]);

  const top = useBelowTopBars(shown !== null);

  if (!shown) return null;

  const dismiss = () => {
    const id = shown.id;
    setShown(null);
    forgetInboxCheck();
    void fetch(`/api/loyalty/me/notifications`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
  };

  return (
    // Over the header, 8px under the bars above it (UI team, 2026-11-04), and
    // inside the page's own 24px gutters so its edges line up with the header.
    <div className="pointer-events-none fixed inset-x-6 z-[56] flex justify-center" style={{ top }}>
      {shown.kind === "tier" ? (
        <TierUpToast locale={locale} tier={shown.tier} benefitsHref={benefitsHref} coin={coin} className="pointer-events-auto" onDismiss={dismiss} />
      ) : (
        <RewardToast locale={locale} title={shown.title} body={shown.body} pointsHref={benefitsHref} className="pointer-events-auto" onDismiss={dismiss} />
      )}
    </div>
  );
}

/** The gap between the last bar above the header and the toast (UI team, 2026-11-04). */
const BELOW_BARS_PX = 8;

/**
 * Where a toast over the header starts: 8px under the lowest of the bars that
 * sit above it and are on screen — the status banner and the announcement
 * (`[data-status-banner]`, `[data-announcement]`) — or 8px from the top once
 * they are closed or scrolled away. Measured, not guessed: either bar may be
 * there or not, and the announcement wraps to two lines on a phone. Follows
 * the page while the toast is up; does nothing while it is not.
 */
function useBelowTopBars(active: boolean): number {
  const [top, setTop] = useState(BELOW_BARS_PX);
  useLayoutEffect(() => {
    if (!active) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bottoms = [...document.querySelectorAll<HTMLElement>("[data-status-banner], [data-announcement]")]
        .map((bar) => bar.getBoundingClientRect())
        .filter((box) => box.height > 0 && box.bottom > 0)
        .map((box) => box.bottom);
      setTop(Math.max(0, ...bottoms) + BELOW_BARS_PX);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
    };
  }, [active]);
  return top;
}
