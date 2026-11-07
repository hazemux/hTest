import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthField, AuthShell, AuthSubmit } from "@/components/account/AuthShell";
import { finishSocialPhone } from "@/lib/account/social-actions";
import { readPendingSocial } from "@/lib/account/social-handoff";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/** The WhatsApp code of the Google/Apple phone step. */
export default async function SocialPhoneCodePage(props: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  // Per request, always: a step of signing in, signing up or resetting a password; its state is in cookies and the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const pending = await readPendingSocial();
  if (!pending?.phone) redirect(`/${locale}/account/sign-in/phone`);

  const m = messagesFor(locale);
  const { error } = await props.searchParams;

  return (
    <AuthShell
      locale={locale}
      active={null}
      title={m.account.code}
      lead={m.account.codeLead}
      error={error}
      footer={
        <Link href={`/${locale}/account/sign-in/phone`} className="font-semibold text-[var(--color-brand-500)] underline">
          {m.account.changeNumber}
        </Link>
      }
    >
      <form action={finishSocialPhone} className="flex flex-col gap-8">
        <input type="hidden" name="locale" value={locale} />
        <AuthField label={m.account.code} name="code" type="text" dir="ltr" required autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
        <AuthSubmit>{m.account.verifyCode}</AuthSubmit>
      </form>
    </AuthShell>
  );
}
