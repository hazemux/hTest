import Image from "next/image";

import { AutoSubmitSelect } from "@/components/ui/AutoSubmitSelect";
import { COUNTRIES, countryOption, currencyForChoice, flagSrc } from "@/lib/currency/countries";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { ReturnPathInput } from "@/components/ui/ReturnPathInput";

import { CountrySheet, type CountryRow } from "./CountrySheet";

/** The Gulf and the Arab countries, for the sheet's sections; everything else is «the rest». */
const GULF = new Set(["SA", "AE", "KW", "QA", "BH", "OM"]);
const ARAB = new Set(["EG", "JO", "LB", "IQ", "SY", "YE", "PS", "SD", "LY", "TN", "DZ", "MA"]);

/** Which of the sheet's sections a country sits in — also the no-script select's groups (`header/CountryPill.tsx`). */
export function countryGroup(code: string): CountryRow["group"] {
  return GULF.has(code) ? "gulf" : ARAB.has(code) ? "arab" : "world";
}

/** The sections' order for the no-script select — the same as `CountrySheet`'s (a client module, so it keeps its own literal). */
export const COUNTRY_GROUPS: readonly CountryRow["group"][] = ["gulf", "arab", "world"];

/**
 * The room the phone pill takes in its row — below `sm` the leftover width,
 * never under the flag-only 37px; from `sm` the pill's own size. ONE STRING
 * for the pill and for the box that holds its place while it streams
 * (`header/CountryPill.tsx`), so the two can never take different room.
 */
export const PHONE_PILL_ROOM = "flex min-w-[37px] flex-1 justify-end sm:flex-initial";

/**
 * The country pill — Figma `6847:97681`, and the same control on every mobile
 * screen that carries the header.
 *
 * A NATIVE `<select>` WEARING THE COMP'S GRADIENT, not a custom dropdown. The
 * comp draws a chevron, a name and a flag; a listbox built from divs would
 * need JavaScript to open, would need its own keyboard handling, and would
 * strand every customer whose bundle has not arrived yet — on the connections
 * this store actually sells over, and for a control that decides what currency
 * they are quoted in. The native element brings the phone's own picker, which
 * is the better experience on a phone anyway.
 *
 * THE VISIBLE ROW IS DRAWN UNDERNEATH AND THE SELECT IS TRANSPARENT ON TOP.
 * `<select>` cannot render an emoji flag beside styled text with a leading
 * chevron; it can only render its option text. So the pill is a normal flex
 * row, and the select is stretched over it at `opacity-0` — the customer taps
 * the pill, the phone opens its picker, and the row underneath is what they
 * see. The select keeps the accessible name and the keyboard behaviour, which
 * is why it is invisible rather than absent.
 *
 * THE FLAGS ARE THE OWNER'S OWN ASSETS (`public/brand/flags/`), 21x15 SVGs
 * from the Figma set. An earlier version used regional-indicator EMOJI because
 * the comp exported only one flag and hand-drawing the rest is the mistake ADR
 * 0018 exists to prevent — emoji rendered correctly on iPhone and Android and
 * degraded to two letters on Windows. Real assets render the same everywhere,
 * and the fallback note is kept only in this sentence.
 *
 * THE SHEET («Country Picker Mobile», 2026-09-30) is the enhancement on top:
 * once hydrated, a tap opens a searchable sheet with the flags and each
 * country's currency (`CountrySheet`); before that, this select is the pill.
 * The pill shows the currency the country prices in, so a customer knows
 * what they will pay in.
 *
 * THE PHONE PILL FITS THE ROOM IT IS GIVEN, NOT THE ROOM THE COMP HAD. The
 * phone comp (`6847:97681`, Arabic, 360) draws flag + «الإمارات» + chevron
 * beside the logo and nothing else; the rewards chip (ADR 0043) and the
 * currency arrived later and share the row. «United Arab Emirates AED» is
 * ~199px, a member's «1,800,000» chip ~98px, and at 360 the row has 155px for
 * both — so a pill that always drew everything pushed the logo to zero width
 * and ran off the screen (2026-10-11). The `sm` pill is therefore a CONTAINER
 * (`@container`) holding whatever the chip and the basket leave over, and it
 * drops parts as that space shrinks — the name first (it ellipsizes before it
 * goes), then the chevron, then the currency, leaving the flag, which always
 * shows. Flag + currency is what the design system's phone header draws.
 * From `sm` (640) the whole pill always fits and shows.
 * No comp draws this order: it is ours, recorded here and owed an owner look.
 * The thresholds are the measured widths of each step (p-2, a 21px flag, gap
 * 4, a 20px chevron, a three-letter code up to ~28px at Caption 12). The `lg`
 * pill is untouched: the desktop row has the room.
 */
