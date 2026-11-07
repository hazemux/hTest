import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthField, AuthShell, AuthSubmit } from "@/components/account/AuthShell";
import { PhoneField } from "@/components/account/PhoneField";
import { phoneCountries } from "@/lib/account/phone-countries";
import { countryForVisitor } from "@/lib/currency/visitor";
import { startPasswordReset } from "@/lib/account/password-reset-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ by?: string; error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.resetTitle } : {};
}

/**
 * «استعادة كلمة السر» — Figma `6847:99364`: heading, lead, the phone / email
 * pill, one field, «ارسال الرمز». Reached from «هل نسيت كلمة السر؟» on the
 * sign-in password fold and on «تغيير كلمة السر».
 *
 * THE PILL IS TWO LINKS (`?by=email`), like the sign-in / sign-up toggle: each
 * half is its own form, and both work with no script.
 *
 * The next screen is the same whether or not an account stands behind what
 * was typed — the API answers 204 either way, and nothing here asks.
 */
export default async function ForgotPasswordPage(props: Props) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { by: rawBy, error } = await props.searchParams;
  const by = rawBy === "email" ? "email" : "phone";

  const halves = [
    { key: "phone" as const, label: m.account.phone, href: `/${locale}/account/password/forgot` },
    { key: "email" as const, label: m.account.email, href: `/${locale}/account/password/forgot?by=email` },
  ];

  const countries = phoneCountries(locale);
  const country = await countryForVisitor();

  return (
    <AuthShell
      locale={locale}
      active={null}
      backHref={`/${locale}/account/sign-in`}
      title={m.account.resetTitle}
      lead={m.account.resetLead}
      error={error}
      footer={
        <Link href={`/${locale}/account/sign-in`} className="font-bold text-[var(--color-brand-500)]">
          {m.account.resetBackToSignIn}
        </Link>
      }
    >
      {/* Phone or email — two links, so each is its own form with no script. */}
      <nav aria-label={m.account.resetTitle} className="mb-5 flex gap-1 rounded-[12px] bg-[var(--color-chip)] p-1">
        {halves.map((half) =>
          half.key === by ? (
            <span
              key={half.key}
              aria-current="page"
              className="flex h-10 flex-1 items-center justify-center rounded-[9px] bg-[var(--background)] text-body-s font-bold lg:text-heading-m text-[var(--color-brand-500)] shadow-sm"
            >
              {half.label}
            </span>
          ) : (
            <Link key={half.key} href={half.href} className="flex h-10 flex-1 items-center justify-center rounded-[9px] text-body-s font-bold text-[var(--color-ink-muted)] lg:text-heading-m">
              {half.label}
            </Link>
          ),
        )}
      </nav>

      <form action={startPasswordReset} className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="by" value={by} />
        {by === "phone" ? (
          <PhoneField label={m.account.phone} countryLabel={m.account.countryCode} countries={countries} defaultCountry={country} />
        ) : (
          <AuthField
            label={m.account.email}
            name="email"
            type="email"
            dir="ltr"
            required
            placeholder={m.account.resetEmailPlaceholder}
            placeholderFollowsPage
            autoComplete="email"
            inputMode="email"
          />
        )}
        <AuthSubmit>{m.account.resetSendCode}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
