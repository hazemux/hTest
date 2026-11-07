"use client";

import Link from "next/link";
import { useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { rememberVipUpsellDismissed, vipUpsellDismissedInBrowser } from "@/lib/loyalty/vip-upsell";

import { VipCrestMono } from "./VipCrest";

/**
 * «وفّر رسوم الدفع مع VIP» — under a non-member's processing fee («VIP
 * Experience» 8b/8d/8f): a link to the VIP page and a 44 px dismiss. Once
 * dismissed it stays hidden for the session (`lib/loyalty/vip-upsell.ts`).
 *
 * IT LEAVES IN CSS, not through Motion: a 150 ms fade on the canvas's exit
 * easing, then `display: none` transitioned discretely — the store's
 * `cq-sheet` technique (`.cq-vip-upsell[data-leaving]`, globals.css). No timer
 * and no animation callback removes it (HANDBOOK «Motion»): it is `inert` the
 * moment it is dismissed, and the fade only follows. Measured: Motion's
 * presence layer here put ~24 KB gzipped of its core on a checkout that
 * shipped none — for one fade.
 */
export function VipUpsell({ locale, href, initiallyDismissed = false }: { locale: Locale; href: string; initiallyDismissed?: boolean }) {
  const t = messagesFor(locale).loyalty.checkout;
  // Removed rather than hidden only when it was dismissed before THIS mount
  // (the server read the cookie, or a re-priced method brought it back).
  const [gone] = useState(() => initiallyDismissed || vipUpsellDismissedInBrowser());
  const [leaving, setLeaving] = useState(false);

  if (gone) return null;

  return (
    <div
      data-vip-upsell=""
      data-leaving={leaving ? "" : undefined}
      inert={leaving}
      aria-hidden={leaving || undefined}
      className="cq-vip-upsell -mt-1 flex items-center gap-2 text-caption font-bold lg:text-body-s"
    >
      <VipCrestMono className="size-4 bg-[var(--color-brand-500)]" />
      <Link href={href} className="flex min-h-8 flex-1 items-center text-[var(--color-brand-500)]">
        {t.upsell}
      </Link>
      <button
        type="button"
        onClick={() => {
          rememberVipUpsellDismissed();
          setLeaving(true);
        }}
        aria-label={t.upsellDismiss}
        className="-my-1.5 -me-3 grid size-11 shrink-0 place-items-center rounded-[12px]"
      >
        <span aria-hidden className="block size-2.5 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
      </button>
    </div>
  );
}
