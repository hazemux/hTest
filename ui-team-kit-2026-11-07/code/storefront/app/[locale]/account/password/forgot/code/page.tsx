import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthShell, AuthSubmit, CodeInput } from "@/components/account/AuthShell";
import { checkPasswordReset, resendPasswordReset } from "@/lib/account/password-reset-actions";
import { readPendingReset } from "@/lib/account/pending-reset";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.code } : {};
}

/**
 * The reset code — Figma `6847:98192` (to the phone) / `6847:98402` (to the
 * email): heading, where the code went, the code, «اعادة ارسال الرمز».
 *
 * One field rather than the comp's boxes, for the reasons the sign-in code
 * screen gives (a six-digit code, a paste, the OS's one-time-code autofill,
 * no script). Where the code went is in the HttpOnly cookie step one set,
 * never in this page's URL; without it, back to step one.
 *
 * BY EMAIL IT SAYS "IF" (owner, 2026-10-28). The API sends only to an email
 * confirmed on an account and answers the same either way, so nobody can use
 * this screen to learn who has an account. It used to say the code HAD been
 * sent: a customer asked three times in two minutes for a code that never
 * existed (5 of the first 26 accounts had an email at all). The screen now
 * says so conditionally and points to the way that works for everyone, the
 * WhatsApp code on the sign-in page, where an old-store customer also finds
 * their past orders by the same number (`oldStoreHint`).
 */
export default async function ForgotPasswordCodePage(props: Props) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const pending = await readPendingReset();
  if (!pending) redirect(`/${locale}/account/password/forgot?error=challenge_expired`);

  const { error, sent } = await props.searchParams;
  const byEmail = pending.by === "email";
  const start = `/${locale}/account/password/forgot${byEmail ? "?by=email" : ""}`;

  return (
    <AuthShell
      locale={locale}
      active={null}
      backHref={start}
      title={m.account.codeTitle}
      lead={byEmail ? m.account.resetCodeLeadEmail : m.account.codeLead}
      error={error}
      footer={
        <Link href={start} className="font-bold text-[var(--color-brand-500)]">
          {m.account.resetChangeTarget}
        </Link>
      }
    >
      {sent === "1" && !error ? (
        <p role="status" className="mb-4 rounded-[10px] bg-[var(--color-primary-wash-lighter)] px-3 py-2.5 text-body-s font-semibold text-[var(--color-brand-500)] lg:text-body-l">
          {byEmail ? m.account.resetCodeResentEmail : m.account.codeResent}
        </p>
      ) : null}

      <form action={checkPasswordReset} className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <CodeInput label={m.account.code} />
        <AuthSubmit>{m.account.verifyCode}</AuthSubmit>
      </form>

      {/* A POST: each resend is a real WhatsApp message or email. */}
      <form action={resendPasswordReset} className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
        <input type="hidden" name="locale" value={locale} />
        <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
        <SubmitButton className="text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-l">
          {m.account.resendCode}
        </SubmitButton>
      </form>

      {byEmail ? (
        <div className="mt-5 flex flex-col gap-3 rounded-[12px] bg-[var(--color-chip)] p-3.5">
          <p className="text-caption text-[var(--color-ink-muted)] lg:text-body-s">{m.account.resetEmailPhoneHint}</p>
          <Link
            href={`/${locale}/account/sign-in`}
            className="flex h-10 items-center justify-center rounded-[10px] bg-[var(--background)] text-body-s font-bold text-[var(--color-brand-500)] lg:text-body-l"
          >
            {m.account.resetUsePhone}
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}
