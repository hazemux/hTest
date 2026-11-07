"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { WELCOME_BACK_DONE_KEY, welcomeBackAllowedOn, welcomeBackBody } from "@/lib/account/welcome-back";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «أهلاً بعودتك» (owner, 2026-10-27): no account moved over from the old
 * store, so a returning customer arrives with a new, empty-looking account.
 * Once per browser, on the first browsing page after signing in or up, this
 * sheet says how many of their old orders were found and where they are
 * («طلباتي» › «طلبات سابقة من المتجر القديم», ADR 0047). Nothing for a customer
 * the old store does not know.
 *
 * Asks `/api/account/legacy-welcome` once per browser: the mark is set when
 * the answer comes back (none found, or the sheet shown), so an account with
 * no old orders costs one request. No design comp: built to the design
 * system, the same native `<dialog>` sheet as the add-your-email prompt — and
 * drawn only while it shows.
 */
export function WelcomeBackHost({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const pathname = usePathname() ?? "";
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [count, setCount] = useState<number | null>(null);
  const m = messagesFor(locale).account;

  useEffect(() => {
    if (!signedIn || !welcomeBackAllowedOn(pathname)) return;
    try {
      if (window.localStorage.getItem(WELCOME_BACK_DONE_KEY)) return;
    } catch {
      // Storage refused (private mode): ask — the answer is cheap and harmless.
    }

    let cancelled = false;
    fetch(`/api/account/legacy-welcome?locale=${locale}`, { cache: "no-store" })
      .then((response) => (response.status === 200 ? (response.json() as Promise<{ count: number }>) : null))
      .then((found) => {
        // A guest or an archive switched off (204): ask again on a later page.
        if (cancelled || found === null) return;
        // None found: nothing to say, now or later. Found: marked done only
        // once the sheet has actually opened (below).
        if (found.count > 0) setCount(found.count);
        else markDone();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, pathname, locale]);

  useEffect(() => {
    const element = dialog.current;
    if (count === null || !element || element.open) return;
    // Checked at the moment of opening, not when the answer came: another
    // sheet (a review prompt, the add-your-email prompt) may have opened in
    // between. Then this one stays closed and tries again on the next
    // browsing page — not marked done.
    if (!welcomeBackAllowedOn(pathname) || document.querySelector("dialog[open]")) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    markDone();
  }, [count, pathname]);

  if (count === null) return null;

  const close = () => setCount(null);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="cq-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[20px] bg-[var(--background)] p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[var(--color-backdrop)] lg:inset-0 lg:m-auto lg:max-w-[440px] lg:rounded-[20px]"
    >
      <div className="flex max-h-[inherit] flex-col gap-3.5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 lg:pt-5">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--color-brand-50)]">
          <span className="block size-7 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-account-orders.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </span>
        <h2 id={titleId} className="text-center text-body-l font-bold leading-[1.4] lg:text-heading-m">
          {m.welcomeBackTitle}
        </h2>
        <p className="text-center text-body-s text-[var(--color-ink-muted)]">{welcomeBackBody(m.welcomeBackBody, count, locale)}</p>
        <Link
          href={`/${locale}/account/orders#legacy-orders-title`}
          onClick={close}
          className="grid h-12 place-items-center rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold text-[var(--color-on-cta)]"
        >
          {m.welcomeBackCta}
        </Link>
        <button type="button" onClick={close} className="h-11 rounded-[12px] text-body-s font-bold text-[var(--color-ink-muted)]">
          {m.welcomeBackClose}
        </button>
      </div>
    </dialog>
  );
}

function markDone(): void {
  try {
    window.localStorage.setItem(WELCOME_BACK_DONE_KEY, "1");
  } catch {
    // Nothing to keep it in: it may welcome again on the next page.
  }
}
