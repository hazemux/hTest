"use client";

import { useEffect, useRef, useState } from "react";

import { CLARITY_MASK } from "@/lib/analytics/clarity";
import { notify } from "@/lib/notifications/client";

type Labels = { code: string; copy: string; copied: string; copyFailed: string };

/**
 * The code, and a button that copies it.
 *
 * "Copied" appears only AFTER the clipboard write resolved — a success
 * message for a copy that did not happen sends the customer to the store with
 * nothing to paste. If the browser refuses (no clipboard API, an insecure
 * context, a denied permission), the code is SELECTED for them and they are
 * told to copy it themselves; the code is always visible and selectable, so
 * nothing depends on this script at all.
 *
 * The copy is counted with a beacon to our own route handler after it
 * succeeded — fire-and-forget, never awaited, never shown.
 */
export function CopyCodeButton({ couponId, code, labels }: { couponId: string; code: string; labels: Labels }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(code);
      setState("copied");
      notify("coupon.copied");
      try {
        navigator.sendBeacon?.(`/api/partner-coupons/${encodeURIComponent(couponId)}/copied`);
      } catch {
        // A lost count is not the customer's problem.
      }
    } catch {
      setState("failed");
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) selection.selectAllChildren(node);
    }
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div {...CLARITY_MASK} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[8px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2">
          <span className="text-caption text-[var(--color-ink-muted)]">{labels.code}</span>
          <code
            ref={codeRef}
            dir="ltr"
            translate="no"
            className="min-w-0 select-all truncate font-mono text-body-l font-bold lg:text-heading-m tracking-wide text-[var(--color-ink)]"
          >
            {code}
          </code>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-[8px] bg-[var(--color-primary)] px-4 text-body-s font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-pressed)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {state === "copied" ? labels.copied : labels.copy}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-1 min-h-[1.5em] text-caption leading-[1.5]">
        {state === "failed" ? <span className="text-[var(--color-ink-muted)]">{labels.copyFailed}</span> : null}
      </p>
    </div>
  );
}
