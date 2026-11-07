import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { requireCustomer } from "@/lib/account/guard";
import {
  deleteAccountAction,
  requestClosureCodesAction,
  type DeleteCodeProblem,
} from "@/lib/account/password-and-deletion-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ problem?: string }>;
};

const PROBLEMS: readonly DeleteCodeProblem[] = ["phone_code", "card", "failed"];

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.deleteCodeTitle } : {};
}

/**
 * «رمز التأكيد» for closing the account: the code sent on WhatsApp to the
 * account's number — the only one since v0.1.167 (the owner, 2026-11-07,
 * replacing the two codes of v0.1.55).
 *
 * Laid out like the step-up screen (`/account/verify`) so the two read as
 * one family: the account frame, a line saying where the code went, one
 * field (a paste and the phone's one-time-code autofill both land), and it
 * works with no script. The refusal names the field to fix; the code itself
 * never travels in a URL.
 */
export default async function DeleteCodePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { customer } = await requireCustomer(locale, `/${locale}/account/settings/security/delete/code`);
  const { problem: rawProblem } = await props.searchParams;
  const problem = PROBLEMS.find((p) => p === rawProblem) ?? null;

  const [before, after] = m.account.deleteCodeLead.split("{phone}");
  const button =
    "h-[52px] w-full rounded-[12px] bg-[var(--color-error)] text-body-l font-semibold text-white lg:text-heading-m transition hover:brightness-95 lg:max-w-[420px]";

  return (
    <AccountShell locale={locale} active="settings">
      <AccountCard title={m.account.deleteCodeTitle}>
        {problem === "card" || problem === "failed" ? (
          <p role="alert" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
            {problem === "card" ? m.account.deleteCardFailed : m.account.deleteFailed}
          </p>
        ) : null}

        <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">
          {before}
          <bdi dir="ltr" className="font-semibold text-[var(--color-ink)]">
            {customer.phone}
          </bdi>
          {after}
        </p>

        <form action={deleteAccountAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="locale" value={locale} />
          <CodeField name="phone_code" label={m.account.whatsappCode} error={problem === "phone_code" ? m.account.deleteCodeWrong : null} />
          <SubmitButton className={button}>
            {m.account.deleteConfirm}
          </SubmitButton>
        </form>

        {/* A POST: each resend is a real WhatsApp message. */}
        <form action={requestClosureCodesAction} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="locale" value={locale} />
          <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
          <SubmitButton className="text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l">
            {m.account.resendCode}
          </SubmitButton>
        </form>
      </AccountCard>
    </AccountShell>
  );
}

function CodeField({ name, label, error }: { name: string; label: string; error: string | null }) {
  return (
    <label className="flex flex-col gap-2 lg:max-w-[420px]">
      <span className="text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">{label}</span>
      <input
        type="text"
        name={name}
        dir="ltr"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={8}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        className={`${FIELD_CONTROL_CLASS} aria-[invalid=true]:border-[var(--color-error)]`}
      />
      {error ? (
        <span id={`${name}-error`} role="alert" className="text-caption leading-[1.5] text-[var(--color-error)] lg:text-body-s">
          {error}
        </span>
      ) : null}
    </label>
  );
}
