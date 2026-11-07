"use client";

import { useState } from "react";

/**
 * The questions («FAQ Mobile», 2026-09-30): a flat list with dividers, the
 * open one in the brand blue with its chevron turned, one open at a time.
 *
 * NATIVE `<details name="faq">`: the browser keeps one open and handles the
 * keyboard, with or without a script — every question is rendered on the
 * server. The search on top filters questions AND answers as the customer
 * types; without a script it is simply a box that does nothing, and every
 * question is still there.
 */
export function FaqList({
  entries,
  labels,
  searchable = true,
}: {
  entries: readonly { id: string; question: string; answer: string }[];
  labels: { search: string; noMatch: string };
  /** Off for a short list — a product's few questions need no search box. */
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle === "" ? entries : entries.filter((entry) => `${entry.question}\n${entry.answer}`.toLocaleLowerCase().includes(needle));

  return (
    <div className="flex flex-col gap-4">
      {searchable ? (
      <label className="flex h-[50px] items-center gap-2 rounded-[14px] bg-[var(--color-chip)] px-3.5 focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]">
        <span aria-hidden className="block size-[18px] shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="h-full w-0 min-w-0 flex-1 bg-transparent text-body-s text-[var(--color-ink)] lg:text-body-l outline-none placeholder:text-[var(--color-ink-subtle)]"
        />
      </label>
      ) : null}

      {shown.length === 0 ? (
        <p role="status" className="my-3 text-center text-body-s text-[var(--color-ink-muted)] lg:text-body-l">
          {labels.noMatch}
        </p>
      ) : (
        <div>
          {shown.map((entry) => (
            <details key={entry.id} name="faq" className="group border-b border-[var(--color-line)]">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-4 [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] group-open:font-bold lg:text-body-l group-open:text-[var(--color-brand-500)]">
                  {entry.question}
                </span>
                <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--color-chip)] transition-colors group-open:bg-[var(--color-brand-500)]">
                  <span
                    aria-hidden
                    className="block size-3.5 bg-[var(--color-ink-muted)] transition-transform [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-open:rotate-180 group-open:bg-[var(--color-on-cta)] motion-reduce:transition-none"
                  />
                </span>
              </summary>
              <p className="whitespace-pre-line pb-4 text-body-s leading-[1.75] text-[var(--color-ink-muted)] lg:text-body-l">{entry.answer}</p>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
