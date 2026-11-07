import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { requireCustomer } from "@/lib/account/guard";
import { setTwoFactor } from "@/lib/account/security-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.twoFactorTitle } : {};
}

/**
 * «التأكيد الثنائي» — Figma `6847:80318` (off) / `6847:81337` (on): what it
 * guards, and one button. Either direction asks for a step-up first (the API
 * refuses otherwise); the verify screen then finishes the switch and comes
 * back here with `done`.
 *
 * WHAT THE LIST SAYS, AND WHY IT IS NOT THE COMP'S WORDING. The comp says the
 * saved accounts protect "your password in your games". They cannot: the store
 * refuses to keep a game password there (only player IDs), so the line says
 * what is actually kept. The comp's third bullet repeats its second and is not
 * drawn twice.
 */
export default async function TwoFactorPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { customer } = await requireCustomer(locale, `/${locale}/account/settings/security/two-factor`);
  const { done, error } = await props.searchParams;
  const m = messagesFor(locale);
  const on = customer.two_factor_enabled === true;

  return (
    <AccountShell locale={locale} active="settings">
      <AccountCard title={m.account.twoFactorTitle}>
        {done === "enabled" ? (
          <p role="status" className="cq-notice-auto mb-4 rounded-[12px] bg-[var(--color-success-wash)] px-4 py-3 text-body-l font-bold text-[var(--color-success)] lg:text-heading-m">
            {m.account.twoFactorEnabled}
          </p>
        ) : null}
        {done === "disabled" ? (
          <div role="status" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3">
            <p className="text-body-l font-bold text-[var(--color-error)] lg:text-heading-m">{m.account.twoFactorDisabled}</p>
            <p className="mt-1 text-body-s font-medium lg:text-body-l text-[var(--color-ink)]">{m.account.twoFactorDisabledWarning}</p>
          </div>
        ) : null}
        {error === "1" ? (
          <p role="alert" className="mb-4 rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-semibold text-[var(--color-error)] lg:text-body-l">
            {m.account.saveFailed}
          </p>
        ) : null}

        <p className="text-body-s font-semibold text-[var(--color-ink)] lg:text-body-l">{m.account.twoFactorIntro}</p>
        <ul className="mt-3 list-disc space-y-2 ps-6 text-body-s font-semibold text-[var(--color-ink-muted)] lg:text-body-l">
          <li>{m.account.twoFactorPointWallet}</li>
          <li>{m.account.twoFactorPointSaved}</li>
        </ul>
        <p className="mt-3 text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.twoFactorWindow}</p>

        {on ? <p className="mt-6 text-body-s font-semibold text-[var(--color-success)] lg:text-body-l">{m.account.twoFactorOn}</p> : null}

        <form action={setTwoFactor} className="mt-6">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="enable" value={on ? "0" : "1"} />
          {on ? (
            <SubmitButton
              className="h-[52px] w-full rounded-[12px] border border-[var(--color-error)] text-body-l font-semibold lg:text-heading-m text-[var(--color-error)] lg:max-w-[420px]"
            >
              {m.account.disableTwoFactor}
            </SubmitButton>
          ) : (
            <SubmitButton
              className="h-[52px] w-full rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-semibold lg:text-heading-m text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] lg:max-w-[420px]"
            >
              {m.account.enableTwoFactor}
            </SubmitButton>
          )}
        </form>
      </AccountCard>
    </AccountShell>
  );
}
