import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountShell } from "@/components/account/AccountShell";
import { AccountSheet } from "@/components/account/AccountSheet";
import { requireCustomer } from "@/lib/account/guard";
import { requestClosureCodesAction, type DeleteProblem } from "@/lib/account/password-and-deletion-actions";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ confirm?: string; problem?: string }>;
};

const PROBLEMS: readonly DeleteProblem[] = ["open_orders", "failed"];

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.deleteTitle } : {};
}

/**
 * «حذف الحساب» — Figma `6847:90182`: the title (Heading/SemiBold 18), three
 * warnings each with a 12px red dot, and the red «تأكيد الحذف» button. The
 * button opens the confirmation sheet `6847:89940` (`?confirm=1`, so it is a
 * plain link and the sheet renders without JavaScript); only the sheet's own
 * «تأكيد الحذف» posts.
 *
 * The sheet's «تأكيد الحذف» sends the code closing takes — on WhatsApp, the
 * only one since v0.1.167 — and opens `delete/code`, which takes it. A
 * refusal before that comes back here as `?problem=`: an order still open.
 * Nothing is sent or changed then.
 */
export default async function DeleteAccountPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  await requireCustomer(locale, `/${locale}/account/settings/security/delete`);
  const params = await props.searchParams;
  const problem = PROBLEMS.find((p) => p === params.problem) ?? null;
  const here = `/${locale}/account/settings/security/delete`;

  return (
    <AccountShell locale={locale} active="settings">
      <div className="flex flex-col gap-6">
        <h2 className="text-heading-m font-semibold leading-[1.4] text-[var(--color-ink)] lg:text-heading-l lg:font-bold">{m.account.deleteTitle}</h2>

        <ul className="flex flex-col gap-4">
          {[m.account.deleteBullet1, m.account.deleteBullet2, m.account.deleteBullet3].map((line) => (
            <li key={line} className="flex items-center gap-2 text-body-s font-semibold leading-[1.5] lg:text-body-l text-[var(--color-ink)]">
              <span aria-hidden className="size-3 shrink-0 rounded-full bg-[var(--color-error)]" />
              <span className="min-w-0 flex-1">{line}</span>
            </li>
          ))}
        </ul>

        {problem ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-[8px] bg-[var(--color-error-subtlest)] p-3 text-body-s font-semibold leading-[1.5] lg:text-body-l text-[var(--color-error)]">
            <p>{problem === "open_orders" ? m.account.deleteOpenOrders : m.account.deleteFailed}</p>
          </div>
        ) : null}

        <Link
          href={`${here}?confirm=1`}
          scroll={false}
          className="mt-10 flex h-12 w-full items-center justify-center rounded-[8px] bg-[var(--color-error)] px-6 text-body-l font-semibold text-white lg:text-heading-m lg:max-w-[420px]"
        >
          {m.account.deleteConfirm}
        </Link>
      </div>

      {params.confirm === "1" ? <ConfirmSheet locale={locale} back={here} /> : null}
    </AccountShell>
  );
}

/**
 * `6847:89940`'s popup: the illustration tile, «سيتم حذف حسابك» in error
 * Bold 16, the question, then «رجوع» (primary) at the start and «تأكيد
 * الحذف» (error) at the end, equal halves 16 apart.
 */
function ConfirmSheet({ locale, back }: { locale: Locale; back: string }) {
  const m = messagesFor(locale);

  return (
    <AccountSheet
      closeHref={back}
      closeLabel={m.account.close}
      labelledBy="delete-account-title"
      title={m.account.deleteSheetTitle}
      lead={m.account.deleteSheetQuestion}
      tone="error"
    >
      <Link
        href={back}
        scroll={false}
        className="block min-w-0 rounded-[12px] bg-[var(--color-brand-500)] px-6 py-4 text-center text-body-s font-semibold text-[var(--color-on-primary)]"
      >
        {m.account.deleteSheetBack}
      </Link>
      <form action={requestClosureCodesAction} className="min-w-0">
        <input type="hidden" name="locale" value={locale} />
        <SubmitButton className="w-full rounded-[12px] bg-[var(--color-error)] px-6 py-4 text-body-s font-semibold text-white">
          {m.account.deleteConfirm}
        </SubmitButton>
      </form>
    </AccountSheet>
  );
}
