import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthField, AuthShell, AuthSubmit } from "@/components/account/AuthShell";
import { finishPasswordReset } from "@/lib/account/password-reset-actions";
import { readPendingReset } from "@/lib/account/pending-reset";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.securityChangePassword } : {};
}

/**
 * The new password — Figma `6847:100154`: «تغيير كلمة السر», the new password
 * and its confirmation, «تأكيد». Reachable only with a checked code in the
 * reset cookie; the password itself never touches the client.
 *
 * On success every other session the account had is ended by the API, this
 * browser is signed in, and the change-password screen's «تم حفظ التغير» bar
 * says it worked.
 */
export default async function ForgotPasswordNewPage(props: Props) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const pending = await readPendingReset();
  if (!pending) redirect(`/${locale}/account/password/forgot?error=challenge_expired`);
  if (!pending.code) redirect(`/${locale}/account/password/forgot/code`);

  const { error } = await props.searchParams;

  return (
    <AuthShell
      locale={locale}
      active={null}
      backHref={`/${locale}/account/password/forgot/code`}
      title={m.account.newPasswordTitle}
      lead={m.account.newPasswordLead}
      error={error}
      footer={m.account.otherSessionsNote}
    >
      <form action={finishPasswordReset} className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <AuthField
          label={m.account.newPassword}
          name="password"
          type="password"
          dir="ltr"
          required
          placeholder={m.account.resetNewPasswordPlaceholder}
          placeholderFollowsPage
          autoComplete="new-password"
          hint={m.account.newPasswordHint}
        />
        <AuthField
          label={m.account.confirmNewPassword}
          name="password_confirmation"
          type="password"
          dir="ltr"
          required
          placeholder={m.account.resetConfirmPasswordPlaceholder}
          placeholderFollowsPage
          autoComplete="new-password"
        />
        <AuthSubmit>{m.account.saveNewPassword}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
