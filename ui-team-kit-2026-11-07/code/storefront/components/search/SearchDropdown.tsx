"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { saveRecent } from "@/lib/search/recents";

// The suggest hook, the panel and the recents arrive on the first touch of the
// box, not with the page (spec §9: 0 KB of search code on first load).
const Body = dynamic(() => import("./SearchDropdownBody"), { ssr: false });

/**
 * The desktop header's search with its dropdown — frames D1–D2, 560 px wide.
 * This shell is all that ships with the page: a plain GET form (it works before
 * any script) plus the keyboard. Arrow keys move through the hrefs the lazy
 * body reports; Enter opens the highlighted one or submits the form.
 */
export function SearchDropdown({ locale, className = "flex-1" }: { locale: Locale; className?: string }) {
  const m = messagesFor(locale);
  const router = useRouter();
  const listboxId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [hrefs, setHrefs] = useState<string[]>([]);
  // Only a real change re-renders: the body reports on every answer, and an
  // identical list must not.
  const onHrefs = useCallback(
    (next: string[]) => setHrefs((previous) => (previous.length === next.length && previous.every((href, i) => href === next[i]) ? previous : next)),
    [],
  );

  function show() {
    setTouched(true);
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const count = hrefs.length;
    if (event.key === "ArrowDown" && count > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlighted((i) => (i + 1) % count);
    } else if (event.key === "ArrowUp" && count > 0) {
      event.preventDefault();
      setHighlighted((i) => (i <= 0 ? count - 1 : i - 1));
    } else if (event.key === "Enter" && highlighted >= 0 && hrefs[highlighted]) {
      event.preventDefault();
      saveRecent(query);
      setOpen(false);
      router.push(hrefs[highlighted]!);
    } else if (event.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  return (
    <div
      ref={root}
      className={`relative min-w-px ${className}`}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <form
        action={`/${locale}/search`}
        role="search"
        onSubmit={() => saveRecent(query)}
        className="group flex items-center gap-3 rounded-[12px] border border-[var(--color-input-border)] bg-[var(--color-field)] p-4 transition-colors focus-within:border-[var(--color-brand-500)] focus-within:bg-[var(--color-surface)]"
      >
        <span aria-hidden className="block size-5 shrink-0 bg-[var(--color-ink-muted)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-focus-within:bg-[var(--color-brand-500)]" />
        <input
          type="search"
          name="q"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlighted >= 0 ? `${listboxId}-opt-${highlighted}` : undefined}
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onFocus={show}
          onPointerDown={() => setTouched(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={m.nav.searchPlaceholder}
          aria-label={m.nav.searchPlaceholder}
          className="w-0 min-w-px flex-1 bg-transparent text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)] focus-visible:outline-none"
        />
      </form>

      {touched && open ? <Body locale={locale} query={query} highlighted={highlighted} listboxId={listboxId} onHrefs={onHrefs} /> : null}
    </div>
  );
}
