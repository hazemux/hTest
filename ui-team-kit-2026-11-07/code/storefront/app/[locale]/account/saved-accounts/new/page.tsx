import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell } from "@/components/account/AccountShell";
import { GameArt, Mask } from "@/components/account/SavedAccountForm";
import { requireCustomer } from "@/lib/account/guard";
import { pickableGames } from "@/lib/account/saved-accounts-view";
import { isPublicId } from "@/lib/api/public-id";
import { listCategories } from "@/lib/catalog/queries";
import { isLocale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

import { AccountFormStep, StepHeader } from "../form-step";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ game?: string; q?: string; error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.addAccount } : {};
}

/**
 * «إضافة حساب» (Claude Design boards 3 and 4, approved 2026-10-10). Without
 * `?game=`: step 1, every game an account can be saved for, under its brand,
 * searchable by a plain GET form. With it: step 2, that game's template.
 *
 * Owner 2026-10-10: the board's «ألعاب اشتريتها» row is not drawn — an order
 * line names only its product, so it would cost a product read per line.
 */
export default async function NewSavedAccountPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { game, q = "", error } = await props.searchParams;

  const m = messagesFor(locale);
  const list = `/${locale}/account/saved-accounts`;
  const here = `${list}/new${game ? `?game=${encodeURIComponent(game)}` : ""}`;
  await requireCustomer(locale, here);

  if (isPublicId(game)) {
    return (
      <AccountShell locale={locale} active="savedAccounts">
        <AccountFormStep locale={locale} gamePublicId={game} error={error} changeGameHref={`${list}/new`} />
      </AccountShell>
    );
  }

  const groups = pickableGames(await listCategories({ locale }), locale, q.slice(0, 60));

  return (
    <AccountShell locale={locale} active="savedAccounts">
      <AccountCard title={m.account.addAccount}>
        <div className="flex flex-col gap-5">
          <StepHeader step={1} caption={m.account.addStepGame} />

          <form role="search" action={`${list}/new`} className="flex h-12 items-center gap-2.5 rounded-[12px] border border-[var(--color-input-border)] bg-[var(--color-field)] px-3.5">
            <Mask src="/brand/icon-search.svg" className="size-5 text-[var(--color-ink-subtle)]" />
            <label htmlFor="game-search" className="sr-only">
              {m.account.searchGames}
            </label>
            <input
              id="game-search"
              type="search"
              name="q"
              defaultValue={q}
              placeholder={m.account.searchGamesPlaceholder}
              className="w-0 min-w-0 flex-1 bg-transparent text-body-m text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
            />
          </form>

          <section className="flex flex-col gap-2.5">
            <h3 className="text-body-s font-bold text-[var(--color-ink-subtle)]">{m.account.allGames}</h3>
            {groups.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-[var(--color-input-border)] p-6 text-center text-body-s text-[var(--color-ink-muted)]">{m.account.noGamesFound}</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {groups.map((group) => (
                  <div key={group.brand} className="overflow-hidden rounded-[16px] bg-[var(--color-surface-raised)] shadow-[0_0_12px_rgba(0,0,0,0.07)]">
                    <p className="px-4 pb-1 pt-3 text-caption font-extrabold text-[var(--color-ink)]">{group.brand}</p>
                    {group.games.map((pick) => (
                      <Link
                        key={pick.publicId}
                        href={`${list}/new?game=${encodeURIComponent(pick.publicId)}`}
                        className="flex min-h-16 items-center gap-3 border-t border-[var(--color-divider)] px-4 py-2 first-of-type:border-t-0 hover:bg-[var(--color-chip)]"
                      >
                        <GameArt name={pick.name} art={pick.art} size={44} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="line-clamp-2 text-body-m font-bold leading-[1.4] text-[var(--color-ink)]">{pick.name}</span>
                          <span className="self-start rounded-[8px] bg-[var(--color-chip)] px-2 py-0.5 text-caption-xs font-bold leading-[1.5] text-[var(--color-ink-muted)]">{pick.template}</span>
                        </span>
                        <Mask src="/brand/icon-chevron-start.svg" className="size-4 text-[var(--color-ink-subtle)] ltr:-scale-x-100" />
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <p className="px-2 text-caption leading-[1.6] text-[var(--color-ink-subtle)]">{m.account.pickerNote}</p>
          </section>
        </div>
      </AccountCard>
    </AccountShell>
  );
}
