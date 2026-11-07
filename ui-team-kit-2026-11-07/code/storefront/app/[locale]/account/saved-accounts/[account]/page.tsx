import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { StepUpPrompt } from "@/components/account/StepUpPrompt";
import { requireCustomer } from "@/lib/account/guard";
import { groupSavedAccounts } from "@/lib/account/saved-accounts";
import { ApiError, listSavedFields } from "@/lib/api/client";
import { isPublicId } from "@/lib/api/public-id";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { AccountFormStep } from "../form-step";

type Props = {
  params: Promise<{ locale: string; account: string }>;
  searchParams: Promise<{ error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.editAccountTitle } : {};
}

/**
 * «تعديل الحساب» — one saved account, by its `account_id`, in its game's
 * template, its values and name filled in. An account that is not this
 * customer's (or no longer exists) is a 404: the list is read with their own
 * token, so another customer's id simply is not in it.
 */
export default async function EditSavedAccountPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale, account: accountId } = await props.params;
  if (!isLocale(locale) || !isPublicId(accountId)) notFound();
  const { error } = await props.searchParams;

  const m = messagesFor(locale);
  const here = `/${locale}/account/saved-accounts/${accountId}`;
  const { token } = await requireCustomer(locale, here);

  let rows: Awaited<ReturnType<typeof listSavedFields>> | null;
  try {
    rows = await listSavedFields({ locale, bearerToken: token });
  } catch (failure) {
    if (failure instanceof ApiError && failure.stepUpRequired) {
      return (
        <AccountShell locale={locale} active="savedAccounts">
          <StepUpPrompt locale={locale} title={m.account.editAccountTitle} next={here} />
        </AccountShell>
      );
    }
    throw failure;
  }

  const account = groupSavedAccounts(Array.isArray(rows) ? rows : []).find((each) => each.id === accountId);
  if (!account) notFound();

  return (
    <AccountShell locale={locale} active="savedAccounts">
      <AccountFormStep locale={locale} gamePublicId={account.categoryPublicId} error={error} account={account} />
    </AccountShell>
  );
}
