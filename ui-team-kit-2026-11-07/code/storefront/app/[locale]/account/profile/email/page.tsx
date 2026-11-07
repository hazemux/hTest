import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { AddEmailStepper } from "@/components/account/AddEmailStepper";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { addEmailEditPath, stepsOf } from "@/lib/account/add-email-flow";
import { isAuthErrorCode } from "@/lib/account/errors";
import { requireCustomer } from "@/lib/account/guard";
import { readPendingEmail } from "@/lib/account/pending-email";
import { finishEmailChange, resendEmailCode } from "@/lib/account/profile-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ problem?: string; sent?: string; flow?: string; steps?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.emailCodeTitle } : {};
}

/**
 * The code that proves a new email — step two of adding or changing it, inside
 * the account frame beside «المعلومات الشخصية».
 *
 * One field with `autocomplete="one-time-code"`, like the sign-in code step and
 * for the same reasons (a pasted six-digit code, no JavaScript). The address
 * the code went to comes from an HttpOnly cookie the first step set
 * (`lib/account/pending-email.ts`), never from the URL; without it there is no
 * code to type, so the customer goes back to the profile.
 */
export default async function EmailCodePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  await requireCustomer(locale, `/${locale}/account/profile/email`);

  const email = await readPendingEmail();
  if (!email) redirect(`/${locale}/account/profile?problem=challenge_expired#email`);

  const { problem, sent, flow, steps: rawSteps } = await props.searchParams;
  const m = messagesFor(locale);
  const message = problem && isAuthErrorCode(problem) ? m.account.errors[problem] : null;
  // The last step of «أضف بريدك» (owner, 2026-10-27): numbered, its own words.
  const adding = flow === "add";
  const steps = stepsOf(rawSteps);
  const flowFields = adding ? (
    <>
      <input type="hidden" name="flow" value="add" />
      <input type="hidden" name="steps" value={steps} />
    </>
  ) : null;

  const [before, after] = m.account.emailCodeLead.split("{email}");

  return (
    <AccountShell locale={locale} active="personalInfo">
      <AccountCard title={adding ? m.account.addEmailCodeTitle : m.account.emailCodeTitle}>
        {adding ? <AddEmailStepper locale={locale} step={steps} total={steps} /> : null}
        {message ? (
          <p
            role="alert"
            className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l"
          >
            {message}
          </p>
        ) : null}
        {sent === "1" && !message ? (
          <p
            role="status"
            className="mb-4 rounded-[12px] bg-[var(--color-brand-wash)] px-4 py-3 text-body-s font-medium text-[var(--color-brand-700)] lg:text-body-l"
          >
            {m.account.codeResent}
          </p>
        ) : null}

        {adding ? (
          <div className="flex flex-col gap-1 lg:max-w-[420px]">
            <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">{m.account.addEmailCodeLead}</p>
            <bdi dir="ltr" className="self-start text-body-m font-bold text-[var(--color-ink)] lg:text-body-l">
              {email}
            </bdi>
          </div>
        ) : (
          <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">
            {before}
            {/* An address is Latin text: LTR, isolated, so the Arabic sentence
                around it keeps its order. */}
            <bdi dir="ltr" className="font-semibold text-[var(--color-ink)]">
              {email}
            </bdi>
            {after}
          </p>
        )}

        <form action={finishEmailChange} className="mt-6 flex flex-col gap-6">
          <input type="hidden" name="locale" value={locale} />
          {flowFields}
          <label className="flex flex-col gap-2 lg:max-w-[420px]">
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
            className="h-[57px] self-start rounded-[12px] bg-[var(--color-brand-500)] px-8 text-heading-m font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
          >
            {adding ? m.account.addEmailCodeConfirm : m.account.verifyCode}
          </SubmitButton>
        </form>

        {/* A POST: it sends a real email, and a GET link would let a
            prefetcher fire it. */}
        <form action={resendEmailCode} className="mt-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="locale" value={locale} />
          {flowFields}
          <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
          <SubmitButton className="text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l">
            {m.account.resendCode}
          </SubmitButton>
        </form>

        <Link
          href={adding ? addEmailEditPath(locale) : `/${locale}/account/profile#email`}
          className="mt-4 inline-block text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l"
        >
          {m.account.differentEmail}
        </Link>
        {adding ? <p className="mt-4 text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.account.addEmailCodeNote}</p> : null}
      </AccountCard>
    </AccountShell>
  );
}
