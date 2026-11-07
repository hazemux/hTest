import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { requireCustomer } from "@/lib/account/guard";
import { setTwoFactor } from "@/lib/account/security-actions";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.privacy } : {};
}

/**
 * «الخصوصية و الامان» — Figma `6847:89695`: the title, then one row per
 * security screen, each its 20px glyph and its words (Body/Regular 14),
 * 16 apart; at the foot, while two-step verification is off, the yellow
 * «التأكيد الثنائي غير مفعل» card (`6847:89816`).
 *
 * «تغيير رقم الهاتف», «التأكيد الثنائي» and the verify step behind them are
 * the sign-in work's (v0.1.60); «تغيير الايميل» is the profile's own
 * two-step email form.
 */
export default async function SecurityPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const { customer } = await requireCustomer(locale, `/${locale}/account/settings/security`);
  const base = `/${locale}/account`;

  const rows = [
    { href: `${base}/settings/security/password`, icon: "/brand/icon-security-lock.svg", label: m.account.securityChangePassword },
    { href: `${base}/settings/security/phone`, icon: "/brand/icon-security-phone.svg", label: m.account.phoneTitle },
    { href: `${base}/profile#email`, icon: "/brand/icon-security-email.svg", label: m.account.securityChangeEmail },
    { href: `${base}/settings/security/two-factor`, icon: "/brand/icon-security-2fa.svg", label: m.account.twoFactorTitle },
    // «مفاتيح المرور» (v0.1.61) — no comp; the lock glyph, like the password row.
    { href: `${base}/settings/security/passkeys`, icon: "/brand/icon-security-lock.svg", label: m.account.passkeys },
    { href: `${base}/settings/security/delete`, icon: "/brand/icon-security-delete.svg", label: m.account.securityDelete },
  ];

  return (
    <AccountShell locale={locale} active="settings">
      <div className="flex flex-col gap-5">
        <h2 className="text-body-l font-semibold leading-[1.5] text-[var(--color-ink)] lg:text-heading-l lg:font-bold">{m.account.privacy}</h2>
        <ul className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.href}>
              <Link href={row.href} className="flex items-center gap-3 text-body-s leading-[1.5] lg:text-body-l text-[var(--color-ink)] hover:text-[var(--color-brand-500)]">
                <span
                  aria-hidden
                  className="block size-5 shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]"
                  style={{ maskImage: `url(${row.icon})`, WebkitMaskImage: `url(${row.icon})` }}
                />
                <span className="min-w-0 flex-1">{row.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {customer.two_factor_enabled ? null : (
          <section
            aria-labelledby="two-factor-off"
            className="mt-10 flex flex-col overflow-hidden rounded-[12px] border border-[var(--color-secondary)] lg:max-w-[480px]"
          >
            <div className="flex items-center gap-2.5 rounded-[12px] bg-[var(--color-secondary)] px-2.5 py-4 text-[var(--color-on-secondary)]">
              <span aria-hidden className="block size-8 shrink-0 bg-current [mask-image:url(/brand/icon-security-2fa-filled.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              <h3 id="two-factor-off" className="text-body-l font-semibold leading-[1.5] lg:text-heading-m">
                {m.account.twoFactorOffTitle}
              </h3>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <p className="text-body-s font-semibold leading-[1.5] text-[var(--color-ink-subtle)] lg:text-body-l">{m.account.twoFactorOffLead}</p>
              <div className="grid grid-cols-2 gap-3">
                <form action={setTwoFactor}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="enable" value="1" />
                  <SubmitButton
                    className="w-full rounded-[8px] bg-[var(--color-secondary)] px-6 py-3 text-body-s font-semibold text-[var(--color-on-secondary)] lg:text-body-l transition hover:bg-[var(--color-secondary-hover)]"
                  >
                    {m.account.enableTwoFactor}
                  </SubmitButton>
                </form>
                <Link
                  href={`${base}/settings/security/two-factor`}
                  className="rounded-[8px] border border-[var(--color-divider)] px-6 py-3 text-center text-body-s font-semibold lg:text-body-l text-[var(--color-ink)]"
                >
                  {m.account.learnMore}
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </AccountShell>
  );
}
