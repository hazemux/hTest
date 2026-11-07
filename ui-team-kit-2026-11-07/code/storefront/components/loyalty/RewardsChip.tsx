"use client";

import { useCallback, useRef, useState } from "react";

import { newAttemptKey } from "@/lib/checkout/attempt-key";
import type { Locale } from "@/lib/i18n/locales";
import { forgetInboxCheck } from "@/lib/loyalty/inbox-check";
import { programRoute } from "@/lib/loyalty/links";
import type { LoyaltyProgram, LoyaltyViewer } from "@/lib/loyalty/types";

import type { PanelLinks, PanelListKey, PanelLists, PanelView, PerkOutcome } from "./panel/types";
import { PointsChip } from "./PointsChip";

/**
 * WHAT A VIEW NEEDS FROM THE SERVER, by list. Every list is personal and is
 * read through OUR private route (`app/api/loyalty/me/[list]`, `no-store`)
 * only when the view that shows it opens (ADR 0043 §9) — never by the layout.
 */
export function listsFor(view: PanelView, viewer: LoyaltyViewer, program: LoyaltyProgram | null): PanelListKey[] {
  if (viewer.kind !== "member" || !program) return [];
  const wallet = viewer.wallet;
  switch (view) {
    case "home":
      // The locked rewards card needs the board only before the first paid
      // order; the invite card needs the minted link only after it.
      return [
        ...(!wallet.hasPaidOrder ? (["challenges"] as const) : []),
        ...(wallet.hasPaidOrder && program.features.referrals && wallet.referral ? (["referrals"] as const) : []),
      ];
    case "earn":
      return ["challenges"];
    case "redeem":
      return program.features.perks ? ["perks"] : [];
    case "referral":
    case "refList":
      return program.features.referrals ? ["referrals"] : [];
    case "history":
      return ["pointsHistory", "balanceHistory"];
    case "notifs":
      return ["notifications"];
    default:
      return [];
  }
}

/** The route each list is read from. */
const LIST_ROUTE: Record<PanelListKey, string> = {
  pointsHistory: "history?bucket=points",
  balanceHistory: "history?bucket=balance",
  notifications: "notifications",
  challenges: "challenges",
  referrals: "referrals",
  perks: "perks",
};

/**
 * THE HEADER'S REWARDS CONTROL: the chip, and the data its panel needs.
 *
 * The chip draws from the layout's wallet alone (`GET /wallet` — the only
 * loyalty read the layout makes). The PROGRAMME is fetched the first time the
 * panel is wanted — on the chip's first hover/focus/touch, or when the panel
 * opens — from our public, cached route; each personal list when its view
 * opens. A list that fails is named, so its view says «تعذّر التحميل» rather
 * than drawing an empty list that is not empty.
 *
 * Opening the inbox marks it read (`POST /me/notifications/read`), and the
 * bell's dot goes with the answer — never before it.
 */
