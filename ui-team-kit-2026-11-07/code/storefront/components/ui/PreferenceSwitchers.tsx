import { AutoSubmitSelect } from "@/components/ui/AutoSubmitSelect";
import { SUPPORTED_CURRENCIES } from "@/lib/currency/for-country";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { ReturnPathInput } from "@/components/ui/ReturnPathInput";
import { ReplacingLocaleForm } from "@/components/ui/ReplacingLocaleForm";

/**
 * Language and currency switchers.
 *
 * Both are plain forms posting to `/api/preferences`. No client component, no
 * hydration, no JavaScript — see that route's docblock for why that matters
 * on the connections these customers actually use.
 *
 * `next` carries the current path so the customer lands back where they were
 * rather than on the home page, which is the difference between changing
 * currency and losing your place.
 */

export function CurrencySwitcher({
  locale,
  currency,
}: {
  locale: Locale;
  currency: string;
}) {
  const m = messagesFor(locale);

  return (
    <form
      action="/api/preferences"
      method="post"
      className="flex items-center gap-2"
    >
      <ReturnPathInput />
      <label htmlFor="currency" className="sr-only">
        {m.common.currency}
      </label>
      <AutoSubmitSelect
        id="currency"
        name="currency"
        defaultValue={currency}
        options={SUPPORTED_CURRENCIES}
        className="rounded-lg border border-[var(--color-brand-200)] bg-[var(--color-surface-raised)] px-2 py-1 text-body-s"
      />
      {/* Choosing a currency now applies it immediately — see
          AutoSubmitSelect. This button STAYS anyway: it is the only control
          that works before hydration, with JavaScript unavailable, or for
          someone navigating the select by keyboard who has not committed a
          choice yet. It is redundant once the script runs, and redundant is
          the correct trade against a customer who cannot change currency at
          all. It is deliberately not hidden by a CSS class that would have to
          exist for the hiding to happen. */}
      <button
        type="submit"
        className="rounded-lg bg-[var(--color-brand-500)] px-3 py-1 text-body-s text-[var(--color-on-primary)]"
      >
        {m.common.apply}
      </button>
    </form>
  );
}

/** The language a switch would move to — there are two, so "the other one". */
export function otherLocale(locale: Locale): Locale {
  return LOCALES.find((l) => l !== locale) as Locale;
}

/**
 * What the control is LABELLED with: the language it switches TO, written in
 * that language's own script.
 *
 * The account-menu comp draws this row reading "العربية" on the Arabic page —
 * the language you are already in. A button labelled with the language it takes
 * you OUT of is a control that says the opposite of what it does, and its
 * accessible name would then contradict its action too. So the mechanism's
 * long-standing semantics win over the comp's label, in one place, for both
 * places that show it.
 */
export function localeSwitchLabel(locale: Locale): string {
  const m = messagesFor(locale);
  return otherLocale(locale) === "ar" ? m.common.switchToArabic : m.common.switchToEnglish;
}

/**
 * The ONE thing in this app that changes the language.
 *
 * A plain form POSTing to `/api/preferences`, which works with no script at
 * all; once hydrated, `ReplacingLocaleForm` makes the switch REPLACE the
 * current history entry rather than push one, so Back after a switch goes to
 * the page before it, not to this page in the other language. It is shared rather than copied because a second
 * language switch would be a second place for the path swap below to be got
 * wrong, and the two live in different components (the header pill and the
 * account menu's language row) that must not drift apart.
 *
 * Callers supply the button's contents and its classes; everything that makes
 * the switch WORK — the target locale, the return path, the method — is here.
 */
export function LocaleSwitchForm({
  locale,
  className,
  buttonClassName,
  children,
}: {
  locale: Locale;
  className?: string;
  buttonClassName?: string;
  children: React.ReactNode;
}) {
  const other = otherLocale(locale);

  return (
    <ReplacingLocaleForm className={className}>
      <input type="hidden" name="locale" value={other} />
      <ReturnPathInput toLocale={other} />
      {/* `lang` but NOT `dir`. The button sits in the page's own row structure
          — the drawer's icon-then-label rows — and a `dir="ltr"` here flipped
          the English row on the Arabic page: icon on the left, label on the
          right, out of line with every row above it. The label's script is
          still announced correctly through `lang`. */}
      <button type="submit" lang={other} className={buttonClassName}>
        {children}
      </button>
    </ReplacingLocaleForm>
  );
}

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  return (
    <LocaleSwitchForm
      locale={locale}
      buttonClassName="rounded-lg border border-[var(--color-brand-200)] px-3 py-1 text-body-s"
    >
      {localeSwitchLabel(locale)}
    </LocaleSwitchForm>
  );
}

/**
 * «العربية | English» as one segmented control (the drawer's footer and the
 * settings page, 2026-09-30): the language the page is in is drawn selected,
 * the other is the same plain-form switch as everywhere else, so it works
 * before any script loads. Each name is written in its own script.
 */
export function LocaleSegment({ locale, label }: { locale: Locale; label: string }) {
  const m = messagesFor(locale);
  const names: Record<Locale, string> = { ar: m.common.switchToArabic, en: m.common.switchToEnglish };
  const segment = "block rounded-[8px] px-2.5 py-1 text-caption font-bold leading-[1.5]";

  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-[10px] bg-[var(--color-chip)] p-[3px]">
      {LOCALES.map((each) =>
        each === locale ? (
          <span key={each} lang={each} aria-current="true" className={`${segment} bg-[var(--background)] text-[var(--color-brand-500)] shadow-sm`}>
            {names[each]}
          </span>
        ) : (
          <LocaleSwitchForm key={each} locale={locale} buttonClassName={`${segment} text-[var(--color-ink-subtle)] hover:text-[var(--color-ink)]`}>
            {names[each]}
          </LocaleSwitchForm>
        ),
      )}
    </div>
  );
}
