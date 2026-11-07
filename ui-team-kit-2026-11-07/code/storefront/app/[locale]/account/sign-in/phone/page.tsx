import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthShell, AuthSubmit } from "@/components/account/AuthShell";
import { PhoneField } from "@/components/account/PhoneField";
import { phoneCountries } from "@/lib/account/phone-countries";
import { countryForVisitor } from "@/lib/currency/visitor";
import { startSocialPhone } from "@/lib/account/social-actions";
import { readPendingSocial } from "@/lib/account/social-handoff";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «أكّد رقم جوالك» — the one-time phone step of a Google/Apple sign-in for a
 * customer we cannot match by a proved email (the owner, 2026-09-30). Drawn
 * like the sign-in code screen; the provider's email is named so the
 * customer knows which account they are finishing.
 */
export default async function SocialPhonePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const pending = await readPendingSocial();
  if (!pending) redirect(`/${locale}/account/sign-in?error=challenge_expired`);

  const m = messagesFor(locale);
  const { error } = await props.searchParams;
  const provider = pending.provider === "apple" ? "Apple" : "Google";

  return (
    <AuthShell
      locale={locale}
      active={null}
      title={m.account.socialPhoneTitle}
      lead={m.account.socialPhoneLead.replace("{provider}", provider)}
      error={error}
    >
      {pending.email ? (
        <p dir="ltr" className="mb-4 text-start text-body-s font-semibold lg:text-body-l text-[var(--color-ink-muted)]">
          {pending.email}
        </p>
      ) : null}
      <form action={startSocialPhone} className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <PhoneField
          label={m.account.phone}
          countryLabel={m.account.countryCode}
          hint={m.account.otpHint}
          countries={phoneCountries(locale)}
          defaultCountry={await countryForVisitor()}
        />
        <AuthSubmit>{m.account.resetSendCode}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
