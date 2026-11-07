import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { ProfileCard } from "@/components/account/ProfileCard";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { isAuthErrorCode } from "@/lib/account/errors";
import { avatarsForPage, placeForProfile } from "@/lib/account/profile-choices";
import { requireCustomer } from "@/lib/account/guard";
import { saveState } from "@/lib/account/save-state";
import { isLocale } from "@/lib/i18n/locales";
import { isStockAlertResumePath } from "@/lib/stock-alerts/after-email";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; problem?: string; email?: string; sheet?: string; next?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.personalInfo } : {};
}

/** «المعلومات الشخصية» as its own page — the phone's row, and the save target of its two forms. */
export default async function ProfilePage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { customer } = await requireCustomer(locale, `/${locale}/account/profile`);
  const m = messagesFor(locale);
  const params = await props.searchParams;

  return (
    <AccountShell locale={locale} active="personalInfo">
      {/* On the phone a focused page («Profile Mobile»): its own bar, no tab bar (`SiteChrome`). */}
      <CheckoutHeader locale={locale} title={m.account.personalInfo} backHref={`/${locale}/account`} phoneOnly />
      <ProfileCard
        locale={locale}
        customer={customer}
        avatars={await avatarsForPage(locale)}
        place={await placeForProfile(customer, locale)}
        state={saveState(params)}
        // Only one of OUR codes is shown; anything else in the URL is ignored,
        // so a crafted link cannot put its own words on this page.
        problem={params.problem && isAuthErrorCode(params.problem) ? params.problem : null}
        emailConfirmed={params.email === "confirmed"}
        sheet={params.sheet === "avatar" || params.sheet === "email" ? params.sheet : null}
        // «نبهني عند التوفير» sent them here: only this site's resume page counts.
        stockAlertNext={isStockAlertResumePath(locale, params.next) ? params.next : null}
      />
    </AccountShell>
  );
}
