import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthOr, AuthRemember, AuthShell, AuthSubmit, SocialButtons } from "@/components/account/AuthShell";
import { PhoneField } from "@/components/account/PhoneField";
import { PasskeyButton } from "@/components/account/PasskeyButton";
import { DeviceSignalField } from "@/components/account/DeviceSignalField";
import { signInWithPassword, startOtpSignIn } from "@/lib/account/actions";
import { isCheckoutReturn } from "@/lib/account/auth-href";
import { phoneCountries } from "@/lib/account/phone-countries";
import { listSocialProviders } from "@/lib/api/client";
import { countryForVisitor } from "@/lib/currency/visitor";
import { isLocale } from "@/lib/i18n/locales";
import { isInternalPath } from "@/lib/navigation/internal-path";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

/**
 * Sign in — «Auth Mobile» (Claude Design, 2026-09-30). OTP over WhatsApp is
 * the primary path: the phone field with its country picker, the hint that a
 * code is coming, "remember me", one button. Then «أو» and the passkey,
 * Apple and Google as equal buttons; a password is the fallback, folded away.
 *
 * WHY OTP FIRST, beyond the comp. This store's customers are phone-first, and
 * the account they already have may have been created by an order rather than
 * by choosing a password — `RegisterRequest.password` is nullable for exactly
 * that reason. A password-only sign-in would lock out every customer who never
 * set one.
 *
 * NO JAVASCRIPT IS REQUIRED. Both forms are plain `<form action={serverAction}>`
 * in a Server Component. That is not only the handbook's preference for mobile
 * data (§4) — it is what keeps the PASSWORD out of client JavaScript. The value
 * goes input → FormData → Server Action; it is never a React state variable,
 * never a prop, and never a value any component on the client has held. The
 * same is true of the token that comes back: the action writes it into an
 * HttpOnly cookie and returns nothing.
 *
 * The failure message comes back as `?error=<code>` and is translated on this
 * side (`components/account/AuthShell.tsx`); no server-authored text is shown.
 */
export default async function SignInPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  // Next 16: both are async-only.
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { error, next } = await props.searchParams;
  const m = messagesFor(locale);

  // Same rule as the action that receives it — a hidden input is a thing a
  // customer (or a crafted link) can edit, so both ends check.
  const back = isInternalPath(next) ? next : "";
  // Which of Google and Apple are configured — neither, when the API cannot say.
  const providers = await listSocialProviders({ locale }).catch(() => ({ google: false, apple: false, passkey: true }));

  const countries = phoneCountries(locale);
  const country = await countryForVisitor();

  return (
    <AuthShell locale={locale} active="sign-in" error={error} next={back || undefined}>
      <div className="flex flex-col gap-5">
        {/* Sent here by checkout (guest checkout is off): say the basket is
            kept and what signing in takes, before the customer decides to
            leave (owner, 2026-10-28). */}
        {isCheckoutReturn(locale, back) ? (
          <p
            role="status"
            data-checkout-return
            className="flex items-start gap-2.5 rounded-[12px] bg-[var(--color-primary-wash-lighter)] px-3.5 py-3 text-body-s font-semibold leading-[1.6] text-[var(--color-ink)] lg:text-body-l"
          >
            <span aria-hidden className="mt-0.5 block size-5 shrink-0 bg-[var(--color-brand-500)] [mask-image:url(/brand/icon-cart.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
            <span>{m.account.signInForCheckout}</span>
          </p>
        ) : null}
        {/* THE PHONE IS THE HERO («Auth Mobile»): a code on WhatsApp is the
            way in for most customers. */}
        <form action={startOtpSignIn} className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={back} />
          <DeviceSignalField />
          <PhoneField
            label={m.account.phone}
            countryLabel={m.account.countryCode}
            hint={m.account.otpHint}
            countries={countries}
            defaultCountry={country}
          />
          <AuthRemember label={m.account.rememberMe} />
          <AuthSubmit>{m.account.signIn}</AuthSubmit>
        </form>

        {/* The other ways in, as equal labelled buttons: the passkey (drawn
            only where the browser has WebAuthn), then Apple and Google (only
            once configured). */}
        <AuthOr>{m.account.orDivider}</AuthOr>
        <div className="flex flex-col gap-2.5">
          <PasskeyButton
            mode="sign-in"
            locale={locale}
            next={back}
            label={m.account.signInWithPasskey}
            failedLabel={m.account.errors.passkey_failed}
            className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[12px] text-body-m font-bold text-[var(--color-brand-500)] lg:text-body-l shadow-[inset_0_0_0_1.5px_var(--color-brand-500)] transition hover:bg-[var(--color-primary-wash-lighter)]"
          />
          <SocialButtons locale={locale} providers={providers} next={back} />
        </div>

        {/* «لدي كلمة مرور» — a quiet disclosure at the end. `<details>`, so it
            opens with no JavaScript at all. */}
        <details className="group flex flex-col">
          <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-l [&::-webkit-details-marker]:hidden">
            {m.account.passwordOption}
            <span aria-hidden className="block size-3.5 bg-current transition-transform [mask-image:url(/brand/icon-chevron-down.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-open:rotate-180" />
          </summary>

          <form action={signInWithPassword} className="mt-3 flex flex-col gap-3 rounded-[12px] bg-[var(--color-chip)] p-3.5">
            {/* No account or password moved over from the old store (cutover
                §A1): its customers come in by phone + code, and find their old
                orders under «طلباتي». */}
            <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.account.oldStoreHint}</p>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={back} />
            <DeviceSignalField />
            <label className="sr-only" htmlFor="sign-in-identifier">
              {m.account.identifier}
            </label>
            <input
              id="sign-in-identifier"
              name="identifier"
              type="text"
              // An email OR a phone number — LTR either way.
              dir="ltr"
              required
              autoComplete="username"
              placeholder={m.account.identifier}
              className="h-12 rounded-[10px] bg-[var(--background)] px-3 text-body-s text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] rtl:placeholder:text-right focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
            />
            <label className="sr-only" htmlFor="sign-in-password">
              {m.account.password}
            </label>
            <input
              id="sign-in-password"
              name="password"
              type="password"
              dir="ltr"
              required
              autoComplete="current-password"
              placeholder={m.account.password}
              className="h-12 rounded-[10px] bg-[var(--background)] px-3 text-body-s text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-subtle)] rtl:placeholder:text-right focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
            />
            <Link href={`/${locale}/account/password/forgot`} className="self-end text-caption font-bold lg:text-body-s text-[var(--color-brand-500)]">
              {m.account.forgotPassword}
            </Link>
            <AuthRemember label={m.account.rememberMe} />
            <SubmitButton className="h-[46px] rounded-[10px] bg-[var(--color-ink)] text-body-s font-bold lg:text-body-l text-[var(--background)]">
              {m.account.signIn}
            </SubmitButton>
          </form>
        </details>
      </div>
    </AuthShell>
  );
}
