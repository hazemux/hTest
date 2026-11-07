import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AccountCard, AccountShell, SaveNotice } from "@/components/account/AccountShell";
import { GameArt, Mask } from "@/components/account/SavedAccountForm";
import { StepUpPrompt } from "@/components/account/StepUpPrompt";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { requireCustomer } from "@/lib/account/guard";
import { forgetSavedAccount } from "@/lib/account/saved-account-actions";
import { SAVED_ACCOUNTS_PER_GAME } from "@/lib/account/saved-accounts";
import { savedGames, type GameView } from "@/lib/account/saved-accounts-view";
import { saveState } from "@/lib/account/save-state";
import { ApiError, listSavedFields } from "@/lib/api/client";
import { listCategories } from "@/lib/catalog/queries";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  return isLocale(locale) ? { title: messagesFor(locale).account.savedAccounts } : {};
}

/**
 * «حساباتك المحفوظة» (Claude Design «Saved accounts — ChargerQuick», boards
 * 1, 2 and 6, approved 2026-10-10) — the customer's saved ACCOUNTS (v0.1.117)
 * game by game: each account its name and every value its game's template
 * asks for, with «تعديل» and «حذف»; each game «اشحن الآن» and «حساب آخر
 * لهذه اللعبة»; «إضافة حساب» for any game.
 *
 * Never a credential: the API refuses one, and a field that is (or has since
 * become) a password, an upload or a confirmation is not drawn. Neither is a
 * game the store no longer shows — those rows stay saved, just unseen.
 */
export default async function SavedAccountsPage(props: Props) {
  // Per request, always: this page is somebody's account.
  await connection();
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();

  const m = messagesFor(locale);
  const here = `/${locale}/account/saved-accounts`;
  const { token } = await requireCustomer(locale, here);
  const [saved, categories] = await Promise.all([
    listSavedFields({ locale, bearerToken: token }).then(
      (list) => ({ rows: list, stepUpRequired: false }),
      // «التأكيد الثنائي» is on and this session has not confirmed with a
      // code yet — a prompt, not "could not load".
      (error: unknown) => ({ rows: null, stepUpRequired: error instanceof ApiError && error.stepUpRequired }),
    ),
    listCategories({ locale }),
  ]);

  if (saved.stepUpRequired) {
    return (
      <AccountShell locale={locale} active="savedAccounts">
        <StepUpPrompt locale={locale} title={m.account.savedAccounts} next={here} />
      </AccountShell>
    );
  }

  const games = saved.rows === null ? null : savedGames(Array.isArray(saved.rows) ? saved.rows : [], categories, locale);
  const add = `${here}/new`;

  return (
    <AccountShell locale={locale} active="savedAccounts">
      <AccountCard
        title={m.account.savedAccounts}
        aside={
          games && games.length > 0 ? (
            <Link
              href={add}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--color-brand-500)] px-3.5 text-body-s font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] lg:h-11 lg:px-[18px] lg:text-body-l"
            >
              <Mask src="/brand/icon-add-circle.svg" className="size-[18px]" />
              {m.account.addAccount}
            </Link>
          ) : null
        }
      >
        <SaveNotice state={saveState(await props.searchParams)} locale={locale} />

        {games === null ? (
          <p className="text-body-s text-[var(--color-ink-muted)] lg:text-body-l">{m.account.sectionUnavailable}</p>
        ) : games.length === 0 ? (
          <EmptyState locale={locale} add={add} />
        ) : (
          <div className="flex flex-col gap-4 lg:gap-6">
            <section className="flex items-start gap-3 rounded-[16px] bg-[var(--color-primary-wash-lighter)] px-4 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--color-surface-raised)] text-[var(--color-brand-500)]">
                <Mask src="/brand/icon-quick-buy.svg" className="size-[22px]" />
              </span>
              <div className="flex flex-col gap-1">
                <p className="text-body-m font-bold leading-[1.5] text-[var(--color-ink)]">{m.account.savedAccountsLeadTitle}</p>
                <p className="text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)]">{m.account.savedAccountsLead}</p>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              {games.map((game) => (
                <GameCard key={game.publicId} locale={locale} game={game} add={add} />
              ))}
            </div>
          </div>
        )}
      </AccountCard>
    </AccountShell>
  );
}

