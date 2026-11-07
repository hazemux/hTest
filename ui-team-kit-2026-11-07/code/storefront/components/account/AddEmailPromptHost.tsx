"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { SubmitButton } from "@/components/ui/SubmitButton";
import { startEmailChange } from "@/lib/account/profile-actions";
import { EMAIL_PROMPT_SNOOZE_KEY, emailPromptAllowedOn, emailPromptDue, emailPromptSnoozeUntil } from "@/lib/account/email-prompt";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { CLARITY_MASK } from "@/lib/analytics/clarity";

/** Long enough for the page to settle, and for a review prompt to take its turn first. */
const OPEN_AFTER_MS = 1500;

/**
 * «أضف بريدك الإلكتروني» (owner, 2026-10-26): a customer who signed in with a
 * phone alone gets no message about their orders — those go by email — and
 * earns no points for an email. This sheet asks for one, once the page has
 * settled, on browsing pages (`emailPromptAllowedOn`); «لاحقاً» keeps it away
 * for seven days. No design comp: built to the design system, the same native
 * `<dialog>` sheet as the review prompt.
 *
 * Submitting uses the profile's own email flow (`startEmailChange`): it asks a
 * step-up when the API wants one, mails the code and opens the code screen —
 * nothing new on the API, no browser-to-API call.
 */
export function AddEmailPromptHost({ locale, needsEmail, rewardPts }: { locale: Locale; needsEmail: boolean; rewardPts: number | null }) {
  const pathname = usePathname() ?? "";
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The page the sheet opened on. It belongs to that page only: once the
  // customer is anywhere else (its own «متابعة» navigates), it is closed —
  // before 2026-10-27 it stayed open as a modal over the step-up page, empty,
  // and «متابعة» looked as if it did nothing.
  const [openOn, setOpenOn] = useState<string | null>(null);
  // Leaving the page forgets it (React's reset-on-change during render, not
  // an effect): coming back must wait and check like any other page, never
  // reopen at once.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpenOn(null);
  }
  const open = openOn !== null && openOn === pathname;
  const m = messagesFor(locale).account;

  useEffect(() => {
    if (!needsEmail || !emailPromptAllowedOn(pathname)) return;
    let snoozed: string | null = null;
    try {
      snoozed = window.localStorage.getItem(EMAIL_PROMPT_SNOOZE_KEY);
    } catch {
      // Storage refused (private mode): ask — closing it still works for this page.
    }
    if (!emailPromptDue(Date.now(), snoozed)) return;

    const timer = window.setTimeout(() => {
      // Another sheet is up (the review prompt): this one waits for a later page.
      if (document.querySelector("dialog[open]")) return;
      setOpenOn(pathname);
    }, OPEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [needsEmail, pathname]);

  // The sheet exists only while it is showing: a closed one would still put an
  // email field on every page — checkout's included — for a phone-only customer.
  const showing = needsEmail && open && emailPromptAllowedOn(pathname);

  useEffect(() => {
    const element = dialog.current;
    if (!showing || !element || element.open) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }, [showing]);

  function later() {
    try {
      window.localStorage.setItem(EMAIL_PROMPT_SNOOZE_KEY, emailPromptSnoozeUntil(Date.now()));
    } catch {
      // Nothing to keep it in: it may ask again on the next page.
    }
    setOpenOn(null);
  }

  if (!showing) return null;

  const points = rewardPts === null ? null : rewardPts.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        later();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) later();
      }}
      className="cq-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[20px] bg-[var(--background)] p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[var(--color-backdrop)] lg:inset-0 lg:m-auto lg:max-w-[440px] lg:rounded-[20px]"
    >
      <form action={startEmailChange} className="flex max-h-[inherit] flex-col gap-3.5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 lg:pt-5">
        <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={later}
            aria-label={m.emailPromptClose}
            className="-me-2 grid size-11 place-items-center rounded-full text-[var(--color-ink-muted)] hover:bg-[var(--color-chip)]"
          >
            <span aria-hidden className="block size-5 bg-current [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          </button>
        </div>
        <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--color-brand-50)]">
          <span className="block size-7 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-email.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        </span>
        <h2 id={titleId} className="text-center text-body-l font-bold leading-[1.4] lg:text-heading-m">
          {m.emailPromptTitle}
        </h2>
        <p className="text-center text-body-s text-[var(--color-ink-muted)]">{m.emailPromptLead}</p>
        {points ? (
          <p className="mx-auto rounded-full bg-[var(--color-warning-wash)] px-3 py-1.5 text-caption font-semibold text-[var(--color-warning-strong)]">
            {m.emailPromptPoints.replace("{points}", points)}
          </p>
        ) : null}
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="flow" value="add" />
        <label className="flex flex-col gap-1.5">
          <span className="text-caption font-bold">{m.emailPromptEmail}</span>
          <input
            type="email"
            name="email"
            {...CLARITY_MASK}
            required
            maxLength={255}
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            placeholder="name@mail.com"
            className="h-12 rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-body-m outline-none focus:border-[var(--color-brand-500)]"
          />
        </label>
        <SubmitButton className="h-12 rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold text-[var(--color-on-cta)]">
          {m.emailPromptContinue}
        </SubmitButton>
        <button type="button" onClick={later} className="h-11 rounded-[12px] text-body-s font-bold text-[var(--color-ink-muted)]">
          {m.emailPromptLater}
        </button>
        <p className="text-center text-caption text-[var(--color-ink-muted)]">{m.emailPromptStepUpNote}</p>
      </form>
    </dialog>
  );
}
