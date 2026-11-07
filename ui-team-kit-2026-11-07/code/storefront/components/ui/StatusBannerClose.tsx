"use client";

import { useEffect, useSyncExternalStore } from "react";

import { STATUS_BANNER_HIDDEN_ATTR, STATUS_BANNER_SESSION_KEY } from "@/lib/content/status-banner";

/** The longest timer a browser keeps (~24.8 days); a later end is re-checked on the next page load. */
const MAX_TIMER_MS = 2_147_483_647;

const noSubscribe = () => () => {};

function hide(fingerprint: string): void {
  document.documentElement.setAttribute(STATUS_BANNER_HIDDEN_ATTR, fingerprint);
}

/**
 * The status banner's «×», and its clock.
 *
 * DRAWN ONLY ONCE HYDRATED. Closing remembers the banner in this tab's
 * `sessionStorage`, which only a script can write — so with JavaScript off
 * there is no «×» (a button that does nothing is worse than none, HANDBOOK
 * §5). Until then an empty box of the button's size holds its place, so the
 * banner's words do not re-wrap — and the page does not move — when it
 * appears.
 *
 * CLOSING hides the banner through the same `<html>` attribute the pre-paint
 * script sets (`statusBannerScript`), so a closed banner stays closed on every
 * page of this visit and never flashes; new words are a new fingerprint and
 * show again.
 *
 * ITS END: a tab left open past `expiresAt` hides the banner then; and a page
 * drawn before the end but opened after it (the shared copy is kept up to the
 * settings window) is hidden on arrival — by the pre-paint script, and here
 * again for a page the script never ran on.
 */
export function StatusBannerClose({ fingerprint, expiresAt, label }: { fingerprint: string; expiresAt: number | null; label: string }) {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STATUS_BANNER_SESSION_KEY) === fingerprint) hide(fingerprint);
    } catch {
      // Storage refused (a locked-down browser): the banner simply stays.
    }
    if (expiresAt === null) return;
    const left = expiresAt - Date.now();
    if (left <= 0) {
      hide(fingerprint);
      return;
    }
    if (left > MAX_TIMER_MS) return;
    const timer = window.setTimeout(() => hide(fingerprint), left);
    return () => window.clearTimeout(timer);
  }, [fingerprint, expiresAt]);

  if (!hydrated) return <span aria-hidden className="block size-8 shrink-0" />;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        try {
          window.sessionStorage.setItem(STATUS_BANNER_SESSION_KEY, fingerprint);
        } catch {
          // Not remembered for the next page — still hidden on this one.
        }
        hide(fingerprint);
      }}
      className="grid size-8 shrink-0 place-items-center rounded-full text-heading-m leading-none hover:bg-[var(--color-action-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
    >
      ×
    </button>
  );
}