export function CountrySwitcher({
  locale,
  country,
  size = "sm",
}: {
  locale: Locale;
  country: string;
  /**
   * `sm` is the phone header's pill (`6847:97681`, 36px, Caption 12);
   * `lg` is the desktop header's (`6883:34340`, 41px, Heading/Medium-M 18,
   * a 24×17 flag and a 24px chevron). One control, two drawings.
   */
  size?: "sm" | "lg";
}) {
  const large = size === "lg";
  // Both headers are in the DOM at once (one is hidden per breakpoint), so the
  // select's id has to differ or the second label points at the first select.
  const selectId = `country-${size}`;
  const m = messagesFor(locale);
  const current = countryOption(country);
  // Null for the one row that is not a country — see `flagSrc`.
  const flag = flagSrc(current.code);

  const rows: CountryRow[] = COUNTRIES.map((c) => ({
    code: c.code,
    name: c.name,
    currency: currencyForChoice(c.code),
    flag: flagSrc(c.code),
    group: countryGroup(c.code),
  }));

  const control = (
    <div className={large ? "relative shrink-0" : "relative min-w-[37px] max-w-full"}>
      <form action="/api/preferences" method="post" className="relative">
        <ReturnPathInput />

        {/* The comp's gradient, verbatim from the Figma fill. A literal until
            ADR 0017's semantic token layer lands, like the other two brand
            gradients already in the storefront. */}
        <div
          className={`flex items-center gap-1 rounded-[8px] p-2 font-medium text-[var(--color-on-primary)] ${
            large ? "h-[41px] text-heading-m leading-[1.4]" : "h-9 min-w-0 text-caption"
          }`}
          // The brand ramp, from its one declaration in globals.css — which also
          // lifts it for the dark theme, where these stops were illegible.
          style={{ backgroundImage: "var(--gradient-brand)" }}
        >
          {/* FLAG FIRST, CHEVRON LAST, and that order is the whole fix.
              The Arabic comp draws the flag against the pill's leading (right)
              edge and the chevron against its trailing (left) one. A first child
              sits on the RIGHT under `dir=rtl`, so the flag has to be first —
              the previous order put the chevron where the flag belongs and
              rendered the pill mirrored against the frame it came from. Same
              trap the header's own docblock records for the logo row: the export
              reads left-to-right and the page does not.

              Fixed box, both dimensions set, and the image fills it — never
              `auto`, which lets an SVG assert its own intrinsic size and blow
              the pill open. `rounded-[2px]` is the comp's own corner on the
              flag, not the pill's. */}
          {flag === null ? null : (
            <Image
              src={flag}
              alt=""
              aria-hidden
              width={large ? 24 : 21}
              height={large ? 17 : 15}
              className={`shrink-0 rounded-[2px] ${large ? "h-[17px] w-6" : "h-[15px] w-[21px] max-w-none"}`}
            />
          )}
          {/* On the phone each part shows only from the container width it
              needs (see the docblock): name ≥ 136px, chevron ≥ 96px,
              currency ≥ 70px; the flag always. From `sm` all of it. «Other»
              has no flag, so there the currency is the part that always
              shows — never an empty gradient box. */}
          <span className={large ? "whitespace-nowrap" : "hidden min-w-0 truncate @min-[8.5rem]:block sm:block"}>{current.name[locale]}</span>
          <bdi dir="ltr" className={`shrink-0 whitespace-nowrap opacity-80 ${large || flag === null ? "" : "hidden @min-[4.375rem]:inline sm:inline"}`}>
            {currencyForChoice(current.code)}
          </bdi>
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className={`shrink-0 ${large ? "size-6" : "hidden size-5 @min-[6rem]:block sm:block"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>

        <label htmlFor={selectId} className="sr-only">
          {m.common.country}
        </label>
        <AutoSubmitSelect
          id={selectId}
          name="country"
          defaultValue={country}
          options={COUNTRIES.map((c) => c.code)}
          labels={Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name[locale]]))}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />

        {/* The control that works before hydration, with a blocked bundle, or
            for a keyboard user who has moved the selection without committing
            it — the same reason the currency switcher keeps its own, spelled out
            there. `sr-only` rather than `hidden`: it must stay reachable, and a
            sighted customer never needs it because the select applies on change. */}
        <button type="submit" className="sr-only">
          {m.common.apply}
        </button>
      </form>
      <CountrySheet locale={locale} current={current.code} rows={rows} labels={m.countryPicker} openLabel={m.common.country} />
    </div>
  );

  if (large) {
    return control;
  }

  // Below `sm` the container takes the row's leftover width and pins the pill
  // to its end; the pill's own `relative` box stays inside it, hugging the
  // pill, so the sheet's full-size tap target never spreads over the empty
  // space. That box never goes below the flag-only pill (8 + 21 + 8 = 37px:
  // every larger step is only shown once the container has its width), and
  // the flag is `max-w-none` — preflight's `max-width: 100%` would otherwise
  // let a crowded row crush the pill to a sliver with no flag in it. The
  // container keeps the same floor: a container has no content size, and
  // without one a row too narrow for even the flag (a seven-digit balance
  // below ~350px) slid the pill over the chip's figure. Now that row is wider
  // than the screen instead — nothing hidden, the logo still whole. A container has no width of its own, so whatever the pill does not
  // use sits between it and the chip — under one step's width on a phone.
  // From `sm` (a tablet's phone header has room for every part) it is a plain
  // box again and the pill sits beside the chip, as before.
  return <div className={`@container ${PHONE_PILL_ROOM} sm:[container-type:normal]`}>{control}</div>;
}
