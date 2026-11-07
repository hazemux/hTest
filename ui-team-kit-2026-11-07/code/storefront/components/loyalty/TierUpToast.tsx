"use client";

import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { fill } from "@/lib/loyalty/format";

import { Glyph, TierMark } from "./parts";
import { TierCoin } from "./TierCoin";

/**
 * The level-up celebration (Claude Design «Loyalty Storefront», notifications
 * & toasts): the brand gradient, the new level's mark popping in (`cq-pop`,
 * CSS — collapsed under reduced motion), what the customer earns now, and a
 * way to the levels.
 *
 * NOT AN ALERT-BAR ENTRY: the registry's alerts are static sentences in two
 * tones; this one carries the level and the rate. It is drawn ONLY from a
 * `tier_up` notification the server wrote — success is the server's
 * (HANDBOOK «Motion»), so nothing here infers a level change on its own.
 * Dismissing is the host's (mark the notification read); no timer hides it.
 */
export function TierUpToast({
  locale,
  tier,
  benefitsHref,
  onDismiss,
  coin = false,
  className = "",
}: {
  locale: Locale;
  tier: { code: string; name: string; rate: string };
  benefitsHref: string | null;
  onDismiss: () => void;
  /** Land the badge as a spinning coin (`TierCoin`) instead of the CSS pop. */
  coin?: boolean;
  className?: string;
}) {
  const t = messagesFor(locale).loyalty.toast;
  return (
    <div
      role="status"
      className={`cq-enter flex w-full max-w-[420px] items-center gap-3 rounded-[16px] bg-[image:var(--gradient-brand)] p-4 text-[var(--color-on-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${className}`}
    >
      {coin ? (
        <TierCoin code={tier.code} size={56} />
      ) : (
        <span className="cq-pop">
          <TierMark code={tier.code} size={56} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body-l font-extrabold">{fill(t.tierUpTitle, { tier: tier.name })}</p>
        <p className="text-caption font-semibold opacity-90">{fill(t.tierUpBody, { rate: tier.rate })}</p>
        {benefitsHref ? (
          <Link href={benefitsHref} className="mt-1 self-start text-caption font-extrabold underline underline-offset-2">
            {t.tierUpCta}
          </Link>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label={t.dismiss} className="grid size-8 shrink-0 place-items-center self-start rounded-full bg-[var(--color-footer-rule)]">
        <Glyph src="/brand/icon-close.svg" className="size-3" />
      </button>
    </div>
  );
}
