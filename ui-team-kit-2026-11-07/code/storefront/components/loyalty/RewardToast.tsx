"use client";

import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CURRENCY_ICON } from "@/lib/loyalty/currency-icon";

import { Glyph } from "./parts";
import { LandingCoin } from "./TierCoin";

/**
 * An achievement landing (owner, 2026-11-03): a reward the SERVER granted —
 * the 5th or 10th order, a review, a birthday, a friend's first order, the
 * anniversary (`reward_granted`, `referral_rewarded`, `birthday`) — as the
 * level-up toast's sibling: the brand gradient, the Charger Points coin (`CURRENCY_ICON`) that
 * lands spinning, the inbox's own sentence for it (`notificationCopy`), and
 * the way to the points. Nothing here infers a reward; the host draws it only
 * from an unread notification. Dismissing is the host's (marks it read).
 */
export function RewardToast({
  locale,
  title,
  body,
  pointsHref,
  onDismiss,
  className = "",
}: {
  locale: Locale;
  title: string;
  body: string;
  pointsHref: string | null;
  onDismiss: () => void;
  className?: string;
}) {
  const t = messagesFor(locale).loyalty.toast;
  return (
    <div
      role="status"
      className={`cq-enter flex w-full max-w-[420px] items-center gap-3 rounded-[16px] bg-[image:var(--gradient-brand)] p-4 text-[var(--color-on-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${className}`}
    >
      <LandingCoin rim="gold" art={CURRENCY_ICON} size={56}>
        <Image src={CURRENCY_ICON} alt="" aria-hidden width={56} height={56} unoptimized className="size-14 object-contain" />
      </LandingCoin>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body-l font-extrabold">{title}</p>
        {body ? <p className="text-caption font-semibold opacity-90">{body}</p> : null}
        {pointsHref ? (
          <Link href={pointsHref} className="mt-1 self-start text-caption font-extrabold underline underline-offset-2">
            {t.rewardCta}
          </Link>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label={t.dismiss} className="grid size-8 shrink-0 place-items-center self-start rounded-full bg-[var(--color-footer-rule)]">
        <Glyph src="/brand/icon-close.svg" className="size-3" />
      </button>
    </div>
  );
}
