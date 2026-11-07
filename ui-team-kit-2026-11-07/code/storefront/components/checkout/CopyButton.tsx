"use client";

import { useState } from "react";

/**
 * One-click copy for a value a customer has to type into their bank's app —
 * an IBAN, an account number, the order number. Announces «تم النسخ» to a
 * screen reader. Where the clipboard is unavailable the value stays
 * selectable beside the button, so nothing is lost.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  accessibleName,
  className,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  /** What is being copied, for a screen reader: «نسخ الآيبان». */
  accessibleName?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={accessibleName}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className={
        className ??
        "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--color-brand-500)] px-3 text-body-s font-semibold text-[var(--color-brand-500)] transition hover:bg-[var(--color-chip)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
      }
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={1.8}>
        {copied ? <path d="M5 12l4 4 10-10" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>}
      </svg>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
