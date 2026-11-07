"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { clearRecents, readRecents, removeRecent, saveRecent } from "@/lib/search/recents";

import { SearchPanel } from "./SearchPanel";
import { usePopular, useSearchSuggest } from "./useSearchSuggest";

/**
 * The heavy half of the header's search: the suggest hook, the panel and the
 * recents. Loaded on the FIRST touch of the box (`SearchDropdown` imports it
 * lazily), so a page's first load carries none of it (spec §9). It reports the
 * hrefs it shows up to the shell, which owns the keyboard.
 */
export default function SearchDropdownBody({
  locale,
  query,
  highlighted,
  listboxId,
  onHrefs,
}: {
  locale: Locale;
  query: string;
  highlighted: number;
  listboxId: string;
  onHrefs: (hrefs: string[]) => void;
}) {
  const m = messagesFor(locale);
  const router = useRouter();
  const [recents, setRecents] = useState<string[]>(() => readRecents());
  const suggest = useSearchSuggest(locale, query);
  const popular = usePopular(locale, true);

  useEffect(() => {
    onHrefs(suggest.rows.map((row) => row.href));
  }, [suggest.rows, onHrefs]);

  // The search could not run: no panel at all, rather than an empty box.
  if (suggest.failed && suggest.rows.length === 0) return null;

  return (
    <div
      // Keep focus in the input while a row, recent or tile is pressed: Safari
      // and Firefox on macOS do not focus links or buttons on a mouse click,
      // so the box's blur would close the panel before the click landed.
      onMouseDown={(event) => event.preventDefault()}
      className="absolute start-0 top-[calc(100%+8px)] z-50 flex w-[560px] max-w-full flex-col overflow-hidden rounded-[16px] bg-[var(--background)] pt-2 shadow-[0_0_0_1px_var(--color-line),0_16px_40px_rgba(0,0,0,0.14)]">
      <SearchPanel
        locale={locale}
        query={query}
        settledQuery={suggest.settledQuery}
        rows={suggest.rows}
        searchedAs={suggest.searchedAs}
        loading={suggest.loading}
        failed={suggest.failed}
        popular={popular.slice(0, 8)}
        recents={recents}
        highlighted={highlighted}
        listboxId={listboxId}
        variant="dropdown"
        onPickRecent={(recent) => {
          // Picking a recent searches it, and moves it to the top.
          saveRecent(recent);
          router.push(`/${locale}/search?q=${encodeURIComponent(recent)}`);
        }}
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
      <div className="flex gap-4 border-t border-[var(--color-line)] px-5 py-2.5 text-caption text-[var(--color-ink-muted)]">
        <Hint keys="↑ ↓" label={m.search.keyMove} />
        <Hint keys="Enter" label={m.search.keyOpen} />
        <Hint keys="Esc" label={m.search.keyClose} />
      </div>
    </div>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd dir="ltr" className="rounded-[4px] bg-[var(--color-chip)] px-1.5 font-bold text-[var(--color-ink)]">{keys}</kbd>
      {label}
    </span>
  );
}
