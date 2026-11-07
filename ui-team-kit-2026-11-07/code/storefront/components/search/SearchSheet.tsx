"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { clearRecents, readRecents, removeRecent, saveRecent } from "@/lib/search/recents";

import { SearchPanel } from "./SearchPanel";
import { usePopular, useSearchSuggest } from "./useSearchSuggest";

/**
 * The phone's full-screen search — «Search Mobile» frames 1–8. A native
 * <dialog>: focus trap, Escape and the inert page come from the browser.
 * Opening pushes a history entry so back closes it; the input is focused in
 * the same tap so iOS raises the keyboard. Still a GET form to /search.
 *
 * IT LEAVES THE WAY IT CAME (`cq-sheet`, globals.css). The dialog stays in
 * the DOM after the first open and is closed with `dialog.close()`, which is
 * what lets the sheet's exit run — unmounting it would cut the exit off. Its
 * CONTENT is another matter: it is mounted by the first open (so the suggest
 * hook and the recents ship and run only once someone reaches for search,
 * spec §9), kept through the exit so the sheet does not empty while it sinks,
 * and re-made on the next open so the box always starts from `initialQuery`
 * rather than from what was typed last time.
 */
export default function SearchSheet({ locale, open, onClose, initialQuery = "" }: { locale: Locale; open: boolean; onClose: () => void; initialQuery?: string }) {
  // One counter per OPENING: the content below is keyed by it. "Adjust state
  // while rendering" — no effect needed to notice a new opening.
  const [session, setSession] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((count) => count + 1);
  }
  return session > 0 ? <SheetSession key={session} locale={locale} open={open} onClose={onClose} initialQuery={initialQuery} /> : null;
}
export { SearchSheet };

function SheetSession({ locale, open, onClose, initialQuery }: { locale: Locale; open: boolean; onClose: () => void; initialQuery: string }) {
  const m = messagesFor(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const listboxId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const suggest = useSearchSuggest(locale, query);
  const popular = usePopular(locale, true);

  // The parent may pass a new onClose on every render; the history entry and
  // the listener below must be made once, not once per render.
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Open: modal, focus, one history entry, back closes. Closed by the parent
  // (the entry's own popstate, Cancel, a pick): `close()` — never an unmount —
  // so the exit animation plays and focus goes back to the trigger.
  useEffect(() => {
    const element = dialog.current;
    if (!open) {
      if (element?.open) element.close();
      return;
    }
    if (element && !element.open) element.showModal();
    input.current?.focus({ preventScroll: true });

    // Keep Next's own history state on the entry: a bare object makes its
    // router treat a later popstate onto it as a foreign page and reload.
    window.history.pushState({ ...(window.history.state ?? {}), cqSearch: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  function cancel() {
    if (window.history.state?.cqSearch) window.history.back();
    else closeRef.current();
  }

  return (
    <dialog
      ref={dialog}
      aria-label={m.nav.searchPlaceholder}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      className="cq-sheet fixed inset-0 z-[80] m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-[var(--background)] p-0 text-[var(--color-ink)]"
    >
      <form
        role="search"
        action={`/${locale}/search`}
        onSubmit={() => saveRecent(query)}
        className="absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-3 bg-[var(--background)] px-4"
      >
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-[var(--color-brand-500)] ps-3.5 pe-1.5">
          <span aria-hidden className="block size-5 shrink-0 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
          <input
            ref={input}
            type="search"
            name="q"
            role="combobox"
            aria-expanded={suggest.rows.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            dir="auto"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.nav.searchPlaceholder}
            aria-label={m.nav.searchPlaceholder}
            className="h-full w-0 min-w-0 flex-1 bg-transparent text-body-s font-semibold outline-none placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              aria-label={m.search.clear}
              onClick={() => {
                setQuery("");
                input.current?.focus({ preventScroll: true });
              }}
              className="grid size-9 shrink-0 place-items-center"
            >
              <span className="grid size-5 place-items-center rounded-full bg-[var(--color-ink-subtle)]">
                <span aria-hidden className="block size-2 bg-[var(--background)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </span>
            </button>
          ) : null}
        </label>
        <button type="button" onClick={cancel} className="h-12 text-body-s font-bold text-[var(--color-brand-500)]">
          {m.search.cancel}
        </button>
      </form>

      <div className="absolute inset-x-0 bottom-0 top-16 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] pt-1">
        <SearchPanel
          locale={locale}
          query={query}
          settledQuery={suggest.settledQuery}
          rows={suggest.rows}
          searchedAs={suggest.searchedAs}
          loading={suggest.loading}
          failed={suggest.failed}
          popular={popular}
          recents={recents}
          highlighted={-1}
          listboxId={listboxId}
          variant="sheet"
          onPickRecent={(recent) => setQuery(recent)}
          onRemoveRecent={(recent) => {
            removeRecent(recent);
            setRecents(readRecents());
          }}
          onClearRecents={() => {
            clearRecents();
            setRecents([]);
          }}
          onPick={() => saveRecent(query)}
        />
      </div>
    </dialog>
  );
}
