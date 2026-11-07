import { notFound } from "next/navigation";

import { AccountCard } from "@/components/account/AccountShell";
import { SavedAccountForm } from "@/components/account/SavedAccountForm";
import type { CategoryField } from "@/components/checkout/CustomFields";
import { savableFields } from "@/lib/account/saved-accounts";
import { templateSummary } from "@/lib/account/saved-accounts-view";
import { listCategories } from "@/lib/catalog/queries";
import { categoryArt, categoryByPublicId } from "@/lib/catalog/tree";
import { isSensitiveField } from "@/lib/fields/sensitive";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/** «الخطوة ١ من ٢» and its two-part progress bar (board 3/4). */
export function StepHeader({ step, caption }: { step: 1 | 2; caption: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-bold text-[var(--color-ink-subtle)]">{caption}</p>
      <div aria-hidden className="grid grid-cols-2 gap-1.5">
        <span className="h-1 rounded-full bg-[var(--color-brand-500)]" />
        <span className={`h-1 rounded-full ${step === 2 ? "bg-[var(--color-brand-500)]" : "bg-[var(--color-line)]"}`} />
      </div>
    </div>
  );
}

/**
 * Step 2 — one game's template as a form, for a new account or one being
 * changed. The fields are read from TODAY'S catalogue (the category the
 * product page reads them from), only those an account may hold; a game the
 * store no longer shows, or one with nothing to save, is a 404.
 */
export async function AccountFormStep({
  locale,
  gamePublicId,
  error,
  changeGameHref = null,
  account,
}: {
  locale: Locale;
  gamePublicId: string;
  error?: string;
  changeGameHref?: string | null;
  account?: { id: string; label: string | null; values: Record<string, string> };
}) {
  const m = messagesFor(locale);
  const categories = await listCategories({ locale });
  const category = categoryByPublicId(categories, gamePublicId);
  const all = (category?.fields ?? []) as CategoryField[];
  const fields = savableFields(all);
  if (!category || fields.length === 0) notFound();

  const name = category.name?.[locale] || category.name?.en || category.slug;
  const problem =
    error === "missing" ? m.account.accountMissing : error === "full" ? m.account.accountFull : error === "failed" ? m.account.accountFailed : null;

  return (
    <AccountCard title={account ? m.account.editAccountTitle : m.account.addAccount}>
      <div className="flex flex-col gap-5">
        {account ? null : <StepHeader step={2} caption={m.account.addStepDetails} />}
        <SavedAccountForm
          locale={locale}
          game={{ publicId: gamePublicId, name, art: categoryArt(categories, category)?.url ?? null, template: templateSummary(all, locale) }}
          accountId={account?.id ?? null}
          fields={fields}
          initialValues={account?.values ?? {}}
          initialLabel={account?.label ?? null}
          problem={problem}
          asksForPassword={all.some(isSensitiveField)}
          changeGameHref={changeGameHref}
          cancelHref={`/${locale}/account/saved-accounts`}
        />
      </div>
    </AccountCard>
  );
}
