import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { WalletPage, type WalletSearch } from "@/components/loyalty/wallet/WalletPage";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<WalletSearch> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).loyalty.wallet.tabs.topup } : {};
}

/**
 * «شحن الرصيد» by bank transfer (ADR 0043 §2): choose an amount (creating the
 * top-up), then — at `?id=TU-…` — our account snapshot and the reference, the
 * receipt, and where the top-up stands. Hidden entirely (the overview shows
 * instead) while `features.topup` is off — never «قريباً».
 */
export default async function TopUpPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <WalletPage locale={locale} tab="topup" search={await props.searchParams} />;
}
