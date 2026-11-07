import { SearchTrigger } from "@/components/search/SearchTrigger";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * The phone's search bar — Figma `6847:97776`, sitting between the header row
 * and the hero banner on the home screen.
 *
 * ON THE HOME PAGE, NOT IN THE HEADER. The comp puts it here, and the product
 * and side-menu frames (`6847:97051`, `6847:85421`) carry no search bar at
 * all — so it belongs to this screen rather than to the shared chrome. The
 * desktop header keeps its own, where the desktop comp draws one.
 *
 * MOBILE ONLY (`lg:hidden`), because the desktop header already has the same
 * control and two search boxes on one page is two places for a customer to
 * wonder which one searches what.
 *
 * A REAL FORM, GET, to a page that exists. The comp draws placeholder text; an
 * input that cannot be typed into is a picture of a feature, and — until this
 * shipped — a form posting to a route that answered 404 was worse than either.
 * `method` is left at its default GET so the query lands in the URL, which
 * makes a result page shareable, refreshable and reachable with the back
 * button, and needs no JavaScript to submit.
 */
export function HomeSearch({ locale }: { locale: Locale }) {
  const m = messagesFor(locale);

  return (
    <div className="mx-auto flex w-full max-w-[1248px] items-center gap-3 px-6 lg:hidden">
      {/* WITH SCRIPT: the bar is a button that opens the full-screen search
          (`SearchTrigger` loads the sheet on first touch). `noscript:hidden`
          takes it away when scripting is off, and the plain form below takes
          its place — the two never show together, and they are siblings, so
          the sheet's own <form> never nests inside this one. */}
      <SearchTrigger
        locale={locale}
        className="flex w-full items-center gap-3 rounded-[10px] bg-[var(--color-chip)] px-4 py-3 text-start text-body-s font-semibold text-[var(--color-ink-subtle)] noscript:hidden"
      >
        <span
          aria-hidden
          className="block size-5 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
        />
        {m.nav.searchPlaceholder}
      </SearchTrigger>

      <form action={`/${locale}/search`} role="search" className="hidden w-full noscript:block">
        {/* THE FRAME IS WHAT GOES ACTIVE, not the text. The global keyboard
            ring (`:focus-visible`, globals.css) matches a focused <input> on
            every tap, and it drew a box hugging the input alone — around
            «ادخل كلمة البحث» — which read as the placeholder being selected.
            The input opts out of the ring; the frame takes the active state
            through `focus-within`: the primary stroke, the surface fill and the
            icon in primary, the way the comp's Active search glyph is drawn
            against its Inactive one (`6847:97777`). */}
        <div className="group flex w-full items-center gap-3 rounded-[10px] border border-transparent bg-[var(--color-chip)] px-4 py-3 transition-colors focus-within:border-[var(--color-brand-500)] focus-within:bg-[var(--color-surface)]">
          <span
            aria-hidden
            className="block size-5 shrink-0 bg-[var(--color-ink-subtle)] [mask-image:url(/brand/icon-search.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-focus-within:bg-[var(--color-brand-500)]"
          />
          <input
            type="search"
            name="q"
            placeholder={m.nav.searchPlaceholder}
            aria-label={m.nav.searchPlaceholder}
            className="w-0 min-w-px flex-1 bg-transparent text-body-s font-semibold text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] focus-visible:outline-none"
          />
          {/* Submits on Enter from the input alone; this exists for a customer
              using an on-screen keyboard whose "go" key their browser does not
              map, and it is `sr-only` because the comp draws no button. */}
          <button type="submit" className="sr-only">
            {m.search.title}
          </button>
        </div>
      </form>
    </div>
  );
}
