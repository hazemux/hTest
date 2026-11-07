import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { EMAIL_ADDED_COOKIE } from "@/lib/account/add-email-flow";
import { requireCustomer } from "@/lib/account/guard";
import { headerViewer } from "@/lib/account/header-viewer";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.addEmailDoneTitle } : {};
}

/**
 * «تمت إضافة بريدك» — the end of the add-email flow (owner, 2026-10-27;
 * Claude Design canvas «Add email flow», board 4).
 *
 * Shown ONLY right after the flow (a ten-minute cookie the last step sets) and
 * for an account whose email the API reports proved: success is never drawn
 * before the server says so (design system README), so an early or stale
 * visit goes to the profile instead. The points line is the
 * programme's own `profile_email` reward, and only when it has one.
 */
export default async function AddEmailDonePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { customer } = await requireCustomer(locale, `/${locale}/account/profile/email/done`);
  const justAdded = (await cookies()).get(EMAIL_ADDED_COOKIE)?.value === "1";
  if (!justAdded || !(customer.email && customer.email_verified === true)) redirect(`/${locale}/account/profile#email`);

  const m = messagesFor(locale).account;
  const reward = (await headerViewer(locale)).emailRewardPts;
  const points = reward === null ? null : reward.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
  const [pointsBefore, pointsAfter] = m.addEmailDonePoints.split("{points}");

  return (
    <AccountShell locale={locale} active="personalInfo">
      <AccountCard title={m.addEmailDoneTitle}>
        <div className="flex flex-col items-center gap-4 py-6 text-center lg:mx-auto lg:max-w-[420px]">
          <span aria-hidden className="grid size-20 place-items-center rounded-full bg-[var(--color-success-wash)] text-[var(--color-success-strong)]">
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div role="status" className="flex flex-col gap-1">
            <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.addEmailDoneLead}</p>
            <bdi dir="ltr" className="text-body-m font-bold text-[var(--color-ink)] lg:text-body-l">
              {customer.email}
            </bdi>
          </div>
          {points ? (
            <p className="flex items-center gap-3 rounded-[16px] px-4 py-3.5 text-start text-body-s shadow-[inset_0_0_0_1px_var(--color-line)] lg:text-body-m">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-warning-wash)]">
                <span className="block size-5 bg-[var(--color-warning-strong)] [mask-image:url(/brand/icon-star.svg)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />
              </span>
              <span>
                {pointsBefore}
                <b>{points}</b>
                {pointsAfter}
              </span>
            </p>
          ) : null}
          <div className="mt-2 flex w-full flex-col gap-2">
            <Link
              href={`/${locale}`}
              className="grid h-[52px] place-items-center rounded-[12px] bg-[var(--color-brand-500)] text-body-m font-bold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-hover)]"
            >
              {m.addEmailDoneShop}
            </Link>
            <Link href={`/${locale}/account`} className="grid h-11 place-items-center text-body-s font-bold text-[var(--color-brand-500)]">
              {m.addEmailDoneAccount}
            </Link>
          </div>
        </div>
      </AccountCard>
    </AccountShell>
  );
}
