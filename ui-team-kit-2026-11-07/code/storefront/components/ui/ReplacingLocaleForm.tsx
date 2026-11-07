"use client";

import { useState, type SubmitEvent, type ReactNode } from "react";

import { isLocale } from "@/lib/i18n/locales";
import { replaceCurrentEntry } from "@/lib/navigation/history";
import { armPortal } from "@/lib/portal/arm";
import { internalPathOr } from "@/lib/navigation/internal-path";

/**
 * The language switch's `<form>`, switching WITHOUT adding a history entry.
 *
 * A plain POST answered by a 303 is a navigation, and a navigation PUSHES:
 * after A → B → «English», history held A, /ar/B and /en/B, so Back from the
 * English page returned to the same page in Arabic instead of to A. Changing
 * language is not a place the customer went; it is the place they were,
 * re-read.
 *
 * PROGRESSIVE ENHANCEMENT, as with `AutoSubmitSelect`. Without JavaScript the
 * form still posts and redirects exactly as before. With it, the submit posts
 * the same fields in the background (the route sets the cookie on the 303,
 * which the browser keeps even though `redirect: "manual"` stops it following)
 * and then REPLACES the current entry with the page in the other language — a
 * full load, because `lang` and `dir` belong to the locale layout. If the
 * background post fails for any reason, the form is submitted the old way:
 * the switch may push an entry, but it never silently does nothing.
 */
export function ReplacingLocaleForm({ className, children }: { className?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    event.preventDefault();
    if (busy) return;
    setBusy(true);

    const fields = new FormData(form);
    // Before the request, so the ring's chunk loads while it is in flight;
    // the portal opens where the switch was pressed. Nothing unless the
    // flag's head script ran (`lib/portal/arm.ts`).
    const to = fields.get("locale");
    if (typeof to === "string" && isLocale(to)) armPortal(to, event.nativeEvent.submitter);
    try {
      await fetch(form.action, { method: "POST", body: fields, redirect: "manual", credentials: "same-origin" });
      replaceCurrentEntry(internalPathOr(fields.get("next"), "/"));
    } catch {
      setBusy(false);
      form.submit();
    }
  }

  return (
    <form action="/api/preferences" method="post" onSubmit={onSubmit} aria-busy={busy || undefined} className={className}>
      {children}
    </form>
  );
}