export function RewardsChip({
  locale,
  currency,
  viewer,
  variant,
  links,
  now,
}: {
  locale: Locale;
  /** The visitor's browsing currency — the programme's money (tier thresholds) is stated in it. */
  currency: string;
  viewer: LoyaltyViewer;
  variant: "desktop" | "compact";
  links: PanelLinks;
  now: string;
}) {
  // The programme is per locale AND currency (its tier thresholds are in the
  // visitor's currency, v0.1.107): kept with the key it was read for, so a
  // currency switch that re-renders this chip reads it again rather than
  // showing the old currency's figures.
  const programKey = programRoute(locale, currency);
  const [loaded, setLoaded] = useState<{ key: string; program: LoyaltyProgram } | null>(null);
  const program = loaded?.key === programKey ? loaded.program : null;
  const [programFailed, setProgramFailed] = useState(false);
  const [lists, setLists] = useState<Partial<PanelLists>>({});
  const [failed, setFailed] = useState<ReadonlySet<PanelListKey>>(new Set());
  const [unread, setUnread] = useState(viewer.kind === "member" ? viewer.wallet.unreadNotifications : 0);
  const asked = useRef(new Set<PanelListKey>());
  const programAsked = useRef<{ key: string; pending: Promise<LoyaltyProgram | null> } | null>(null);

  const loadProgram = useCallback((): Promise<LoyaltyProgram | null> => {
    if (programAsked.current?.key === programKey) return programAsked.current.pending;
    // A retry is «loading» again, not the last attempt's failure.
    setProgramFailed(false);
    const pending = fetch(programKey, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { program: LoyaltyProgram };
        setLoaded({ key: programKey, program: body.program });
        setProgramFailed(false);
        return body.program;
      })
      .catch(() => {
        // Asked again on the next open: a hiccup is not for the life of the page.
        // Only if this was still the current read — an old currency's failure
        // must not undo the new one's.
        if (programAsked.current?.key === programKey) {
          programAsked.current = null;
          setProgramFailed(true);
        }
        return null;
      });
    programAsked.current = { key: programKey, pending };
    return pending;
  }, [programKey]);

  const loadList = useCallback(
    async (key: PanelListKey) => {
      if (asked.current.has(key)) return;
      asked.current.add(key);
      try {
        const route = LIST_ROUTE[key];
        const joiner = route.includes("?") ? "&" : "?";
        const response = await fetch(`/api/loyalty/me/${route}${joiner}locale=${locale}`, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data: PanelLists[typeof key] };
        setLists((current) => ({ ...current, [key]: body.data }));
        setFailed((current) => {
          if (!current.has(key)) return current;
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        if (key === "notifications" && unread > 0) {
          // Seen now: marked read on the server, and the dot goes with ITS answer.
          const read = await fetch(`/api/loyalty/me/notifications`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
          if (read.ok) {
            forgetInboxCheck();
            const answer = (await read.json()) as { unread?: number };
            setUnread(typeof answer.unread === "number" ? answer.unread : 0);
          }
        }
      } catch {
        // Not cached as failed for ever: reopening the view asks again.
        asked.current.delete(key);
        setFailed((current) => new Set(current).add(key));
      }
    },
    [locale, unread],
  );

  const onNeed = useCallback(
    async (view: PanelView) => {
      const loaded = program ?? (await loadProgram());
      for (const key of listsFor(view, viewer, loaded)) void loadList(key);
    },
    [program, loadProgram, loadList, viewer],
  );

  const onRedeemPerk = useCallback(
    async (code: string): Promise<PerkOutcome> => {
      // ONE KEY PER PRESS, minted here in the browser, so a retry the server
      // already applied is answered with the first redemption — never twice.
      const key = newAttemptKey();
      try {
        const response = await fetch(`/api/loyalty/me/perks/${encodeURIComponent(code)}/redeem?locale=${locale}`, {
          method: "POST",
          headers: { Accept: "application/json", "Idempotency-Key": key },
        });
        const body = (await response.json().catch(() => ({}))) as { outcome?: PerkOutcome };
        const outcome = body.outcome ?? "failed";
        if (outcome === "redeemed") {
          asked.current.delete("perks");
          void loadList("perks");
        }
        return outcome;
      } catch {
        return "failed";
      }
    },
    [locale, loadList],
  );

  const shown: LoyaltyViewer = viewer.kind === "member" ? { kind: "member", wallet: { ...viewer.wallet, unreadNotifications: unread } } : viewer;

  return (
    <span onPointerEnter={() => void loadProgram()} onFocusCapture={() => void loadProgram()} onTouchStart={() => void loadProgram()} className="contents">
      <PointsChip
        locale={locale}
        viewer={shown}
        variant={variant}
        program={program}
        programFailed={programFailed}
        now={now}
        links={links}
        lists={lists}
        failedLists={failed}
        onOpen={() => void loadProgram()}
        onNeed={(view) => void onNeed(view)}
        onRedeemPerk={program?.features.perks ? onRedeemPerk : undefined}
      />
    </span>
  );
}
