import { Suspense } from "react";

import { COUNTRY_GROUPS, countryGroup, CountrySwitcher, PHONE_PILL_ROOM } from "@/components/ui/CountrySwitcher";
import { VisitorCountrySwitcher } from "@/components/ui/header/VisitorCountrySwitcher";
import { COUNTRIES } from "@/lib/currency/countries";
import { countryForVisitor } from "@/lib/currency/visitor";
import { edgeRenderCurrency } from "@/lib/edge/render";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type PillSize = "sm" | "lg";

/**
 * The country pill — which row it shows lit is a choice (the `country`
 * cookie) or a detection (`CF-IPCountry`), so it is the visitor's and streams
 * in its own Suspense boundary, never the shared shell (ADR 0046 §2), as the
 * basket does (`components/cart/CartBadge.tsx`). `sm` is the phone header's
 * pill, `lg` the desktop row's.
 *
 * WHAT HOLDS ITS PLACE. The shell cannot know the country — that is the
 * personal fact — so the box cannot be sized per country:
 *
 * - Below `sm` (640) it does not need to be. The phone pill is a container
 *   taking the room the chip and the basket leave (`PHONE_PILL_ROOM`, PR
 *   #304), pinned to the row's end; the box takes that same room, so the pill
 *   lands where the box was and nothing beside it moves, whatever the country.
 * - From `sm`, and on desktop, the pill is its own size, so the box is the
 *   pill measured for the Emirates — the store's own market and what an
 *   undetected visitor is shown (`countryChoiceFor`) — per language, on the
 *   production build: 129×36 / 199×36 from `sm`, 166×41 / 270.5×41 on desktop,
 *   Arabic / English. Another country's pill is a different width, and what
 *   sits beside it (the chip from `sm`; the account menu, the chip and the
 *   basket on desktop) moves by the difference when it lands — if the box
 *   was ever painted. The pill reads a cookie and a header and nothing else,
 *   so it is the first boundary to resolve; the measured cost is in the
 *   3b Task 8 report.
 *
 * WITH JAVASCRIPT OFF the streamed pill never swaps in, and an empty box
 * would leave such a visitor no way to change country (HANDBOOK §4: a plain
 * form post is the switcher). So the fallback carries a `<noscript>` form —
 * the same post to `/api/preferences` (the way back is the post's Referer,
 * since no script fills the return path), a plain select
 * and a visible apply button, since nothing submits on change without a
 * script (the select is `required` and grouped as the sheet is), folded
 * behind a pill-sized `<details>` so it fits the phone row —
 * and a `<noscript>` rule that removes the empty box beside it. The
 * select opens on «الدولة», never a country: the shell does not know theirs,
 * and preselecting one would be a guess dressed as their choice. Its id is
 * its own; the real pill's `country-sm`/`country-lg` sits hidden in the
 * page with JavaScript off. Nothing is `aria-hidden`: with JavaScript on the
 * box has no content to hide, and with it off it holds the only control.
 */
export function CountryPill({ locale, size = "sm" }: { locale: Locale; size?: PillSize }) {
  return (
    <Suspense fallback={<CountryPillFallback locale={locale} size={size} />}>
      <CountryPillForVisitor locale={locale} size={size} />
    </Suspense>
  );
}

async function CountryPillForVisitor({ locale, size }: { locale: Locale; size: PillSize }) {
  const [shared, country] = await Promise.all([edgeRenderCurrency(), countryForVisitor()]);
  // A shared copy (ADR 0052, D9) is drawn for its currency's country and
  // switches to the visitor's own in the browser.
  if (shared) return <VisitorCountrySwitcher locale={locale} country={country} size={size} />;
  return <CountrySwitcher locale={locale} country={country} size={size} />;
}

/** The Emirates pill's box per size and language (see the docblock); below `sm` only the flag-only floor. */
const COUNTRY_PILL_BOX: Record<PillSize, Record<Locale, string>> = {
  sm: { ar: "h-9 w-[37px] sm:w-[129px]", en: "h-9 w-[37px] sm:w-[199px]" },
  lg: { ar: "h-[41px] w-[166px]", en: "h-[41px] w-[270.5px]" },
};

const HIDE_BOX_WITHOUT_SCRIPT = '[data-cq-fallback="country-pill"]{display:none}';

export function CountryPillFallback({ locale, size }: { locale: Locale; size: PillSize }) {
  const box = <div data-cq-fallback="country-pill" className={`${COUNTRY_PILL_BOX[size][locale]} shrink-0`} />;
  const withoutScript = (
    <noscript>
      <style>{HIDE_BOX_WITHOUT_SCRIPT}</style>
      <CountryFormWithoutScript locale={locale} size={size} />
    </noscript>
  );

  if (size === "lg") {
    return (
      <>
        {box}
        {withoutScript}
      </>
    );
  }
  // The same room the phone pill's container takes (`CountrySwitcher`).
  return (
    <div className={PHONE_PILL_ROOM}>
      {box}
      {withoutScript}
    </div>
  );
}

/**
 * The switch with JavaScript off: a `<details>` (it opens without a script)
 * whose summary is a pill the size of the flag-only one — the phone row has
 * ~50px left beside the chip's box at 360 — and whose panel is the form.
 */
function CountryFormWithoutScript({ locale, size }: { locale: Locale; size: PillSize }) {
  const m = messagesFor(locale);
  const id = `country-${size}-no-script`;
  const large = size === "lg";
  const control = large ? "h-[41px] text-body-m" : "h-9 text-caption";

  return (
    <details className="relative shrink-0">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1 rounded-[8px] p-2 font-medium text-[var(--color-on-primary)] [&::-webkit-details-marker]:hidden ${control}`}
        style={{ backgroundImage: "var(--gradient-brand)" }}
      >
        <span className={large ? "" : "sr-only"}>{m.common.country}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`shrink-0 ${large ? "size-6" : "size-5"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <form
        action="/api/preferences"
        method="post"
        className="absolute end-0 top-full z-50 mt-2 flex items-center gap-1 rounded-[8px] bg-[var(--color-surface)] p-2 shadow-lg"
      >
        {/* Empty on purpose: inside <noscript> nothing runs to fill it, and a
            hook or Suspense here would never resolve. `/api/preferences`
            sends the visitor back to the page the post came from — its
            Referer, which every store page sends (`Referrer-Policy:
            same-origin`, next.config.ts). */}
        <input type="hidden" name="next" value="" />
        <label htmlFor={id} className="sr-only">
          {m.common.country}
        </label>
        <select
          id={id}
          name="country"
          required
          defaultValue=""
          className={`w-36 rounded-[8px] border border-[var(--color-input-border)] bg-[var(--color-field)] px-1 text-[var(--color-ink)] ${control}`}
        >
          <option value="" disabled>
            {m.common.country}
          </option>
          {/* The sheet's sections, in its order: the Gulf, the Arab countries, the rest. */}
          {COUNTRY_GROUPS.map((group) => (
            <optgroup key={group} label={m.countryPicker[group]}>
              {COUNTRIES.filter((c) => countryGroup(c.code) === group).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name[locale]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="submit"
          className={`shrink-0 rounded-[8px] px-2 font-medium text-[var(--color-on-primary)] ${control}`}
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          {m.common.apply}
        </button>
      </form>
    </details>
  );
}
