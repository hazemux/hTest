"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CustomFields, type CategoryField } from "@/components/checkout/CustomFields";
import { ArtworkPlaceholder } from "@/components/ui/ArtworkPlaceholder";
import { FIELD_CONTROL_CLASS } from "@/components/ui/field-control";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { saveSavedAccount } from "@/lib/account/saved-account-actions";
import type { FieldValues } from "@/lib/fields/visible-when";
import type { Locale } from "@/lib/i18n/locales";
import { messagesFor } from "@/lib/i18n/messages";

/**
 * «إضافة حساب» / «تعديل الحساب», step 2 (Claude Design «Saved accounts —
 * ChargerQuick», board 4, approved 2026-10-10): the game, its TEMPLATE's
 * fields as the product page asks them — the same `CustomFields`, so a
 * conditional field (`visible_when`) appears and goes exactly as it does
 * there — and the account's name. Only fields an account may hold arrive
 * here (`savableFields`): the page says where the password goes instead.
 */
export function SavedAccountForm({
  locale,
  game,
  accountId = null,
  fields,
  initialValues = {},
  initialLabel = null,
  problem = null,
  asksForPassword = false,
  changeGameHref = null,
  cancelHref,
}: {
  locale: Locale;
  game: { publicId: string; name: string; art: string | null; template: string };
  /** The account being changed; null for a new one. */
  accountId?: string | null;
  fields: CategoryField[];
  initialValues?: Record<string, string>;
  initialLabel?: string | null;
  /** Why the last save was refused, already worded. */
  problem?: string | null;
  /** Whether the game's template also takes a password — then the page says it is asked on every order. */
  asksForPassword?: boolean;
  /** Back to step 1; null while editing (an account keeps its game). */
  changeGameHref?: string | null;
  cancelHref: string;
}) {
  const m = messagesFor(locale);
  const [values, setValues] = useState<FieldValues>(initialValues);
  const [label, setLabel] = useState(initialLabel ?? "");
  const suggestions = [m.account.nameMine, m.account.nameBrother, m.account.nameFriend];

  return (
    <form action={saveSavedAccount} className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="game" value={game.publicId} />
      {accountId ? <input type="hidden" name="account" value={accountId} /> : null}

      {problem ? (
        <p role="alert" className="rounded-[12px] bg-[var(--color-error-wash)] px-4 py-3 text-body-s font-bold text-[var(--color-error-strong)] lg:text-body-l">
          {problem}
        </p>
      ) : null}

      <section className="flex items-center gap-3 rounded-[16px] p-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <GameArt name={game.name} art={game.art} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-body-l font-bold text-[var(--color-ink)]">{game.name}</p>
          <p className="truncate text-caption font-medium text-[var(--color-ink-subtle)]">{game.template}</p>
        </div>
        {changeGameHref ? (
          <Link href={changeGameHref} className="flex h-9 shrink-0 items-center rounded-[10px] px-3 text-body-s font-bold text-[var(--color-brand-500)]">
            {m.account.changeGame}
          </Link>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-[16px] p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <CustomFields
          locale={locale}
          fields={fields}
          values={values}
          onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          namePrefix="field_"
          invalidText={(_, fieldLabel) => m.product.fieldRequired.replace("{field}", fieldLabel)}
        />
        {asksForPassword ? (
          <p className="flex items-start gap-2 rounded-[12px] bg-[var(--color-chip)] px-3.5 py-3 text-body-s font-medium leading-[1.6] text-[var(--color-ink-muted)]">
            <Mask src="/brand/icon-lock.svg" className="mt-1 size-4" />
            {m.account.formPasswordNote}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2.5 rounded-[16px] p-4 shadow-[inset_0_0_0_1px_var(--color-line)]">
        <label htmlFor="saved-account-name" className="text-body-s font-bold text-[var(--color-ink)]">
          {m.account.accountName} <span className="font-medium text-[var(--color-ink-subtle)]">{m.account.optional}</span>
        </label>
        <input
          id="saved-account-name"
          name="label"
          maxLength={40}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={m.account.accountNamePlaceholder}
          className={FIELD_CONTROL_CLASS}
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              aria-pressed={label === suggestion}
              onClick={() => setLabel(suggestion)}
              className="h-8 rounded-full bg-[var(--color-chip)] px-3 text-caption font-bold text-[var(--color-ink)] aria-pressed:bg-[var(--color-primary-wash-light)] aria-pressed:text-[var(--color-brand-500)]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2 lg:flex-row-reverse lg:justify-start">
        <SubmitButton className="flex h-[52px] items-center justify-center gap-2 rounded-[12px] bg-[var(--color-brand-500)] px-8 text-body-l font-semibold text-[var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)]">
          <Mask src="/brand/icon-check.svg" className="size-[18px]" />
          {m.account.saveAccount}
        </SubmitButton>
        <Link href={cancelHref} className="flex h-11 items-center justify-center px-6 text-body-s font-bold text-[var(--color-ink-muted)]">
          {m.account.cancelAccount}
        </Link>
      </div>
    </form>
  );
}

/** A game's card art at 48px, or the letter placeholder. */
export function GameArt({ name, art, size = 48 }: { name: string; art: string | null; size?: number }) {
  return (
    <span className="relative shrink-0 overflow-hidden rounded-[12px] bg-[var(--color-surface-subtle)]" style={{ width: size, height: size }}>
      {art ? (
        <Image src={art} alt="" aria-hidden fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <ArtworkPlaceholder name={name} className="[&>span]:!text-heading-m" />
      )}
    </span>
  );
}

/** A Hicon glyph painted in the text colour (ADR 0018). */
export function Mask({ src, className = "size-5" }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] ${className}`}
      style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }}
    />
  );
}
