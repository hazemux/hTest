"use client";

import Image from "next/image";
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { ReturnPathInput } from "@/components/ui/ReturnPathInput";

export type CountryRow = {
  code: string;
  name: { ar: string; en: string };
  currency: string;
  flag: string | null;
  group: "gulf" | "arab" | "world";
};

/**
 * The country pill's sheet («Country Picker Mobile», 2026-09-30): the real
 * flags, a search that matches the Arabic name, the English name and the
 * currency, and sections in the store's own order — the country chosen now,
 * the Gulf, Arab countries, the rest; «دول أخرى» (USD) last, flagless.
 *
 * AN ENHANCEMENT OVER THE NATIVE SELECT, NEVER A REPLACEMENT. Until this has
 * hydrated the pill is the `<select>` it always was (`CountrySwitcher`); once
 * it has, a transparent button over the pill opens this sheet instead. Each
 * country is a submit button of the same `/api/preferences` form post.
 */
export function CountrySheet({
  locale,
  current,
  rows,
  labels,
  openLabel,
}: {
  locale: "ar" | "en";
  current: string;
  rows: readonly CountryRow[];
  labels: {
    pickTitle: string;
    pickLead: string;
    search: string;
    current: string;
    gulf: string;
    arab: string;
    world: string;
    noResults: string;
    otherHint: string;
    close: string;
  };
  /** The pill's accessible name — «الدولة». */
  openLabel: string;
}) {
  // False on the server and before hydration, true once this runs in the browser.
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  if (!ready) return null;

  const needle = query.trim().toLocaleLowerCase();
  const matches = (row: CountryRow) =>
    needle === "" || [row.name.ar, row.name.en, row.currency].some((text) => text.toLocaleLowerCase().includes(needle));
  const chosen = rows.find((row) => row.code === current);
  const sections = [
    { key: "current", title: labels.current, rows: chosen && matches(chosen) ? [chosen] : [] },
    ...(["gulf", "arab", "world"] as const).map((group) => ({
      key: group,
      title: labels[group],
      rows: rows.filter((row) => row.group === group && row.code !== current && matches(row)),
    })),
  ].filter((section) => section.rows.length > 0);

  function open() {
    const element = dialog.current;
    if (!element || element.open) return;
    setQuery("");
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }

  function close() {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.close === "function") element.close();
    else element.removeAttribute("open");
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-label={openLabel} onClick={open} className="absolute inset-0 z-[1] size-full cursor-pointer rounded-[8px]" />

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="cq-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-[22px] bg-[var(--background)] p-0 text-[var(--color-ink)] backdrop:bg-[var(--color-backdrop)] lg:m-auto lg:max-w-[440px] lg:rounded-[22px]"
      >
        <form action="/api/preferences" method="post" className="flex max-h-[88dvh] flex-col">
          <ReturnPathInput />
          <div className="flex flex-col gap-3 px-5 pb-3 pt-2 lg:pt-5">
            <span aria-hidden className="mx-auto h-1 w-9 rounded-[2px] bg-[var(--color-line)] lg:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 id={titleId} className="text-heading-m font-bold lg:text-heading-l">
                  {labels.pickTitle}
                </h2>
                <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{labels.pickLead}</p>
              </div>
              <button type="button" onClick={close} aria-label={labels.close} className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-chip)]">
                <span aria-hidden className="block size-3 bg-[var(--color-ink)] [mask-image:url(/brand/icon-close.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </button>
            </div>
            <label className="flex h-11 items-center gap-2 rounded-[12px] bg-[var(--color-chip)] px-3 focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]">
              <span aria-hidden className="block size-4 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={labels.search}
                aria-label={labels.search}
                className="h-full w-0 min-w-0 flex-1 bg-transparent text-body-s outline-none lg:text-body-l placeholder:text-[var(--color-ink-subtle)]"
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
            {sections.length === 0 ? (
              <p role="status" className="py-6 text-center text-body-s lg:text-body-l text-[var(--color-ink-muted)]">
                {labels.noResults}
              </p>
            ) : (
              sections.map((section) => (
                <section key={section.key} className="flex flex-col pt-2">
                  <h3 className="px-1 pb-1 text-caption font-bold text-[var(--color-ink-subtle)]">{section.title}</h3>
                  {section.rows.map((row) => {
                    const on = row.code === current;
                    return (
                      <button
                        key={row.code}
                        type="submit"
                        name="country"
                        value={row.code}
                        aria-current={on ? "true" : undefined}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2.5 text-start ${on ? "bg-[var(--color-primary-wash-lighter)]" : "hover:bg-[var(--color-chip)]"}`}
                      >
                        {row.flag ? (
                          <Image src={row.flag} alt="" aria-hidden width={24} height={17} unoptimized className="h-[17px] w-6 shrink-0 rounded-[3px] object-cover" />
                        ) : (
                          <span aria-hidden className="block h-[17px] w-6 shrink-0 rounded-[3px] bg-[var(--color-bg-subtle)]" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={`text-body-s font-bold lg:text-body-l ${on ? "text-[var(--color-brand-500)]" : ""}`}>{row.name[locale]}</span>
                          {row.flag === null ? <span className="text-caption text-[var(--color-ink-subtle)]">{labels.otherHint}</span> : null}
                        </span>
                        <bdi dir="ltr" className="text-caption font-bold text-[var(--color-ink-muted)]">
                          {row.currency}
                        </bdi>
                        {on ? (
                          <span aria-hidden className="block size-3.5 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-check.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}

function subscribeNothing(): () => void {
  return () => {};
}
