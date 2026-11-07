"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { EDGE_CURRENCY_PARAM } from "@/lib/edge/eligibility";
import { withLocale } from "@/lib/navigation/with-locale";

/**
 * The `next` field every preference form posts — the page to come back to.
 *
 * READ FROM THE LIVE URL, NOT FROM A PROP. The chrome is rendered by the
 * locale LAYOUT, and an App Router layout does not re-render on a client-side
 * navigation: a path it read on the server is the page the customer LANDED on.
 * Passed down as a prop, a customer who arrived on the home page, tapped into
 * a category and then switched language was sent back to the home page.
 * `usePathname()` follows every navigation, so the form carries where they
 * are now. The server cannot read the path any more anyway: the shell is
 * shared between every visitor and every page (ADR 0046 §1).
 *
 * BEFORE THE SEARCH PARAMS ARE KNOWN (the Suspense fallback — the HTML a
 * customer with JavaScript off posts) the field still names the page: the
 * path without its query, from the same `usePathname()`. `fallback`, when a
 * caller passes one, wins there instead — the add-to-cart form returns to the
 * cart, not to the product. Where even the path is not known yet (Cache
 * Components, a route param not built ahead), the field is empty for that
 * moment and `/api/preferences` sends the customer back to the page the post
 * came from — its Referer (every store page sends `Referrer-Policy:
 * same-origin`) — and to the language's home only when there is none.
 *
 * `toLocale` swaps the leading locale segment, for the language switch
 * (`withLocale`).
 *
 * NEVER THE EDGE KEY: an edge copy (ADR 0052) is rendered for the normalised
 * `?__cq_cur=<ISO>` the Snippet forwards, so the copy's HTML would otherwise
 * post that internal key back — and crawlers read it there (2026-11-01).
 *
 * NOT FOR <noscript>: nothing resolves a hook or a Suspense boundary there.
 * A form inside one posts an empty `next` and lets the Referer answer.
 */
interface Props {
  /** The pre-hydration value when it is not the current page. */
  fallback?: string;
  toLocale?: string;
  /** The field's name — `next` for the preference forms. */
  name?: string;
  /** Query keys that describe a one-off notice, not the page (`added`). */
  omit?: readonly string[];
}

export function ReturnPathInput({ fallback, toLocale, name = "next", omit = [] }: Props) {
  return (
    <Suspense
      fallback={
        // `usePathname()` itself can suspend under Cache Components (a param
        // not built ahead); a hook suspending INSIDE a fallback suspends the
        // boundary above, so the path read gets a boundary of its own.
        <Suspense fallback={<input type="hidden" name={name} value={fallback ? withLocale(fallback, toLocale) : ""} />}>
          <PathOnly fallback={fallback} toLocale={toLocale} name={name} />
        </Suspense>
      }
    >
      <LiveReturnPath fallback={fallback} toLocale={toLocale} name={name} omit={omit} />
    </Suspense>
  );
}

/** The page without its query — all that is known before the search params. */
function PathOnly({ fallback, toLocale, name }: { fallback?: string; toLocale?: string; name: string }) {
  const pathname = usePathname();
  return <input type="hidden" name={name} value={withLocale(fallback ?? pathname ?? "/", toLocale)} />;
}

function LiveReturnPath({ fallback, toLocale, name = "next", omit = [] }: Props) {
  const pathname = usePathname();
  const params = new URLSearchParams(useSearchParams()?.toString());
  for (const key of [...omit, EDGE_CURRENCY_PARAM]) params.delete(key);
  const query = params.toString();
  const here = pathname ? `${pathname}${query ? `?${query}` : ""}` : (fallback ?? "/");

  return <input type="hidden" name={name} value={withLocale(here, toLocale)} />;
}
