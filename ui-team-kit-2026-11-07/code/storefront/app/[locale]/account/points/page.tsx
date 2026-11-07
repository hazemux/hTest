import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { WalletPage, type WalletSearch } from "@/components/loyalty/wallet/WalletPage";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<WalletSearch> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).loyalty.wallet.title } : {};
}

/**
 * «المحفظة والنقاط» (ADR 0043, Claude Design `WalletHub`): the overview of
 * Charger Points and Charger Balance, and the history (`?tab=history`, with
 * `bucket`, `status` and `cursor` in the URL). The top-up has its own address,
 * `/account/points/top-up`; `?tab=topup` here draws the same.
 */
export default async function PointsPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const search = await props.searchParams;
  const tab = search.tab === "history" ? "history" : search.tab === "topup" ? "topup" : "overview";
  return <WalletPage locale={locale} tab={tab} search={search} />;
}
