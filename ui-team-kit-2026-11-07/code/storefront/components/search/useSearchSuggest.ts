"use client";

import { useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/i18n/locales";
import type { PopularResponse, SearchRow, SearchTileView, SuggestResponse } from "@/lib/search/types";

const DEBOUNCE_MS = 150;

/** One shared empty list, so an idle hook hands back the SAME array every render. */
const NO_ROWS: SearchRow[] = [];

/**
 * Rows for what is typed: 2+ characters, one request per 150 ms pause, the
 * previous request aborted, the previous rows kept while the next arrive
 * (frame 5 — no skeleton flash). Failures are quiet: no rows and `failed` set, so the panel says nothing, and the form still works.
 *
 * `loading` and the rows are DERIVED from the typed query and the last answer,
 * so nothing sets state synchronously inside the effect — only the timer's
 * own callback does.
 */
export function useSearchSuggest(locale: Locale, query: string) {
  const [answer, setAnswer] = useState<{ rows: SearchRow[]; searchedAs: string | null; settledQuery: string; failed: boolean }>({ rows: [], searchedAs: null, settledQuery: "", failed: false });
  const controller = useRef<AbortController | null>(null);
  const q = query.trim();
  const active = q.length >= 2;

  useEffect(() => {
    controller.current?.abort();
    if (!active) return;

    const timer = window.setTimeout(async () => {
      const current = new AbortController();
      controller.current = current;
      try {
        const response = await fetch(`/api/search/suggest?locale=${locale}&q=${encodeURIComponent(q)}`, { signal: current.signal });
        // A 429 or a 5xx is a search that could not RUN — never «nothing found».
        if (!response.ok) {
          if (!current.signal.aborted) setAnswer({ rows: [], searchedAs: null, settledQuery: q, failed: true });
          return;
        }
        const body = (await response.json()) as SuggestResponse;
        if (!current.signal.aborted) setAnswer({ rows: body.rows ?? [], searchedAs: body.searchedAs ?? null, settledQuery: q, failed: false });
      } catch {
        if (!current.signal.aborted) setAnswer({ rows: [], searchedAs: null, settledQuery: q, failed: true });
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [locale, q, active]);

  if (!active) return { rows: NO_ROWS, searchedAs: null as string | null, settledQuery: "", failed: false, loading: false };
  return { ...answer, loading: answer.settledQuery !== q };
}

/** «الأكثر طلباً الآن», fetched once the panel first opens. */
export function usePopular(locale: Locale, enabled: boolean): SearchTileView[] {
  const [tiles, setTiles] = useState<SearchTileView[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch(`/api/search/popular?locale=${locale}`)
      .then((r) => (r.ok ? (r.json() as Promise<PopularResponse>) : { tiles: [] }))
      .then((body) => alive && setTiles(body.tiles ?? []))
      .catch(() => alive && setTiles([]));
    return () => {
      alive = false;
    };
  }, [locale, enabled]);
  return tiles;
}
