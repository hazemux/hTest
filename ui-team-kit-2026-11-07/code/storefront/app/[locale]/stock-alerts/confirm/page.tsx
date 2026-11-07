import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { GuestStockAlertTokenPage } from "@/components/catalog/GuestStockAlertTokenPage";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string | string[]; state?: string; slug?: string; pack?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  // Never indexed — also by `X-Robots-Tag` (next.config.ts, PRIVATE_ROUTES).
  return isLocale(locale) ? { title: messagesFor(locale).stockAlertGuest.confirmTitle, robots: { index: false, follow: false } } : {};
}

/** The confirmation mail's «confirm» link (owner, 2026-10-27): one button — see `GuestStockAlertTokenPage`. */
export default async function GuestStockAlertConfirmPage(props: Props) {
  // Per request, always: the token and the outcome are in the query.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const { token, state, slug, pack } = await props.searchParams;
  return <GuestStockAlertTokenPage locale={locale} kind="confirm" token={typeof token === "string" ? token : ""} state={state} slug={slug} pack={pack} />;
}
