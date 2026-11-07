"use client";

import { catchError, type ErrorInfo } from "next/error";
import { useEffect } from "react";

import { reportClientError } from "@/lib/monitoring/report-client";

/**
 * ONE BROKEN WIDGET IS A SMALLER PAGE, NEVER A BROKEN ONE (wave 2 of the
 * Next.js practices pass, 2026-11-02). Wraps an OPTIONAL section — reviews,
 * partner codes, the recommendations row, the app badges, a banner slider —
 * so a throw inside it draws nothing in its place instead of handing the whole
 * page to `app/[locale]/error.tsx`.
 *
 * `catchError` (`next/error`, stable since Next 16.3) rather than a hand-made
 * class: it lets `redirect()` / `notFound()` through to their own boundaries
 * and clears itself on a client navigation.
 *
 * WHERE IT CATCHES — read before relying on it:
 * - In the BROWSER only. React's server renderer has no error boundaries: a
 *   section that throws while the page is rendered for a request is sent as
 *   the fallback of its nearest `<Suspense>`, and this boundary catches when
 *   the browser renders it again. So a section that can throw on the server
 *   needs a `<Suspense>` between it and the page (the product page's
 *   recommendations and reviews have one); without it, the throw fails the
 *   whole server render as before.
 * - Not in a PRERENDER (the shared shell at build, a regeneration): a server
 *   throw there fails the prerender even under `<Suspense>` + this boundary
 *   (measured 2026-11-02 on a release-flag build: a throw planted in the
 *   home's reviews stopped `next build` with "Error occurred prerendering
 *   page /en"), and Next rethrows in a prerender on purpose
 *   (`handleISRError`). So a broken shared shell fails the build, or the
 *   regeneration — which serves the previous copy while one is still
 *   servable, and answers 500 once a webhook has expired the page (HANDBOOK
 *   §8). It is never cached degraded, and this boundary does not make the
 *   home's shell immune to one widget. That is why the home's
 *   shared sections get this boundary WITHOUT a `<Suspense>` of their own: one
 *   would buy nothing there, and React moves a boundary that completes past
 *   the first ~12.8 KB out of the shell, so with JavaScript off it would
 *   stay empty (HANDBOOK §8).
 * - Not for a bot's user agent: Next lets the error reach the page's boundary,
 *   whose status a crawler should see.
 *
 * NOTHING IS SWALLOWED ON THE SERVER. A server-side throw is still reported by
 * `onRequestError` (`instrumentation.ts`): Sentry hears of it, and a URL the
 * edge keeps is purged (`lib/edge/render-error.ts`). It reaches the browser as
 * a bare `digest`, which `reportClientError` skips as already reported; a
 * throw in the browser has none and is reported from here, once.
 */
export const SectionBoundary = catchError(DroppedSection);

function DroppedSection({ name }: { /** For the log line: which section went missing. */ name: string }, { error }: ErrorInfo) {
  return <ReportDroppedSection name={name} error={error} />;
}

function ReportDroppedSection({ name, error }: { name: string; error: unknown }) {
  useEffect(() => {
    const thrown: Error & { digest?: string } = error instanceof Error ? error : new Error(String(error));
    console.error("storefront section dropped", name, thrown.digest ?? thrown.message);
    reportClientError(thrown);
  }, [name, error]);

  return null;
}
