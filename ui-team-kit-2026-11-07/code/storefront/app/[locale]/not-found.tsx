import { LocaleFromRoute } from "@/components/ui/LocaleFromRoute";
import { NotFound } from "@/components/ui/NotFound";

/**
 * The 404 a customer inside the store actually meets (Figma 5713:11450).
 *
 * It renders inside `app/[locale]/layout.tsx`, so it arrives with the header,
 * the footer, and the `dir`/`lang` pair that makes RTL structural — which is
 * the whole reason the 404 lives here rather than in a bare root file.
 *
 * TWO WAYS TO GET HERE, both wanted:
 *   1. A page in this subtree calls `notFound()` — a product slug the API
 *      answers 404 for, an order status with no token cookie.
 *   2. `app/[locale]/[...rest]/page.tsx` catches a URL under a locale that
 *      matches no route at all. Next does NOT route unmatched URLs to a
 *      segment-level not-found file by itself — verified against this build,
 *      not assumed — so without that catch-all every mistyped path fell through
 *      to the ROOT not-found and lost the shell entirely.
 *
 * KNOWN WART, MEASURED RATHER THAN GUESSED AT, AND NOT YOURS TO FIX QUIETLY.
 * The 404 body is NOT server-rendered. Next answers a real `404` with an
 * `<html id="__next_error__">` shell whose <body> is empty, carries this tree
 * in the RSC payload, and paints it on hydration — so a reader with JavaScript
 * off gets a blank page instead of the way out. Next's OWN built-in 404 does
 * server-render, because it skips the layout entirely; any custom not-found
 * has to compose with the root layout, and this app's root layout is
 * `app/[locale]/layout.tsx` — under a dynamic segment, reading cookies (and,
 * when this was measured, headers). That is the exact case Next's docs cite
 * as the reason `global-not-found` exists.
 *
 * THREE THINGS THAT ARE NOT THE CAUSE, each rebuilt and re-curled: the
 * `headers()` call this file used to make, the `notFound()` in the layout,
 * and the presence of `app/not-found.tsx`. The prerendered `_not-found.html`
 * on disk IS fully rendered, which is what proves the machinery works and the
 * composition is what fails.
 *
 * The two ways out both cost more than the wart: `experimental.globalNotFound`
 * bypasses the layout, so the header and footer the comp draws disappear and
 * `notFound()` thrown from a product page still lands here — two different 404
 * screens in one store. Moving the root layout out from under `[locale]` is an
 * architecture change and HANDBOOK §11 says raise it, not make it. Raised.
 *
 * NEXT PASSES A NOT-FOUND FILE NO PROPS, so the locale cannot come from
 * `params` the way it does on every page — and the shell is shared, so the
 * server cannot read the request's path either (ADR 0046 §1). Both languages'
 * 404s are rendered here, still server components, and `LocaleFromRoute`
 * shows the one the route's `[locale]` names on the client — the same value
 * the layout's `lang` and `dir` came from. The fallback is Arabic — the
 * store's own language, and the cheaper way to be wrong (see
 * `negotiateLocale`).
 */
export default function LocaleNotFound() {
  return <LocaleFromRoute ar={<NotFound locale="ar" />} en={<NotFound locale="en" />} />;
}
