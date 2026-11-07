import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { ALERT_ACTION_CLASS, AlertBar, alertProps } from "@/components/ui/AlertBar";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { requireCustomer } from "@/lib/account/guard";
import { changePasswordAction, type PasswordProblem } from "@/lib/account/password-and-deletion-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; problem?: string }>;
};

const PROBLEMS: readonly PasswordProblem[] = ["wrong_current", "mismatch", "too_short", "same", "failed"];

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.securityChangePassword } : {};
}

/**
 * «تغيير كلمة السر» — Figma `6847:90298`: three labelled fields (current,
 * new, confirm) on the 6% grey, «هل نسيت كلمة السر؟» under the first, and
 * «حفظ» at the foot. `6847:90420` is the refusal — the field to fix gets the
 * error stroke and its message beneath; `6847:90546` the green «تم حفظ التغير»
 * bar with «اغلاق» above the form.
 *
 * «هل نسيت كلمة السر؟» leads to «استعادة كلمة السر» (v0.1.56): a code on
 * WhatsApp or to the proved email, then a new password — no old one needed.
 *
 * AN ACCOUNT WITH NO PASSWORD (signed up by code) has nothing to prove with,
 * so it is sent to the profile's «إضافة كلمة مرور» instead of a form it could
 * never complete.
 */
export default async function ChangePasswordPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { customer } = await requireCustomer(locale, `/${locale}/account/settings/security/password`);
  const params = await props.searchParams;
  const problem = PROBLEMS.find((p) => p === params.problem) ?? null;
  const saved = params.saved === "1" && problem === null;

  return (
    <AccountShell locale={locale} active="settings">
      <div className="flex flex-col gap-4">
        {saved ? (
          <AlertBar {...alertProps("account.passwordChanged", locale)} animate>
            <Link href={`/${locale}/account/settings/security/password`} className={ALERT_ACTION_CLASS}>
              {m.catalog.close}
            </Link>
          </AlertBar>
        ) : null}
        <h2 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold">{m.account.securityChangePassword}</h2>

        {customer.has_password === false ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body-s leading-[1.5] text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.passwordNone}</p>
            <Link href={`/${locale}/account/profile`} className="text-body-s font-semibold text-[var(--color-brand-500)] lg:text-body-l">
              {m.account.passwordNoneAction}
            </Link>
          </div>
        ) : (
          <form action={changePasswordAction} className="flex flex-col gap-4 lg:max-w-[420px]">
            <input type="hidden" name="locale" value={locale} />
            <Field
              name="current_password"
              label={m.account.currentPassword}
              placeholder={m.account.currentPasswordPlaceholder}
              autoComplete="current-password"
              error={problem === "wrong_current" ? m.account.passwordWrongCurrent : null}
            />
            {/* Figma `6847:90405`: 12px, 4px under the field, at its end edge. */}
            <Link
              href={`/${locale}/account/password/forgot`}
              className="-mt-3 self-end text-caption font-semibold leading-[1.5] lg:text-body-s text-[var(--color-brand-500)]"
            >
              {m.account.forgotPassword}
            </Link>
            <Field
              name="password"
              label={m.account.newPassword}
              autoComplete="new-password"
              minLength={8}
              hint={m.account.newPasswordHint}
              error={problem === "too_short" ? m.account.newPasswordHint : problem === "same" ? m.account.passwordSame : null}
            />
            <Field
              name="password_confirmation"
              label={m.account.confirmNewPassword}
              autoComplete="new-password"
              minLength={8}
              error={problem === "mismatch" ? m.account.passwordMismatch : null}
            />
            {problem === "failed" ? (
              <p role="alert" className="text-caption leading-[1.5] text-[var(--color-error)] lg:text-body-s">
                {m.account.passwordFailed}
              </p>
            ) : null}
            <SubmitButton
              className="mt-6 h-12 w-full rounded-[12px] bg-[var(--color-brand-500)] p-3 text-body-l font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] lg:h-[57px] lg:text-heading-m"
            >
              {m.account.savePassword}
            </SubmitButton>
          </form>
        )}
      </div>
    </AccountShell>
  );
}

function Field({
  name,
  label,
  placeholder,
  autoComplete,
  minLength,
  hint,
  error,
}: {
  name: string;
  label: string;
  placeholder?: string;
  autoComplete: string;
  minLength?: number;
  hint?: string;
  error: string | null;
}) {
  const describedBy = error || hint ? `${name}-note` : undefined;

  return (
    <label className="flex flex-col gap-2">
      <span className="text-body-s font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-body-l">{label}</span>
      <input
        type="password"
        name={name}
        required
        minLength={minLength}
        maxLength={255}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`${FIELD_CONTROL_CLASS} aria-[invalid=true]:border-[var(--color-error)]`}
      />
      {error ? (
        <span id={describedBy} role="alert" className="text-caption leading-[1.5] text-[var(--color-error)] lg:text-body-s">
          {error}
        </span>
      ) : hint ? (
        <span id={describedBy} className="text-caption leading-[1.5] text-[var(--color-ink-subtle)] lg:text-body-s">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
