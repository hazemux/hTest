import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthField, AuthShell, AuthSubmit } from "@/components/account/AuthShell";
import { CountryCityFields } from "@/components/account/CountryCityFields";
import { OptInBox } from "@/components/ui/OptInBox";
import { completeSignUp } from "@/lib/account/actions";
import { placeForProfile } from "@/lib/account/profile-choices";
import { requireCustomer } from "@/lib/account/guard";
import { RESIDENCE_COUNTRIES } from "@/lib/currency/countries";
import { isLocale } from "@/lib/i18n/locales";
import { isInternalPath } from "@/lib/navigation/internal-path";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Create an account, the last step — Figma `6847:78561`: first and last name,
 * country and city, «تأكيد».
 *
 * REACHED SIGNED IN. The code on the step before created the account (or
 * signed into an existing one), so this page stands behind `requireCustomer`
 * and saves with `PATCH /me`. Any verified customer whose account has no name
 * lands here after the code — a new sign-up, or an older WhatsApp account that
 * never gave one — and every field is prefilled from what the account already
 * holds, so it can never blank anything.
 *
 * WHERE THIS DEPARTS FROM THE COMP, AND WHY:
 *   - The city dropdown is filled from the chosen country
 *     (`CountryCityFields`, `GET /content/cities`) — chosen, never typed. An
 *     empty account opens on its phone number's country and the city
 *     Cloudflare placed the visitor in there (`placeForProfile`); the
 *     customer still chooses.
 *   - An optional password, which the comp does not draw, and only for an
 *     account that has none. Without it a new customer would have no way to
 *     set one anywhere — the old sign-up form was the only place.
 *   - No «رجوع» and no step dots: the code has been spent and the account
 *     exists, so "back" has nowhere honest to go.
 *   - «تذكيرات وعروض» (contract v0.1.91; the owner, 2026-10-04 and
 *     2026-10-18): ONE UNTICKED BOX PER CHANNEL, WhatsApp and email — the
 *     guest checkout's own boxes and words (`OptInBox`,
 *     `checkout.marketing*`), so the same question reads the same wherever
 *     it is asked. Opt-in, never assumed. NO COMP draws them: built to the
 *     design system, as the checkout's are.
 *   - The legal notice under «تأكيد», because confirming records acceptance
 *     of the terms and the privacy policy as published now
 *     (`completeSignUp`) — the sign-up page's own `termsNote`, same look.
 */
export default async function SignUpDetailsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { error, next } = await props.searchParams;
  const back = isInternalPath(next) ? next : "";

  const { customer } = await requireCustomer(
    locale,
    `/${locale}/account/sign-up/details${back ? `?next=${encodeURIComponent(back)}` : ""}`,
  );
  const m = messagesFor(locale);
  // One stored name, two fields: split at the first space so saving joins it back unchanged.
  const [firstName = "", ...rest] = (customer.name ?? "").trim().split(/\s+/);
  const lastName = rest.join(" ");
  // A new account opens on its phone's country and the visitor's city there (owner, 2026-10-10).
  const place = await placeForProfile(customer, locale);

  return (
    <AuthShell locale={locale} active={null} title={m.account.detailsTitle} lead={m.account.detailsLead} error={error}>
      <form action={completeSignUp} className="flex flex-col gap-8">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={back} />

        <div className="flex flex-col gap-3">
          {/* Two columns exactly as the comp draws them; `grid` needs no
              direction conditional — the first column lands on the reading side
              in both languages. A name is written in the customer's own script,
              so these two inherit the page's direction. */}
          <div className="grid grid-cols-2 gap-3">
            <AuthField
              label={m.account.firstName}
              name="first_name"
              type="text"
              dir="auto"
              required
              autoComplete="given-name"
              maxLength={80}
              defaultValue={firstName}
            />
            <AuthField
              label={m.account.lastName}
              name="last_name"
              type="text"
              dir="auto"
              autoComplete="family-name"
              maxLength={80}
              defaultValue={lastName}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CountryCityFields
              locale={locale}
              countries={RESIDENCE_COUNTRIES.map((c) => ({ value: c.code, label: c.name[locale] }))}
              initialCountry={place.country}
              initialCities={place.cities}
              initialCityId={place.cityId}
              initialCityName={customer.city_name ?? null}
              labels={{
                country: m.account.country,
                city: m.account.city,
                chooseCountry: m.account.chooseCountry,
                chooseCity: m.account.chooseCity,
                chooseCountryFirst: m.account.chooseCountryFirst,
              }}
              wrapperClassName="block w-full"
              labelClassName="block text-heading-m font-semibold text-[var(--color-ink)]"
              selectClassName="mt-2 w-full rounded-[12px] bg-[var(--color-field)] p-4 text-body-l font-semibold text-[var(--color-ink)] focus:ring-2 focus:ring-[var(--color-brand-500)] disabled:opacity-60"
            />
          </div>

          {customer.has_password ? null : (
            <AuthField
              label={`${m.account.password} ${m.account.optional}`}
              name="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              hint={m.account.passwordHint}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <OptInBox name="marketing_whatsapp" value="1" label={m.checkout.marketingWhatsapp} />
            <OptInBox name="marketing_email" value="1" label={m.checkout.marketingEmail} />
          </div>
          <AuthSubmit>{m.account.createAccount}</AuthSubmit>
          <p className="text-center text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.account.termsNote}</p>
        </div>
      </form>
    </AuthShell>
  );
}
