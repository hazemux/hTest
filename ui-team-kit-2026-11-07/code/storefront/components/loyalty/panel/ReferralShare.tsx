"use client";

import { useSyncExternalStore } from "react";

import { CopyButton } from "@/components/checkout/CopyButton";
import type { Messages } from "@/lib/i18n/messages";
import { fill } from "@/lib/loyalty/format";

import { Glyph } from "../parts";

const noop = () => () => {};

/** Whether this browser has the system share sheet. Never on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );
}

/**
 * The invite link with its copy button and the share row (WhatsApp, X, the
 * system sheet, email). Every share is a plain link to the service's own
 * share URL — nothing about the customer is sent anywhere but the link they
 * chose to share. «مشاركة» is drawn only where the browser has a share sheet.
 */
export function ReferralShare({
  m,
  link,
  compact = false,
}: {
  m: Messages;
  /** The full invite URL the API made (`GET /me/referrals`). */
  link: string;
  /** The home card's small row of round icons, versus the referral screen's labelled grid. */
  compact?: boolean;
}) {
  const t = m.loyalty.share;
  const canShare = useCanShare();
  const message = fill(t.message, { link });
  const encoded = encodeURIComponent(message);

  const targets = [
    { key: "whatsapp", label: t.whatsapp, icon: "/brand/icon-whatsapp.svg", href: `https://wa.me/?text=${encoded}`, wash: "bg-[var(--color-success)]", ink: "bg-[var(--color-on-primary)]" },
    { key: "x", label: t.x, icon: "/brand/icon-x.svg", href: `https://x.com/intent/post?text=${encoded}`, wash: "bg-[var(--color-surface-subtle)]", ink: "bg-[var(--color-ink)]" },
    ...(canShare ? [{ key: "share", label: t.more, icon: "/brand/icon-share.svg", href: null, wash: "bg-[var(--color-surface-subtle)]", ink: "bg-[var(--color-ink)]" }] : []),
    { key: "email", label: t.email, icon: "/brand/icon-email.svg", href: `mailto:?body=${encoded}`, wash: "bg-[var(--color-surface-subtle)]", ink: "bg-[var(--color-ink)]" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[12px] border border-[var(--color-input-border)] bg-[var(--color-field)] py-1.5 pe-1.5 ps-3">
        <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-body-s font-semibold">
          {link}
        </span>
        <CopyButton value={link} label={t.copy} copiedLabel={t.copied} accessibleName={t.copyLink} />
      </div>
      <ul className={compact ? "flex items-center gap-2" : "grid grid-cols-4 gap-2"}>
        {targets.map((target) => {
          const circle = (
            <span className={`grid place-items-center rounded-full ${target.wash} ${compact ? "size-10" : "size-12"}`}>
              <Glyph src={target.icon} tone={target.ink} className={compact ? "size-[18px]" : "size-[22px]"} />
            </span>
          );
          const body = (
            <>
              {circle}
              {compact ? <span className="sr-only">{target.label}</span> : target.label}
            </>
          );
          const className = "flex flex-col items-center gap-1 text-caption-xs font-bold text-[var(--color-ink-muted)]";
          return (
            <li key={target.key}>
              {target.href ? (
                <a href={target.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {body}
                </a>
              ) : (
                <button
                  type="button"
                  className={className}
                  onClick={() => {
                    navigator.share?.({ text: message, url: link }).catch(() => {});
                  }}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
