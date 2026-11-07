import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthOr, AuthRemember, AuthShell, AuthSubmit, SocialButtons } from "@/components/account/AuthShell";
import { PhoneField } from "@/components/account/PhoneField";
import { phoneCountries } from "@/lib/account/phone-countries";
import { listSocialProviders } from "@/lib/api/client";
import { countryForVisitor } from "@/lib/currency/visitor";
import { DeviceSignalField } from "@/components/account/DeviceSignalField";
import { startOtpSignUp } from "@/lib/account/actions";
import { isLocale } from "@/lib/i18n/locales";
import { isInternalPath } from "@/lib/navigation/internal-path";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * Create an account, step one of three — Figma `6847:78823` (phone) and
 * `6507:13834` (desktop): the toggle, a phone number, the line saying a code is
 * coming, «استمرار».
 *
 * THE COMP'S THREE STEPS, AS DRAWN: this number, then the code
 * (`/account/sign-in/code`, shared with signing in), then name, country and
 * city (`/account/sign-up/details`). The account is created when the CODE is
 * spent, so it only ever exists for someone who holds the phone.
 *
 * It replaced a one-screen form (name, phone, email, password → `POST
 * /auth/register`) that created the account with no code at all: the hint on
 * it promised a WhatsApp code that was never sent, and anyone could register a
 * stranger's number with a password of their own.
 *
 * WHAT THE COMP DRAWS THAT IS NOT HERE: the phone / email radio («اختر طريقة
 * التسجيل») — the email channel cannot be sent by a client generated from the
 * contract (see `startOtp` in `lib/account/actions.ts`). An email is added
 * afterwards from «المعلومات الشخصية», proved by a code sent to it. No password
 * here either, as in the comp; the details step offers one, optionally.
 */
export default async function SignUpPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { error, next } = await props.searchParams;
  const m = messagesFor(locale);

  // Same rule as the action that receives it — a hidden input is a thing a
  // customer (or a crafted link) can edit, so both ends check.
  const back = isInternalPath(next) ? next : "";

  const countries = phoneCountries(locale);
  const country = await countryForVisitor();
  const providers = await listSocialProviders({ locale }).catch(() => ({ google: false, apple: false, passkey: true }));

  return (
    <AuthShell locale={locale} active="sign-up" error={error} next={back || undefined}>
      <div className="flex flex-col gap-5">
        <form action={startOtpSignUp} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={back} />
          <DeviceSignalField />
          <PhoneField
            label={m.account.phone}
            countryLabel={m.account.countryCode}
            hint={m.account.signUpHint}
            countries={countries}
            defaultCountry={country}
          />
          <AuthRemember label={m.account.rememberMe} />
          <AuthSubmit>{m.account.continue}</AuthSubmit>
        </form>

        {/* Apple and Google sign a new customer up too; a passkey is enrolled
            later, from Settings. */}
        {providers.apple || providers.google ? (
          <>
            <AuthOr>{m.account.orSignUp}</AuthOr>
            <div className="flex flex-col gap-2.5">
              <SocialButtons locale={locale} providers={providers} next={back} />
            </div>
          </>
        ) : null}

        <p className="text-center text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.account.termsNote}</p>
      </div>
    </AuthShell>
  );
}
