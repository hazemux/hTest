import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { isAuthErrorCode } from "@/lib/account/errors";
import { requireCustomer } from "@/lib/account/guard";
import { readPendingPhone } from "@/lib/account/pending-phone";
import { finishPhoneChange, resendPhoneCode } from "@/lib/account/security-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ problem?: string; sent?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.phoneTitle } : {};
}

/** The code sent to the NEW number — the second of the two. */
export default async function PhoneCodePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  await requireCustomer(locale, `/${locale}/account/settings/security/phone/code`);
  const phone = await readPendingPhone();
  if (!phone) redirect(`/${locale}/account/settings/security/phone?problem=challenge_expired`);

  const { problem, sent } = await props.searchParams;
  const m = messagesFor(locale);
  const message = problem && isAuthErrorCode(problem) ? m.account.errors[problem] : null;
  const [before, after] = m.account.phoneCodeLead.split("{phone}");

  return (
    <AccountShell locale={locale} active="settings">
      <AccountCard title={m.account.verifyTitle}>
        {message ? (
          <p role="alert" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
            {message}
          </p>
        ) : null}
        {sent === "1" && !message ? (
          <p role="status" className="mb-4 rounded-[12px] bg-[var(--color-brand-wash)] px-4 py-3 text-body-s font-medium text-[var(--color-brand-700)] lg:text-body-l">
            {m.account.codeResent}
          </p>
        ) : null}

        <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">
          {before}
          <bdi dir="ltr" className="font-semibold text-[var(--color-ink)]">
            {phone}
          </bdi>
          {after}
        </p>

        <form action={finishPhoneChange} className="mt-6 flex flex-col gap-4 lg:max-w-[420px]">
          <input type="hidden" name="locale" value={locale} />
          <label className="flex flex-col gap-2">
            <span className="text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">{m.account.code}</span>
            <input
              type="text"
              name="code"
              dir="ltr"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              className={FIELD_CONTROL_CLASS}
            />
          </label>
          <SubmitButton
            className="h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-semibold lg:text-heading-m text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
          >
            {m.account.confirmPhone}
          </SubmitButton>
        </form>

        <form action={resendPhoneCode} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="locale" value={locale} />
          <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
          <SubmitButton className="text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l">
            {m.account.resendCode}
          </SubmitButton>
        </form>

        <Link
          href={`/${locale}/account/settings/security/phone`}
          className="mt-4 inline-block text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l"
        >
          {m.account.differentPhone}
        </Link>
      </AccountCard>
    </AccountShell>
  );
}
