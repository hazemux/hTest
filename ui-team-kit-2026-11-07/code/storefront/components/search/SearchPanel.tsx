"use client";

import Image from "next/image";

import { IntentLink } from "@/components/ui/IntentLink";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { segments } from "@/lib/search/highlight";
import type { Ranges, SearchRow, SearchTileView } from "@/lib/search/types";

/**
 * Everything inside the search sheet (phone) and the header dropdown
 * (desktop) — «Search Mobile» frames 1–8, D1–D2. One component so the two
 * can never disagree about what a state looks like.
 */
export function SearchPanel(props: {
  locale: Locale;
  query: string;
  settledQuery: string;
  rows: SearchRow[];
  searchedAs: string | null;
  loading: boolean;
  /** The search could not run (429, 5xx, offline): say nothing rather than «nothing matches». */
  failed?: boolean;
  popular: SearchTileView[];
  recents: string[];
  highlighted: number;
  listboxId: string;
  variant: "sheet" | "dropdown";
  onPickRecent: (query: string) => void;
  onRemoveRecent: (query: string) => void;
  onClearRecents: () => void;
  onPick: (row: SearchRow) => void;
}) {
  const m = messagesFor(props.locale);
  const typed = props.query.trim();
  const settled = props.settledQuery.trim();
  const hasRows = props.rows.length > 0;
  const noResults = settled !== "" && !hasRows && !props.loading && !props.failed;
  const failed = props.failed === true && !hasRows;
  if (failed) return null;

  const showRecents = typed === "" && props.recents.length > 0;
  const showPopular = (typed === "" || noResults) && props.popular.length > 0;
  const gutter = props.variant === "sheet" ? "px-6" : "px-5";

  return (
    <div className="relative flex flex-col pb-6">
      {props.loading ? (
        <div role="progressbar" aria-label={m.common.loading} className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[var(--color-primary-wash-lighter)]">
          <span className="cq-search-bar absolute inset-y-0 w-[35%] bg-[var(--color-brand-500)]" />
        </div>
      ) : null}

      {props.searchedAs && hasRows ? (
        <p className={`${gutter} pb-1 pt-2 text-body-s leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l`}>
          {m.search.showing}{" "}
          <span dir="ltr" className="font-bold text-[var(--color-ink)]">{props.searchedAs}</span>
        </p>
      ) : null}

      {hasRows ? (
        // KEYED BY THE SETTLED QUERY: a new answer replaces the old list as
        // ONE group fading in. Typing (and the loading line) leaves the key —
        // and so the list — alone, so nothing animates per keystroke or per row.
        <div key={settled} role="listbox" id={props.listboxId} className={`cq-fade-in flex flex-col ${props.variant === "dropdown" ? "px-2" : ""}`}>
          {props.rows.map((row, index) => (
            <IntentLink
              key={row.id}
              id={`${props.listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === props.highlighted}
              href={row.href}
              onClick={() => props.onPick(row)}
              className={`flex min-h-[60px] items-center gap-3 py-2 text-[var(--color-ink)] transition-colors ${props.variant === "dropdown" ? "rounded-[10px] px-3" : "px-6"} ${index === props.highlighted ? "bg-[var(--color-primary-wash-lighter)]" : "hover:bg-[var(--color-chip)]"}`}
            >
              <span className="relative size-11 shrink-0 overflow-hidden rounded-[12px] bg-[var(--color-brand-500)]">
                {row.icon ? <Image src={row.icon.url} alt="" aria-hidden fill sizes="44px" className="object-cover" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-s font-medium leading-[1.5] lg:text-body-l"><Bold text={row.name} ranges={row.nameRanges} /></span>
                {row.subtitle ? (
                  <span dir="auto" className="text-caption leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-s">
                    <Bold text={row.subtitle.text} ranges={row.subtitle.ranges} />
                  </span>
                ) : null}
              </span>
              <Chevron />
            </IntentLink>
          ))}
          <IntentLink
            href={`/${props.locale}/search?q=${encodeURIComponent(typed)}`}
            className={`flex h-12 items-center justify-between text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-l ${props.variant === "dropdown" ? "px-3" : "px-6"}`}
          >
            {m.search.seeAll}
            <Chevron brand />
          </IntentLink>
          <p aria-live="polite" className="sr-only">{m.search.resultCount.replace("{count}", String(props.rows.length))}</p>
        </div>
      ) : null}

      {noResults ? (
        <div key={settled} className={`cq-fade-in ${gutter} flex flex-col gap-0.5 pb-2 pt-5`}>
          <p className="text-body-l font-bold leading-[1.5] lg:text-heading-m">
            {m.search.noResultsBefore}<bdi>{settled}</bdi>{m.search.noResultsAfter}
          </p>
          <p className="text-body-s leading-[1.5] text-[var(--color-ink-muted)] lg:text-body-l">{m.search.tryOther}</p>
        </div>
      ) : null}

      {showRecents ? (
        <section className="cq-fade-in flex flex-col pb-2">
          <div className={`${gutter} flex h-12 items-center justify-between`}>
            <h2 className="text-body-s font-bold leading-[1.5] lg:text-body-l">{m.search.recents}</h2>
            <button type="button" onClick={props.onClearRecents} className="h-12 text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s">{m.search.clearAll}</button>
          </div>
          {props.recents.map((recent) => (
            <div key={recent} className="flex h-12 items-center ps-6 pe-3">
              <button type="button" onClick={() => props.onPickRecent(recent)} className="flex h-full min-w-0 flex-1 items-center gap-3 text-body-s font-medium lg:text-body-l">
                <span aria-hidden className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                <bdi className="truncate">{recent}</bdi>
              </button>
              <button type="button" aria-label={m.search.remove} onClick={() => props.onRemoveRecent(recent)} className="grid size-11 place-items-center">
                <span aria-hidden className="block size-2.5 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </button>
            </div>
          ))}
        </section>
      ) : null}

      {showPopular ? (
        <section className={`${gutter} flex flex-col`}>
          <h2 className="flex h-12 items-center text-body-s font-bold lg:text-body-l">{m.search.popular}</h2>
          <div className={props.variant === "sheet" ? "grid grid-cols-[repeat(4,66px)] justify-between gap-y-3" : "grid grid-cols-4 gap-4"}>
            {props.popular.map((tile) => (
              <IntentLink key={tile.id} href={tile.href} className="flex flex-col items-center gap-2 text-[var(--color-ink)]">
                <span className={`relative overflow-hidden rounded-[16px] bg-[var(--color-brand-500)] ${props.variant === "sheet" ? "size-[66px]" : "size-[72px]"}`}>
                  {tile.icon ? <Image src={tile.icon.url} alt="" aria-hidden fill sizes="72px" className="object-cover" /> : null}
                </span>
                <span className={`line-clamp-2 text-center font-medium leading-[1.5] ${props.variant === "sheet" ? "text-caption" : "text-body-s"}`}>{tile.name}</span>
              </IntentLink>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Bold({ text, ranges }: { text: string; ranges: Ranges }) {
  return (
    <>
      {segments(text, ranges).map((part, i) =>
        part.bold ? (
          <mark key={i} className="bg-transparent font-bold text-inherit">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Chevron({ brand = false }: { brand?: boolean }) {
  return (
    <span
      aria-hidden
      className={`block size-6 shrink-0 ltr:-scale-x-100 [mask-image:url(/brand/icon-chevron-start.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:5.5px_11.5px] ${brand ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-ink-subtle)]"}`}
    />
  );
}
