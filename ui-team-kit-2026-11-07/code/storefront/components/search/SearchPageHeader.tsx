import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { SearchTrigger } from "./SearchTrigger";

/** R1: back, and a pill with the query that reopens the sheet with it. Phone only. */
export function SearchPageHeader({ locale, query }: { locale: Locale; query: string }) {
  const m = messagesFor(locale);
  return (
    <header className="sticky top-0 z-20 -mx-6 mb-2 flex h-16 items-center gap-2 bg-[var(--background)] px-4 lg:hidden">
      <Link href={`/${locale}`} aria-label={m.search.back} className="grid h-12 w-10 shrink-0 place-items-center">
        <span aria-hidden className="block size-6 bg-[var(--color-ink)] rtl:-scale-x-100 [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5.5px_11.5px]" />
      </Link>
      <SearchTrigger
        locale={locale}
        initialQuery={query}
        className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-[10px] bg-[var(--color-chip)] px-4 text-start text-body-s font-semibold text-[var(--color-ink)]"
      >
        <span aria-hidden className="block size-5 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        <bdi className="truncate">{query}</bdi>
      </SearchTrigger>
    </header>
  );
}