function GameCard({ locale, game, add }: { locale: Locale; game: GameView; add: string }) {
  const m = messagesFor(locale);
  return (
    <section aria-label={game.name} className="flex flex-col overflow-hidden rounded-[16px] bg-[var(--color-surface-raised)] shadow-[0_0_12px_rgba(0,0,0,0.07)]">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <GameArt name={game.name} art={game.art} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="line-clamp-2 text-body-l font-bold leading-[1.4] text-[var(--color-ink)]">{game.name}</p>
          <p className="line-clamp-2 text-caption font-medium text-[var(--color-ink-subtle)]">
            {game.template} ·{" "}
            {m.account.accountsOfMax.replace("{count}", String(game.accounts.length)).replace("{max}", String(SAVED_ACCOUNTS_PER_GAME))}
          </p>
        </div>
        <Link
          href={game.href}
          className="flex h-9 shrink-0 items-center rounded-full bg-[var(--color-primary-wash-light)] px-3 text-caption font-bold text-[var(--color-brand-500)] lg:text-body-s"
        >
          {m.account.topUpNow}
        </Link>
      </div>

      <ul className="border-t border-[var(--color-divider)]">
        {game.accounts.map((account) => {
          const name = account.label ?? m.account.unnamedAccount;
          return (
            <li key={account.id} className="flex flex-col gap-1 border-b border-[var(--color-divider)] px-4 py-3 last:border-b-0">
              <div className="flex items-center gap-3">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-chip)] text-body-s font-extrabold text-[var(--color-ink)]">
                {account.label ? Array.from(account.label)[0] : <Mask src="/brand/icon-menu-profile.svg" className="size-[18px] text-[var(--color-ink-subtle)]" />}
              </span>
              <p className={`min-w-0 flex-1 truncate text-body-m font-bold ${account.label ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}>{name}</p>
              <Link
                href={`/${locale}/account/saved-accounts/${account.id}`}
                aria-label={m.account.editAccount.replace("{name}", name)}
                className="grid size-10 shrink-0 place-items-center rounded-[10px] text-[var(--color-ink-muted)] hover:bg-[var(--color-chip)] lg:size-11"
              >
                <Mask src="/brand/icon-edit.svg" />
              </Link>
              <form action={forgetSavedAccount}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="id" value={account.id} />
                <SubmitButton
                  aria-label={m.account.deleteAccount.replace("{name}", name)}
                  className="grid size-10 place-items-center rounded-[10px] text-[var(--color-danger)] hover:bg-[var(--color-error-wash)] lg:size-11"
                >
                  <Mask src="/brand/icon-trash-red.svg" />
                </SubmitButton>
              </form>
              </div>
              <div className="flex flex-col gap-0.5 ps-12">
                {account.lines.map((line) => (
                  <p key={line.label} className="flex flex-wrap gap-x-1.5 text-body-s leading-[1.5] text-[var(--color-ink-muted)]">
                    <span>{line.label}</span>
                    <bdi dir="ltr" className="min-w-0 font-bold text-[var(--color-ink)] [overflow-wrap:anywhere]">
                      {line.value}
                    </bdi>
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {game.full ? null : (
        <Link
          href={`${add}?game=${encodeURIComponent(game.publicId)}`}
          className="mx-4 mb-3.5 mt-auto flex min-h-12 items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-[var(--color-input-border)] text-body-s font-bold text-[var(--color-brand-500)]"
        >
          <Mask src="/brand/icon-add-circle.svg" className="size-[18px]" />
          {m.account.anotherForGame}
        </Link>
      )}
    </section>
  );
}

/** Board 2 — nothing saved yet: why it is worth it, and the way in. */
function EmptyState({ locale, add }: { locale: Locale; add: string }) {
  const m = messagesFor(locale);
  const perks = [
    { icon: "/brand/icon-quick-buy.svg", text: m.account.perkAutofill },
    { icon: "/brand/icon-menu-saved-accounts.svg", text: m.account.perkFriends },
    { icon: "/brand/icon-lock.svg", text: m.account.perkEncrypted },
  ];
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-4 rounded-[16px] px-6 py-10 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
        <span className="grid size-16 place-items-center rounded-full bg-[var(--color-primary-wash-light)] text-[var(--color-brand-500)]">
          <Mask src="/brand/icon-menu-saved-accounts.svg" className="size-8" />
        </span>
        <h3 className="text-heading-m font-bold text-[var(--color-ink)] lg:text-heading-l">{m.account.noSavedAccountsTitle}</h3>
        <p className="max-w-[320px] text-body-s font-medium leading-[1.7] text-[var(--color-ink-muted)] lg:text-body-l">{m.account.noSavedAccounts}</p>
        <Link
          href={add}
          className="flex h-[52px] w-full max-w-[320px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-brand-500)] text-body-l font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
        >
          <Mask src="/brand/icon-add-circle.svg" className="size-[18px]" />
          {m.account.addAccount}
        </Link>
        <p className="text-body-s text-[var(--color-ink-subtle)]">{m.account.orSaveAtPurchase}</p>
      </section>
      <ul className="flex flex-col gap-3 px-2">
        {perks.map((perk) => (
          <li key={perk.text} className="flex items-center gap-3 text-body-s font-medium text-[var(--color-ink-muted)] lg:text-body-l">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--color-primary-wash-lighter)] text-[var(--color-brand-500)]">
              <Mask src={perk.icon} className="size-4" />
            </span>
            {perk.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
