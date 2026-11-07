import { NotFound } from "@/components/ui/NotFound";
import { DEFAULT_LOCALE, DIRECTIONS } from "@/lib/i18n/locales";

import "./globals.css";

/**
 * The 404 for URLs that never reach a locale.
 *
 * ALMOST NOTHING GETS HERE, and that is by design: `proxy.ts` redirects every
 * extensionless path into `/ar/…` or `/en/…`, so what is left is the paths its
 * matcher deliberately skips — anything with a file extension. A request for
 * `/whatever.txt` is a missing asset, not a customer taking a wrong turn.
 *
 * IT IS NOT WRAPPED BY `app/[locale]/layout.tsx`. That layout is this app's
 * root layout and it lives under a dynamic segment, so a URL with no locale in
 * it has no `params` to render the layout from; Next supplies its own bare
 * document instead. Two consequences, both deliberate rather than overlooked:
 *
 *   - NO HEADER AND NO FOOTER. They need a locale, a currency and the
 *     customer's session, none of which exist on a path that never named a
 *     language. An invented one would put a store's navigation around a
 *     response to a missing file.
 *   - `dir` AND `lang` SIT ON A DIV, the one place in this codebase they do.
 *     HANDBOOK §4 puts them on `<html>` and means it — but `<html>` here is
 *     Next's, not ours, and unset direction would left-align Arabic. Declared
 *     once, together, from the same value, exactly as the layout does it.
 *
 * `globals.css` is imported HERE because nothing above this file imports it.
 * Without it this page would answer 404 in a system serif with no brand colour
 * at all.
 */
export default function RootNotFound() {
  return (
    <div
      lang={DEFAULT_LOCALE}
      dir={DIRECTIONS[DEFAULT_LOCALE]}
      className="flex min-h-screen flex-col"
    >
      <NotFound locale={DEFAULT_LOCALE} />
    </div>
  );
}
