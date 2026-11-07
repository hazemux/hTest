import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { isAuthErrorCode } from "@/lib/account/errors";
import { requireCustomer } from "@/lib/account/guard";
import { startPhoneChange } from "@/lib/account/security-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ problem?: string; done?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.phoneTitle } : {};
}

/**
 * «تغيير رقم الهاتف» — Figma `6847:67752`: the current number, the new one,
 * «تأكيد الرقم». Two codes (owner, 2026-09-29): a step-up to the CURRENT number
 * (or the proved email) proves the account is theirs, then a code to the NEW
 * number proves they hold it.
 *
 * The current number is shown, not typed: the comp draws it as an input, but
 * the account already knows it, and asking for it again proves nothing a
 * code to it does not prove better.
 */
export default async function PhonePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { customer } = await requireCustomer(locale, `/${locale}/account/settings/security/phone`);
  const { problem, done } = await props.searchParams;
  const m = messagesFor(locale);
  const message = problem && isAuthErrorCode(problem) ? m.account.errors[problem] : null;
  const label = "text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l";

  return (
    <AccountShell locale={locale} active="settings">
      <AccountCard title={m.account.phoneTitle}>
        {done === "1" ? (
          <p role="status" className="cq-notice-auto mb-4 rounded-[12px] bg-[var(--color-success-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-success)] lg:text-body-l">
            {m.account.phoneChanged}
          </p>
        ) : null}
        {message ? (
          <p role="alert" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
            {message}
          </p>
        ) : null}

        <form action={startPhoneChange} className="flex flex-col gap-6 lg:max-w-[420px]">
          <input type="hidden" name="locale" value={locale} />
          <div className="flex flex-col gap-2">
            <span className={label}>{m.account.currentPhone}</span>
            <p dir="ltr" className={`${FIELD_CONTROL_CLASS} flex items-center text-[var(--color-ink-muted)] rtl:justify-end`}>
              {customer.phone}
            </p>
          </div>
          <label className="flex flex-col gap-2">
            <span className={label}>{m.account.newPhone}</span>
            <input
              type="tel"
              name="phone"
              dir="ltr"
              required
              placeholder="+9715XXXXXXXX"
              autoComplete="tel"
              inputMode="tel"
              className={FIELD_CONTROL_CLASS}
            />
          </label>
          <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.phoneHint}</p>
          <SubmitButton
            className="h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-semibold lg:text-heading-m text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
          >
            {m.account.confirmPhone}
          </SubmitButton>
        </form>
      </AccountCard>
    </AccountShell>
  );
}
