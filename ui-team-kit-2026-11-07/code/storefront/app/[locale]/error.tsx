"use client";

import { useEffect } from "react";

import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { reportClientError } from "@/lib/monitoring/report-client";
import { recoverFromDeploySkew } from "@/lib/navigation/deploy-skew";
import { isConnectionDrop } from "@/lib/navigation/network-failure";

/**
 * What a customer sees when a page throws.
 *
 * IT EXISTS BECAUSE THERE WAS NOTHING. Every server component here calls the
 * API, and an API that is briefly unreachable throws `TypeError: fetch failed`
 * out of the render. With no boundary, Next.js serves its own error screen:
 * unstyled, in English, LTR, with no way back to the shop — on an Arabic-first
 * storefront, to a customer who did nothing wrong. That is a page-level
 * failure of ONE route turning into a dead end for the whole visit.
 *
 * IT IS SCOPED TO `[locale]`, deliberately. Placed at the root it would have
 * no locale to render in and would have to guess; here the segment's own
 * `params` are unavailable to an error boundary, so the locale is read from
 * the path — the one piece of routing information that survives a render that
 * did not finish.
 *
 * NOTHING ABOUT THE ERROR IS SHOWN. `error.message` on a server exception can
 * carry an internal hostname, a query, or a stack frame, and this component
 * runs in the customer's browser. Next.js already strips it in production; not
 * rendering it at all means that protection is not the only thing standing
 * between an internal detail and a screenshot on social media. The digest is
 * logged for us, not displayed.
 *
 * RETRY IS `retry()`, not a reload and not `reset()`. A reload re-runs the
 * whole navigation and loses scroll and any client state; `reset()` only
 * re-renders with the contents already fetched, so it cannot recover from the
 * failed server fetch this screen is usually for. `retry()` (stable since
 * Next 16.3) fetches the failed segment again and re-renders it.
 *
 * A DROPPED CONNECTION SAYS SO (2026-10-28, `lib/navigation/network-failure`):
 * the browser got no answer, so "check your internet" is the one thing the
 * customer can act on. It never says nothing was sent — the answer may be
 * what was lost — and it retries nothing by itself.
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server-side errors reach the browser with only a `digest`; the real
    // stack is in the server log under that same id. Logging it here is what
    // makes the two joinable when a customer reports "it broke".
    console.error("storefront route error", error.digest ?? error.message);
    // Browser-side failures only; a digest was reported on the server.
    reportClientError(error, isConnectionDrop(error) ? "warning" : "error");
    // A form's Server Action from an older release than the server («add to
    // the basket» on a tab open across a deploy): nothing ran — the page
    // reloads once onto the running release instead of showing this screen.
    recoverFromDeploySkew(error);
  }, [error]);

  // `?? ""` because a path of "/" splits to `["", ""]` and index 1 is
  // `undefined` under `noUncheckedIndexedAccess`. Anything unrecognised falls
  // to Arabic, which is this store's default rather than a guess.
  const segment = typeof window === "undefined" ? "" : (window.location.pathname.split("/")[1] ?? "");
  const locale = isLocale(segment) ? segment : "ar";
  const m = messagesFor(locale);
  const dropped = isConnectionDrop(error);

  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="text-display font-bold text-[var(--color-ink)]">{dropped ? m.errors.droppedTitle : m.errors.title}</h1>
      <p className="text-body-l lg:text-heading-m text-[var(--color-ink-muted)]">{dropped ? m.errors.droppedBody : m.errors.body}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-[12px] bg-[var(--color-brand-500)] px-6 py-3 text-body-l font-semibold lg:text-heading-m text-[var(--color-on-primary)]"
        >
          {m.errors.retry}
        </button>
        {/* A plain anchor, not `<Link>`: the router is part of what may have
            failed, and a hard navigation is the one exit that always works. */}
        <a
          href={`/${locale}`}
          className="rounded-[12px] border border-[var(--color-line)] px-6 py-3 text-body-l font-medium lg:text-heading-m text-[var(--color-ink)]"
        >
          {m.errors.home}
        </a>
      </div>
    </main>
  );
}
