import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The 404 body, built to the desktop comp (Figma 5713:11450).
 *
 * ONE COMPONENT, TWO ROUTES. `app/[locale]/not-found.tsx` renders it inside the
 * locale layout — header, footer, the whole shell the comp draws — and
 * `app/not-found.tsx` renders it bare for the handful of URLs that never reach
 * a locale at all. Written once so the two cannot drift into two different
 * apologies for the same mistake.
 *
 * THE COMP DRAWS EXACTLY ONE CONTROL HERE and it is the way out: a button to
 * the home page. Nothing else in the frame belongs to this component — the
 * promo banner, the search box, the cart pill and the footer's link wall are
 * `SiteHeader`/`SiteFooter` and the layout, already built. Nothing was invented
 * to fill space: a 404 that offers a customer links to pages that also do not
 * exist is the same mistake twice.
 *
 * DIRECTION IS STRUCTURAL, as everywhere else. The comp draws the illustration
 * on the left with the copy to its right because the comp is Arabic; that is
 * `dir=rtl` doing its job, not a fact about the artwork. The copy is FIRST in
 * the DOM so it lands on the start side — right in Arabic, left in English —
 * and the illustration follows. No `rtl:` variant, no transform: unlike the
 * hero plate this artwork has no directional edge to meet.
 */
export function NotFound({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      {/* Stacked on a phone with the artwork ON TOP — `flex-col-reverse`,
          because the copy comes first in the DOM for the row's sake. The comp
          is desktop-only (there is no mobile 404 frame), and a 240px square
          beside 247px of text does not fit a 360px screen, which is most of
          this market. */}
      <div className="flex flex-col-reverse items-center gap-8 text-center sm:flex-row sm:gap-10 sm:text-start">
        <div className="flex flex-col items-center gap-5 sm:items-start">
          <div className="flex flex-col gap-3">
            {/* Both lines are one heading: "404" alone is a status code and the
                sentence under it is what a customer actually reads. Split into
                two headings they would be two landmarks for one message. */}
            <h1 className="text-heading-l font-bold leading-[1.522] text-[var(--color-ink)]">
              <span className="block">{m.notFound.code}</span>
              {m.notFound.title}
            </h1>

            {/* #818181 in the comp — `ink-subtle`, NOT `ink-muted` (#5e5e5e).
                globals.css spells out why those two must not be collapsed: this
                grey is the one placeholders and hints use, and at #5e5e5e the
                apology would read as dark as the heading above it. */}
            <p className="max-w-[247px] text-body-l font-medium leading-[1.522] text-[var(--color-ink-subtle)]">
              {m.notFound.body}
            </p>
          </div>

          {/* The way out. A LINK, not a button: it navigates, so it has to be
              something a customer can middle-click, open in a tab, and reach
              with a keyboard — and something that still works on the no-JS
              path. `/${locale}` keeps them in the language they were reading;
              bare `/` would bounce them through the proxy's negotiation and
              could answer in the other one. */}
          <Link
            href={`/${locale}`}
            className="flex h-[56px] items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-8 text-heading-m font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
          >
            {m.notFound.home}
          </Link>
        </div>

        {/* Decorative: every word of the message is in the text beside it, so
            an alt string here would only make a screen reader read the same
            apology twice. Exported from the comp rather than drawn by hand —
            245×240 because the artwork's blur bleeds past its 240px frame. */}
        <Image
          src="/brand/illustration-404.svg"
          alt=""
          aria-hidden
          width={245}
          height={240}
          className="shrink-0"
        />
      </div>
    </main>
  );
}
