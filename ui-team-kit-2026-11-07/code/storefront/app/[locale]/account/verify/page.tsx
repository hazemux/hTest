import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { AddEmailStepper } from "@/components/account/AddEmailStepper";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { addEmailEditPath, isAddEmailNext } from "@/lib/account/add-email-flow";
import { isAuthErrorCode } from "@/lib/account/errors";
import { requireCustomer } from "@/lib/account/guard";
import { readPendingEmail } from "@/lib/account/pending-email";
import { confirmStepUpCode, sendStepUpCode } from "@/lib/account/security-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { isInternalPath } from "@/lib/navigation/internal-path";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; intent?: string; sent?: string; problem?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.verifyTitle } : {};
}

const INTENTS = new Set(["enable-two-factor", "disable-two-factor", "phone-change", "email-change"]);

/**
 * «رمز التأكيد» — the step-up check (API v0.1.60): a code to the current
 * number on WhatsApp or, «لا يمكنك الوصول لرقمك الحالي؟», to the proved email.
 * Spending it unlocks this session for 45 minutes, then the customer lands
 * where they were going — or the action they asked for is finished for them
 * (`intent`, see `lib/account/security-actions.ts`).
 *
 * WHERE THIS DEPARTS FROM THE COMP, AND WHY. The comp draws a bottom sheet
 * over the page with five digit boxes and a countdown. Here it is a page in
 * the account frame with one field: the code is six digits (five boxes cannot
 * hold it), one field takes a paste and the phone's one-time-code autofill,
 * and it all works with no script. Sending is a button rather than automatic:
 * a code is a paid WhatsApp message, and opening a link must never send one.
 * The add-email flow (2026-10-27) arrives with `sent=whatsapp` already: its
 * sheet's own «متابعة» press sent the code (`stepUpForAddEmail`), so this page
 * opens on the code field, numbered as step two of three.
 */
export default async function VerifyPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { next, intent, sent, problem } = await props.searchParams;
  const back = isInternalPath(next) ? next : `/${locale}/account`;
  const chosenIntent = intent && INTENTS.has(intent) ? intent : "";
  const here = `/${locale}/account/verify?${new URLSearchParams({ next: back, ...(chosenIntent ? { intent: chosenIntent } : {}) })}`;

  const { customer } = await requireCustomer(locale, here);
  const m = messagesFor(locale);
  // Step two of «أضف بريدك» (owner, 2026-10-27): numbered, with the address
  // being added and a way back to change it. The address is read from its
  // HttpOnly cookie, never the URL.
  const addingEmail = chosenIntent === "email-change" && isAddEmailNext(locale, back) ? ((await readPendingEmail()) ?? null) : null;
  const channel = sent === "email" ? "email" : sent === "whatsapp" ? "whatsapp" : null;
  const message = problem && isAuthErrorCode(problem) ? m.account.errors[problem] : null;

  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={back} />
      {chosenIntent ? <input type="hidden" name="intent" value={chosenIntent} /> : null}
    </>
  );
  const sentLine = (template: string, value: string) => {
    const [before, after] = template.split(/\{(?:phone|email)\}/);
    return (
      <>
        {before}
        <bdi dir="ltr" className="font-semibold text-[var(--color-ink)]">
          {value}
        </bdi>
        {after}
      </>
    );
  };
  const button =
    "h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-semibold lg:text-heading-m text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] lg:max-w-[420px]";

  return (
    <AccountShell locale={locale} active={addingEmail ? "personalInfo" : "settings"}>
      <AccountCard title={addingEmail ? m.account.addEmailVerifyTitle : m.account.verifyTitle}>
        {addingEmail ? (
          <>
            <AddEmailStepper locale={locale} step={2} total={3} />
            <div className="mb-5 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-field)] px-3.5 py-2.5 lg:max-w-[420px]">
              <bdi dir="ltr" className="min-w-0 truncate text-body-s font-semibold text-[var(--color-ink)]">
                {addingEmail}
              </bdi>
              <Link href={addEmailEditPath(locale)} className="shrink-0 text-body-s font-bold text-[var(--color-brand-500)]">
                {m.account.addEmailEdit}
              </Link>
            </div>
          </>
        ) : null}
        {message ? (
          <p role="alert" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
            {problem === "invalid_email" ? m.account.noVerifiedEmail : message}
          </p>
        ) : null}

        {channel === null ? (
          <form action={sendStepUpCode} className="flex flex-col gap-4">
            {hidden}
            <input type="hidden" name="channel" value="whatsapp" />
            <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">{m.account.verifyLead}</p>
            <SubmitButton className={button}>
              {m.account.sendCodeWhatsapp}
            </SubmitButton>
          </form>
        ) : (
          <>
            <p className="text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">
              {channel === "email"
                ? sentLine(m.account.verifySentEmail, customer.email ?? "")
                : addingEmail
                  ? sentLine(m.account.addEmailVerifyLead, `•••• ${customer.phone.slice(-4)}`)
                  : sentLine(m.account.verifySentWhatsapp, customer.phone)}
            </p>
            <form action={confirmStepUpCode} className="mt-6 flex flex-col gap-4">
              {hidden}
              <input type="hidden" name="channel" value={channel} />
              <label className="flex flex-col gap-2 lg:max-w-[420px]">
                <span className="text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">{addingEmail && channel === "whatsapp" ? m.account.addEmailWhatsappCode : m.account.code}</span>
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
              <SubmitButton className={button}>
                {m.account.verifyCode}
              </SubmitButton>
            </form>
            {/* A POST: each resend is a real message. */}
            <form action={sendStepUpCode} className="mt-4 flex flex-wrap items-center gap-2">
              {hidden}
              <input type="hidden" name="channel" value={channel} />
              <span className="text-body-s font-semibold text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.noCode}</span>
              <SubmitButton className="text-body-s font-semibold text-[var(--color-brand-500)] underline lg:text-body-l">
                {m.account.resendCode}
              </SubmitButton>
            </form>
          </>
        )}

        {/* «لا يمكنك الوصول لرقمك الحالي؟» — only when there is a proved
            email to send to; otherwise the honest answer is support. */}
        {channel !== "email" ? (
          customer.email_verified ? (
            <form action={sendStepUpCode} className="mt-6">
              {hidden}
              <input type="hidden" name="channel" value="email" />
              <SubmitButton className="text-body-s font-semibold text-[var(--color-error)] underline lg:text-body-l">
                {m.account.noAccessToPhone} {m.account.sendCodeEmail}
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-6 text-body-s text-[var(--color-ink-muted)] lg:text-body-l">
              {m.account.noAccessToPhone} {m.account.noVerifiedEmail}
            </p>
          )
        ) : null}
      </AccountCard>
    </AccountShell>
  );
}
