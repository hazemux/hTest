"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef } from "react";

/**
 * A bottom sheet on the phone, a centred card from `lg` — the account pages'
 * «Profile Mobile» / «Settings Mobile» sheets (2026-09-30). A native
 * `<dialog>`: the focus trap, Escape and the inert page come from the browser.
 *
 * IT WORKS BEFORE ANY SCRIPT LOADS. The trigger is a LINK to the page's own
 * URL state (`fallbackHref`, e.g. `?sheet=avatar`); the page renders the sheet
 * `openInitially`, and its close is a link back (`closeHref`). With the script,
 * the same link opens the dialog in place instead of navigating.
 *
 * The dialog is always in the DOM, so controls inside it that belong to a form
 * elsewhere on the page (`form="…"`) are submitted with it whether or not the
 * sheet was ever opened.
 */
export function Sheet({
  title,
  closeLabel,
  fallbackHref,
  closeHref,
  openInitially = false,
  triggerLabel,
  triggerClassName,
  trigger,
  children,
}: {
  title: string;
  closeLabel: string;
  fallbackHref: string;
  closeHref: string;
  openInitially?: boolean;
  /** The trigger's accessible name when its content is not words. */
  triggerLabel?: string;
  triggerClassName?: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const search = useSearchParams()?.toString() ?? "";

  function open() {
    const element = dialog.current;
    if (!element || element.open) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }

  function close() {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.close === "function") element.close();
    else element.removeAttribute("open");
  }

  // Opened by the URL (no script at the time of the click): once the script
  // is here, make it the modal it would have been.
  useEffect(() => {
    const element = dialog.current;
    if (!openInitially || !element || typeof element.showModal !== "function") return;
    if (element.open) element.close();
    element.showModal();
  }, [openInitially]);

  // A link inside the sheet that moves the page to another URL state (the
  // card's «حذف البطاقة» opening its confirmation) closes this sheet, rather
  // than leaving it open over the next one.
  useEffect(() => {
    const element = dialog.current;
    if (openInitially || !element?.open) return;
    if (typeof element.close === "function") element.close();
    else element.removeAttribute("open");
  }, [search, openInitially]);

  return (
    <>
      <Link
        href={fallbackHref}
        scroll={false}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          open();
        }}
        className={triggerClassName}
      >
        {trigger}
      </Link>

      <dialog
        ref={dialog}
        open={openInitially || undefined}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="cq-sheet fixed inset-x-0 bottom-0 z-[70] m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[20px] bg-[var(--background)] p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-[var(--color-backdrop)] lg:inset-0 lg:m-auto lg:max-w-[440px] lg:rounded-[20px]"
      >
        <div className="flex max-h-[inherit] flex-col gap-3.5 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 lg:pt-5">
          <span aria-hidden className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-body-l font-bold leading-[1.4] lg:text-heading-m">
              {title}
            </h2>
            <Link
              href={closeHref}
              scroll={false}
              aria-label={closeLabel}
              onClick={(event) => {
                event.preventDefault();
                close();
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-chip)]"
            >
              <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            </Link>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
