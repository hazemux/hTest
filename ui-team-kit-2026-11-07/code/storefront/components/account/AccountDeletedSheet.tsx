"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { AccountSheet } from "./AccountSheet";

/**
 * «تم حذف الحساب» — `6847:90062`: the goodbye sheet, with one «انهاء».
 *
 * ON A PUBLIC PAGE, FROM THE URL. The delete action has already ended the
 * session, so an account route would send the visitor to sign in before
 * this could be shown; it redirects to the home page with
 * `?account_deleted=1` instead. The flag is spent on sight (`replaceState`),
 * so a refresh or the back button never says goodbye twice.
 */
export function AccountDeletedSheet({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={null}>
      <Sheet locale={locale} />
    </Suspense>
  );
}

function Sheet({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);
  const flagged = useSearchParams()?.get("account_deleted") === "1";
  const [open, setOpen] = useState(false);
  const [wasFlagged, setWasFlagged] = useState(false);
  if (flagged !== wasFlagged) {
    setWasFlagged(flagged);
    if (flagged) setOpen(true);
  }

  useEffect(() => {
    if (!flagged) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("account_deleted");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [flagged]);

  if (!open) return null;

  return (
    <AccountSheet
      onClose={() => setOpen(false)}
      closeLabel={m.account.close}
      labelledBy="account-deleted-title"
      title={m.account.deletedTitle}
      lead={m.account.deletedLead}
      tone="error"
    >
      <button
        type="button"
        autoFocus
        onClick={() => setOpen(false)}
        className="w-full rounded-[12px] bg-[var(--color-brand-500)] px-6 py-4 text-body-s font-semibold text-[var(--color-on-primary)]"
      >
        {m.account.deletedDone}
      </button>
    </AccountSheet>
  );
}
